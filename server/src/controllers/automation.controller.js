const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const Automation = require('../models/Automation');
const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

// ─── GET AUTOMATIONS ──────────────────────────────────────────────────────────
exports.getAutomations = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    isActive,
    trigger,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const filter = { owner: req.user._id };

  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (trigger) filter['trigger.type'] = trigger;
  if (search) filter.name = { $regex: search, $options: 'i' };

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 100);
  const skip = (pageNum - 1) * limitNum;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [automations, total] = await Promise.all([
    Automation.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Automation.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: automations,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── CREATE AUTOMATION ────────────────────────────────────────────────────────
exports.createAutomation = asyncHandler(async (req, res) => {
  const { name, description, trigger, conditions, actions, isActive } = req.body;

  if (!name) throw new AppError('Automation name is required', 400);
  if (!trigger || !trigger.type) throw new AppError('Trigger configuration is required', 400);
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    throw new AppError('At least one action is required', 400);
  }

  const validTriggers = [
    'lead_created',
    'lead_status_changed',
    'lead_score_threshold',
    'deal_stage_changed',
    'contact_created',
    'campaign_opened',
    'campaign_clicked',
    'campaign_replied',
    'time_based',
    'manual',
  ];

  if (!validTriggers.includes(trigger.type)) {
    throw new AppError(`Invalid trigger type. Must be one of: ${validTriggers.join(', ')}`, 400);
  }

  const automation = await Automation.create({
    name: name.trim(),
    description,
    trigger,
    conditions: Array.isArray(conditions) ? conditions : [],
    actions,
    isActive: isActive !== undefined ? Boolean(isActive) : false,
    runCount: 0,
    owner: req.user._id,
  });

  logger.info(`Automation created: ${automation._id}`);

  res.status(201).json({
    success: true,
    data: automation,
    message: 'Automation created successfully',
  });
});

// ─── GET AUTOMATION ───────────────────────────────────────────────────────────
exports.getAutomation = asyncHandler(async (req, res) => {
  const automation = await Automation.findOne({ _id: req.params.id, owner: req.user._id });
  if (!automation) throw new AppError('Automation not found', 404);

  res.status(200).json({ success: true, data: automation });
});

// ─── UPDATE AUTOMATION ────────────────────────────────────────────────────────
exports.updateAutomation = asyncHandler(async (req, res) => {
  delete req.body.owner;
  delete req.body.runCount;
  delete req.body.isActive; // Use toggle endpoint for this

  const automation = await Automation.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: req.body },
    { new: true, runValidators: true }
  );

  if (!automation) throw new AppError('Automation not found', 404);

  res.status(200).json({ success: true, data: automation, message: 'Automation updated' });
});

// ─── DELETE AUTOMATION ────────────────────────────────────────────────────────
exports.deleteAutomation = asyncHandler(async (req, res) => {
  const automation = await Automation.findOneAndDelete({
    _id: req.params.id,
    owner: req.user._id,
  });

  if (!automation) throw new AppError('Automation not found', 404);

  // Also clean up associated audit logs
  await AuditLog.deleteMany({ resourceId: req.params.id, resourceType: 'automation' });

  logger.info(`Automation deleted: ${req.params.id}`);

  res.status(200).json({ success: true, message: 'Automation deleted successfully' });
});

// ─── TOGGLE AUTOMATION ────────────────────────────────────────────────────────
exports.toggleAutomation = asyncHandler(async (req, res) => {
  const automation = await Automation.findOne({ _id: req.params.id, owner: req.user._id });
  if (!automation) throw new AppError('Automation not found', 404);

  const newState = !automation.isActive;

  const updated = await Automation.findByIdAndUpdate(
    automation._id,
    { isActive: newState, ...(newState ? { activatedAt: new Date() } : { deactivatedAt: new Date() }) },
    { new: true }
  );

  logger.info(`Automation ${automation._id} toggled: ${newState ? 'active' : 'inactive'}`);

  res.status(200).json({
    success: true,
    data: { _id: updated._id, isActive: updated.isActive },
    message: `Automation ${newState ? 'activated' : 'deactivated'} successfully`,
  });
});

// ─── TRIGGER AUTOMATION MANUALLY ─────────────────────────────────────────────
exports.triggerAutomation = asyncHandler(async (req, res) => {
  const automation = await Automation.findOne({ _id: req.params.id, owner: req.user._id });
  if (!automation) throw new AppError('Automation not found', 404);

  const { targetId, targetType } = req.body;

  const { automationQueue } = require('../queues');

  await automationQueue.add(
    'run-automation',
    {
      automationId: automation._id.toString(),
      userId: req.user._id.toString(),
      trigger: 'manual',
      targetId,
      targetType,
      context: req.body.context || {},
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    }
  );

  logger.info(`Automation ${automation._id} manually triggered by user ${req.user._id}`);

  res.status(202).json({
    success: true,
    message: 'Automation triggered successfully',
    data: { automationId: automation._id, status: 'queued' },
  });
});

// ─── GET AUTOMATION LOGS ──────────────────────────────────────────────────────
exports.getAutomationLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, status } = req.query;

  // Verify automation ownership first
  const automation = await Automation.findOne({ _id: req.params.id, owner: req.user._id }).select('_id');
  if (!automation) throw new AppError('Automation not found', 404);

  const filter = {
    resourceId: req.params.id,
    resourceType: 'automation',
    userId: req.user._id,
  };

  if (status) filter.status = status;

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 200);
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: logs,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});
