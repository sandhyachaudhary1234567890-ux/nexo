const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const Contact = require('../models/Contact');
const Pipeline = require('../models/Pipeline');
const Deal = require('../models/Deal');
const logger = require('../config/logger');

// ═══════════════════════════════════════════════════════════════════
//                         CONTACTS
// ═══════════════════════════════════════════════════════════════════

// ─── GET CONTACTS ────────────────────────────────────────────────────────────
exports.getContacts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const filter = { owner: req.user._id };

  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 100);
  const skip = (pageNum - 1) * limitNum;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [contacts, total] = await Promise.all([
    Contact.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Contact.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: contacts,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── CREATE CONTACT ───────────────────────────────────────────────────────────
exports.createContact = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, company, title, linkedinUrl, tags, notes } = req.body;

  if (!firstName) throw new AppError('First name is required', 400);

  // Duplicate check per user
  if (email) {
    const exists = await Contact.findOne({ email, owner: req.user._id });
    if (exists) throw new AppError('A contact with this email already exists', 409);
  }

  const contact = await Contact.create({
    firstName,
    lastName,
    email,
    phone,
    company,
    title,
    linkedinUrl,
    tags: Array.isArray(tags) ? tags : [],
    notes,
    activities: [],
    owner: req.user._id,
  });

  logger.info(`Contact created: ${contact._id}`);

  res.status(201).json({
    success: true,
    data: contact,
    message: 'Contact created successfully',
  });
});

// ─── GET CONTACT ─────────────────────────────────────────────────────────────
exports.getContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, owner: req.user._id });
  if (!contact) throw new AppError('Contact not found', 404);

  res.status(200).json({ success: true, data: contact });
});

// ─── UPDATE CONTACT ───────────────────────────────────────────────────────────
exports.updateContact = asyncHandler(async (req, res) => {
  // Protect ownership fields
  delete req.body.owner;
  delete req.body._id;

  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: req.body },
    { new: true, runValidators: true }
  );

  if (!contact) throw new AppError('Contact not found', 404);

  res.status(200).json({ success: true, data: contact, message: 'Contact updated' });
});

// ─── DELETE CONTACT ───────────────────────────────────────────────────────────
exports.deleteContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!contact) throw new AppError('Contact not found', 404);

  logger.info(`Contact deleted: ${req.params.id}`);

  res.status(200).json({ success: true, message: 'Contact deleted successfully' });
});

// ─── ADD CONTACT ACTIVITY ─────────────────────────────────────────────────────
exports.addContactActivity = asyncHandler(async (req, res) => {
  const { type, title, description, date } = req.body;

  if (!type || !title) throw new AppError('Activity type and title are required', 400);

  const validTypes = ['call', 'email', 'meeting', 'note', 'task', 'demo', 'follow_up'];
  if (!validTypes.includes(type)) {
    throw new AppError(`Invalid activity type. Must be one of: ${validTypes.join(', ')}`, 400);
  }

  const activity = {
    type,
    title,
    description,
    date: date ? new Date(date) : new Date(),
    createdBy: req.user._id,
  };

  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $push: { activities: { $each: [activity], $position: 0 } } },
    { new: true }
  );

  if (!contact) throw new AppError('Contact not found', 404);

  logger.info(`Activity added to contact ${req.params.id}`);

  res.status(201).json({
    success: true,
    data: contact,
    message: 'Activity added successfully',
  });
});

// ═══════════════════════════════════════════════════════════════════
//                         PIPELINES
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#6366f1', order: 0 },
  { name: 'Prospect', color: '#8b5cf6', order: 1 },
  { name: 'Proposal', color: '#f59e0b', order: 2 },
  { name: 'Negotiation', color: '#ef4444', order: 3 },
  { name: 'Closed Won', color: '#10b981', order: 4 },
  { name: 'Closed Lost', color: '#6b7280', order: 5 },
];

// ─── GET PIPELINES ────────────────────────────────────────────────────────────
exports.getPipelines = asyncHandler(async (req, res) => {
  const pipelines = await Pipeline.find({ owner: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, data: pipelines });
});

// ─── CREATE PIPELINE ──────────────────────────────────────────────────────────
exports.createPipeline = asyncHandler(async (req, res) => {
  const { name, currency, stages } = req.body;

  if (!name) throw new AppError('Pipeline name is required', 400);

  // Use custom stages or fall back to defaults
  const pipelineStages =
    Array.isArray(stages) && stages.length > 0
      ? stages.map((s, i) => ({ ...s, order: i }))
      : DEFAULT_STAGES;

  const pipeline = await Pipeline.create({
    name: name.trim(),
    currency: currency || 'USD',
    stages: pipelineStages,
    owner: req.user._id,
  });

  logger.info(`Pipeline created: ${pipeline._id}`);

  res.status(201).json({
    success: true,
    data: pipeline,
    message: 'Pipeline created successfully',
  });
});

// ─── GET PIPELINE ─────────────────────────────────────────────────────────────
exports.getPipeline = asyncHandler(async (req, res) => {
  const pipeline = await Pipeline.findOne({ _id: req.params.id, owner: req.user._id });
  if (!pipeline) throw new AppError('Pipeline not found', 404);

  res.status(200).json({ success: true, data: pipeline });
});

// ─── UPDATE PIPELINE ──────────────────────────────────────────────────────────
exports.updatePipeline = asyncHandler(async (req, res) => {
  delete req.body.owner;

  const pipeline = await Pipeline.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: req.body },
    { new: true, runValidators: true }
  );

  if (!pipeline) throw new AppError('Pipeline not found', 404);

  res.status(200).json({ success: true, data: pipeline, message: 'Pipeline updated' });
});

// ─── DELETE PIPELINE ──────────────────────────────────────────────────────────
exports.deletePipeline = asyncHandler(async (req, res) => {
  // Check if any deals reference this pipeline
  const dealCount = await Deal.countDocuments({ pipeline: req.params.id, owner: req.user._id });
  if (dealCount > 0) {
    throw new AppError(
      `Cannot delete pipeline with ${dealCount} active deals. Move or delete the deals first.`,
      400
    );
  }

  const pipeline = await Pipeline.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!pipeline) throw new AppError('Pipeline not found', 404);

  logger.info(`Pipeline deleted: ${req.params.id}`);

  res.status(200).json({ success: true, message: 'Pipeline deleted successfully' });
});

// ═══════════════════════════════════════════════════════════════════
//                           DEALS
// ═══════════════════════════════════════════════════════════════════

// ─── GET DEALS ────────────────────────────────────────────────────────────────
exports.getDeals = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    pipeline,
    stage,
    search,
    minValue,
    maxValue,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const filter = { owner: req.user._id };

  if (pipeline) filter.pipeline = pipeline;
  if (stage) filter.stage = stage;
  if (minValue || maxValue) {
    filter.value = {};
    if (minValue) filter.value.$gte = Number(minValue);
    if (maxValue) filter.value.$lte = Number(maxValue);
  }
  if (search) {
    filter.title = { $regex: search, $options: 'i' };
  }

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 100);
  const skip = (pageNum - 1) * limitNum;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [deals, total] = await Promise.all([
    Deal.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(limitNum)
      .populate('contact', 'firstName lastName email company')
      .populate('pipeline', 'name currency')
      .lean(),
    Deal.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: deals,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── CREATE DEAL ─────────────────────────────────────────────────────────────
exports.createDeal = asyncHandler(async (req, res) => {
  const { title, value, currency, stage, pipeline, contact, expectedCloseDate, probability, notes } =
    req.body;

  if (!title) throw new AppError('Deal title is required', 400);
  if (!pipeline) throw new AppError('Pipeline ID is required', 400);

  // Verify pipeline ownership
  const pipelineDoc = await Pipeline.findOne({ _id: pipeline, owner: req.user._id });
  if (!pipelineDoc) throw new AppError('Pipeline not found', 404);

  // Use first stage if none provided
  const dealStage = stage || pipelineDoc.stages[0]?.name || 'Lead';

  const deal = await Deal.create({
    title,
    value: value || 0,
    currency: currency || pipelineDoc.currency || 'USD',
    stage: dealStage,
    pipeline,
    contact,
    expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
    probability: probability !== undefined ? Number(probability) : undefined,
    notes,
    owner: req.user._id,
  });

  logger.info(`Deal created: ${deal._id}`);

  res.status(201).json({ success: true, data: deal, message: 'Deal created successfully' });
});

// ─── GET DEAL ─────────────────────────────────────────────────────────────────
exports.getDeal = asyncHandler(async (req, res) => {
  const deal = await Deal.findOne({ _id: req.params.id, owner: req.user._id })
    .populate('contact', 'firstName lastName email company')
    .populate('pipeline', 'name currency stages');

  if (!deal) throw new AppError('Deal not found', 404);

  res.status(200).json({ success: true, data: deal });
});

// ─── UPDATE DEAL ──────────────────────────────────────────────────────────────
exports.updateDeal = asyncHandler(async (req, res) => {
  const prevDeal = await Deal.findOne({ _id: req.params.id, owner: req.user._id });
  if (!prevDeal) throw new AppError('Deal not found', 404);

  delete req.body.owner;

  const deal = await Deal.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  )
    .populate('contact', 'firstName lastName email company')
    .populate('pipeline', 'name currency stages');

  // If stage changed and deal has a contact, create activity on the contact
  if (req.body.stage && req.body.stage !== prevDeal.stage && deal.contact) {
    try {
      await Contact.findByIdAndUpdate(deal.contact, {
        $push: {
          activities: {
            $each: [
              {
                type: 'note',
                title: `Deal stage changed`,
                description: `"${deal.title}" moved from ${prevDeal.stage} → ${deal.stage}`,
                date: new Date(),
                createdBy: req.user._id,
              },
            ],
            $position: 0,
          },
        },
      });
    } catch (err) {
      logger.warn(`Could not create stage-change activity: ${err.message}`);
    }
  }

  res.status(200).json({ success: true, data: deal, message: 'Deal updated' });
});

// ─── DELETE DEAL ──────────────────────────────────────────────────────────────
exports.deleteDeal = asyncHandler(async (req, res) => {
  const deal = await Deal.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!deal) throw new AppError('Deal not found', 404);

  logger.info(`Deal deleted: ${req.params.id}`);

  res.status(200).json({ success: true, message: 'Deal deleted successfully' });
});
