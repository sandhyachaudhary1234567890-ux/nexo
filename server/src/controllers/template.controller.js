const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const Template = require('../models/Template');
const logger = require('../config/logger');

// ─── GET PUBLIC TEMPLATES ─────────────────────────────────────────────────────
exports.getPublicTemplates = asyncHandler(async (req, res) => {
  const { category, type, search, page = 1, limit = 20 } = req.query;

  const filter = { isPublic: true };
  if (category) filter.category = category;
  if (type) filter.type = type;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { subject: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 50);
  const skip = (pageNum - 1) * limitNum;

  const [templates, total] = await Promise.all([
    Template.find(filter)
      .sort({ usageCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-owner')
      .lean(),
    Template.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: templates,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── GET TEMPLATES ────────────────────────────────────────────────────────────
exports.getTemplates = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, type, search, isPublic } = req.query;

  const filter = {
    $or: [{ owner: req.user._id }, { isPublic: true }],
  };

  if (category) filter.category = category;
  if (type) filter.type = type;
  if (isPublic !== undefined) {
    filter.$or = undefined;
    filter.owner = req.user._id;
  }
  if (search) {
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { subject: { $regex: search, $options: 'i' } },
        ],
      },
    ];
  }

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 100);
  const skip = (pageNum - 1) * limitNum;

  const [templates, total] = await Promise.all([
    Template.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Template.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: templates,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── CREATE TEMPLATE ──────────────────────────────────────────────────────────
exports.createTemplate = asyncHandler(async (req, res) => {
  const { name, type, subject, body, category, description, isPublic, variables } = req.body;

  if (!name) throw new AppError('Template name is required', 400);
  if (!body) throw new AppError('Template body is required', 400);

  const validTypes = ['email', 'sms', 'linkedin', 'whatsapp'];
  if (type && !validTypes.includes(type)) {
    throw new AppError(`Invalid type. Must be one of: ${validTypes.join(', ')}`, 400);
  }

  if ((type === 'email' || !type) && !subject) {
    throw new AppError('Subject is required for email templates', 400);
  }

  const template = await Template.create({
    name: name.trim(),
    type: type || 'email',
    subject: subject?.trim(),
    body,
    category: category || 'general',
    description,
    isPublic: Boolean(isPublic),
    variables: Array.isArray(variables) ? variables : [],
    usageCount: 0,
    owner: req.user._id,
  });

  logger.info(`Template created: ${template._id}`);

  res.status(201).json({
    success: true,
    data: template,
    message: 'Template created successfully',
  });
});

// ─── GET TEMPLATE ─────────────────────────────────────────────────────────────
exports.getTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id: req.params.id,
    $or: [{ owner: req.user._id }, { isPublic: true }],
  });

  if (!template) throw new AppError('Template not found', 404);

  res.status(200).json({ success: true, data: template });
});

// ─── UPDATE TEMPLATE ──────────────────────────────────────────────────────────
exports.updateTemplate = asyncHandler(async (req, res) => {
  // Only owner can update
  const template = await Template.findOne({ _id: req.params.id, owner: req.user._id });
  if (!template) throw new AppError('Template not found', 404);

  delete req.body.owner;
  delete req.body.usageCount;

  const updated = await Template.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );

  res.status(200).json({ success: true, data: updated, message: 'Template updated' });
});

// ─── DELETE TEMPLATE ──────────────────────────────────────────────────────────
exports.deleteTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!template) throw new AppError('Template not found', 404);

  logger.info(`Template deleted: ${req.params.id}`);

  res.status(200).json({ success: true, message: 'Template deleted successfully' });
});
