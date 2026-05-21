const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const Campaign = require('../models/Campaign');
const Template = require('../models/Template');
const Lead = require('../models/Lead');
const logger = require('../config/logger');

// ─── GET CAMPAIGNS ────────────────────────────────────────────────────────────
exports.getCampaigns = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    type,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const filter = { owner: req.user._id };
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (search) filter.name = { $regex: search, $options: 'i' };

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 100);
  const skip = (pageNum - 1) * limitNum;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(limitNum)
      .populate('template', 'name subject type')
      .lean(),
    Campaign.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: campaigns,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── CREATE CAMPAIGN ──────────────────────────────────────────────────────────
exports.createCampaign = asyncHandler(async (req, res) => {
  const {
    name,
    type,
    template,
    leads,
    subject,
    fromName,
    fromEmail,
    replyTo,
    scheduledAt,
    settings,
    tags,
  } = req.body;

  if (!name) throw new AppError('Campaign name is required', 400);
  if (!type) throw new AppError('Campaign type is required', 400);

  const validTypes = ['email', 'sms', 'linkedin', 'sequence'];
  if (!validTypes.includes(type)) {
    throw new AppError(`Invalid type. Must be one of: ${validTypes.join(', ')}`, 400);
  }

  const campaign = await Campaign.create({
    name: name.trim(),
    type,
    template,
    leads: Array.isArray(leads) ? leads : [],
    subject,
    fromName,
    fromEmail,
    replyTo,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    settings: settings || {},
    tags: Array.isArray(tags) ? tags : [],
    status: 'draft',
    stats: {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
      unsubscribed: 0,
    },
    owner: req.user._id,
  });

  logger.info(`Campaign created: ${campaign._id}`);

  res.status(201).json({
    success: true,
    data: campaign,
    message: 'Campaign created successfully',
  });
});

// ─── GET CAMPAIGN ─────────────────────────────────────────────────────────────
exports.getCampaign = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user._id })
    .populate('template', 'name subject body type')
    .populate('leads', 'firstName lastName email companyName status');

  if (!campaign) throw new AppError('Campaign not found', 404);

  res.status(200).json({ success: true, data: campaign });
});

// ─── UPDATE CAMPAIGN ──────────────────────────────────────────────────────────
exports.updateCampaign = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user._id });
  if (!campaign) throw new AppError('Campaign not found', 404);

  if (campaign.status === 'running') {
    throw new AppError('Cannot edit a running campaign. Pause it first.', 400);
  }

  delete req.body.owner;
  delete req.body.stats;
  delete req.body.status; // Status changes via dedicated endpoints

  const updated = await Campaign.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );

  res.status(200).json({ success: true, data: updated, message: 'Campaign updated' });
});

// ─── DELETE CAMPAIGN ──────────────────────────────────────────────────────────
exports.deleteCampaign = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user._id });
  if (!campaign) throw new AppError('Campaign not found', 404);

  const deletableStatuses = ['draft', 'completed', 'paused', 'cancelled'];
  if (!deletableStatuses.includes(campaign.status)) {
    throw new AppError(
      `Cannot delete a ${campaign.status} campaign. Only draft, completed, or paused campaigns can be deleted.`,
      400
    );
  }

  await Campaign.findByIdAndDelete(req.params.id);

  logger.info(`Campaign deleted: ${req.params.id}`);

  res.status(200).json({ success: true, message: 'Campaign deleted successfully' });
});

// ─── SEND CAMPAIGN ────────────────────────────────────────────────────────────
exports.sendCampaign = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user._id });
  if (!campaign) throw new AppError('Campaign not found', 404);

  if (campaign.status === 'running') {
    throw new AppError('Campaign is already running', 409);
  }
  if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) {
    throw new AppError(`Cannot launch a ${campaign.status} campaign`, 400);
  }

  // Validate campaign has a template
  if (!campaign.template) {
    throw new AppError('Campaign must have a template before sending', 400);
  }

  // Validate campaign has leads
  if (!campaign.leads || campaign.leads.length === 0) {
    throw new AppError('Campaign must have at least one lead before sending', 400);
  }

  // Verify template exists
  const template = await Template.findById(campaign.template);
  if (!template) throw new AppError('Associated template not found', 404);

  // Fetch leads
  const leads = await Lead.find({
    _id: { $in: campaign.leads },
    createdBy: req.user._id,
  }).select('_id email firstName lastName companyName');

  if (leads.length === 0) {
    throw new AppError('No valid leads found for this campaign', 400);
  }

  // Enqueue one outreach job per lead
  const { outreachQueue } = require('../queues');
  const jobs = leads.map((lead) => ({
    name: 'send-outreach',
    data: {
      campaignId: campaign._id.toString(),
      leadId: lead._id.toString(),
      userId: req.user._id.toString(),
      templateId: template._id.toString(),
      recipientEmail: lead.email,
      recipientName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
      companyName: lead.companyName,
    },
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
    },
  }));

  await outreachQueue.addBulk(jobs);

  // Update campaign status
  await Campaign.findByIdAndUpdate(campaign._id, {
    status: 'running',
    startedAt: new Date(),
  });

  logger.info(
    `Campaign ${campaign._id} launched: ${leads.length} outreach jobs queued`
  );

  res.status(200).json({
    success: true,
    message: `Campaign launched. ${leads.length} emails queued.`,
    data: { campaignId: campaign._id, jobsQueued: leads.length },
  });
});

// ─── PAUSE CAMPAIGN ───────────────────────────────────────────────────────────
exports.pauseCampaign = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user._id });
  if (!campaign) throw new AppError('Campaign not found', 404);

  if (campaign.status !== 'running') {
    throw new AppError('Only running campaigns can be paused', 400);
  }

  await Campaign.findByIdAndUpdate(campaign._id, { status: 'paused', pausedAt: new Date() });

  logger.info(`Campaign paused: ${campaign._id}`);

  res.status(200).json({ success: true, message: 'Campaign paused successfully' });
});

// ─── GET CAMPAIGN STATS ───────────────────────────────────────────────────────
exports.getCampaignStats = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user._id }).select(
    'name status stats leads startedAt completedAt createdAt'
  );

  if (!campaign) throw new AppError('Campaign not found', 404);

  const { stats, leads } = campaign;
  const totalLeads = leads?.length || 0;

  // Compute derived metrics
  const openRate = stats.delivered > 0 ? ((stats.opened / stats.delivered) * 100).toFixed(1) : 0;
  const clickRate = stats.delivered > 0 ? ((stats.clicked / stats.delivered) * 100).toFixed(1) : 0;
  const replyRate = stats.delivered > 0 ? ((stats.replied / stats.delivered) * 100).toFixed(1) : 0;
  const deliveryRate =
    stats.sent > 0 ? ((stats.delivered / stats.sent) * 100).toFixed(1) : 0;

  res.status(200).json({
    success: true,
    data: {
      campaign: { _id: campaign._id, name: campaign.name, status: campaign.status },
      stats: {
        ...stats,
        totalLeads,
        openRate: Number(openRate),
        clickRate: Number(clickRate),
        replyRate: Number(replyRate),
        deliveryRate: Number(deliveryRate),
      },
    },
  });
});
