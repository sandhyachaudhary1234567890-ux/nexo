const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const User = require('../models/User');
const AIPrompt = require('../models/AIPrompt');
const aiService = require('../services/ai.service');
const logger = require('../config/logger');

// ─── HELPER: Deduct Credits ───────────────────────────────────────────────────
async function deductCredits(userId, amount) {
  const user = await User.findById(userId).select('credits');
  if (!user) throw new AppError('User not found', 404);
  if (user.credits < amount) {
    throw new AppError(`Insufficient credits. You have ${user.credits} credits, need ${amount}.`, 402);
  }
  await User.findByIdAndUpdate(userId, { $inc: { credits: -amount } });
}

// ─── CHAT (SSE STREAMING) ─────────────────────────────────────────────────────
exports.chat = asyncHandler(async (req, res) => {
  const { messages, taskType = 'chat', context } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new AppError('Messages array is required', 400);
  }

  // Validate message structure
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      throw new AppError('Each message must have role and content', 400);
    }
    if (!['user', 'assistant', 'system'].includes(msg.role)) {
      throw new AppError('Message role must be user, assistant, or system', 400);
    }
  }

  // Set SSE headers BEFORE any async work that could throw
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 15000);

  const systemMessage = {
    role: 'system',
    content: `You are Nexo AI, an expert B2B sales intelligence assistant. Help users with lead generation, outreach, CRM management, and sales strategy. Be concise, data-driven, and actionable.${
      context ? ` Context: ${JSON.stringify(context)}` : ''
    }`,
  };

  const fullMessages = [systemMessage, ...messages];

  const provider = req.body.provider || 'groq';

  try {
    await aiService.streamChat(fullMessages, res, taskType, provider, req.user.preferences);
  } catch (err) {
    logger.error('AI chat stream error:', err.message);
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    }
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      res.write('event: done\ndata: [DONE]\n\n');
      res.end();
    }
  }
});

// ─── ANALYZE ──────────────────────────────────────────────────────────────────
exports.analyze = asyncHandler(async (req, res) => {
  const { type, data, question, provider = 'groq' } = req.body;

  if (!type || !data) throw new AppError('Analysis type and data are required', 400);

  const validTypes = ['lead', 'deal', 'contact', 'campaign', 'general'];
  if (!validTypes.includes(type)) {
    throw new AppError(`Invalid analysis type. Must be one of: ${validTypes.join(', ')}`, 400);
  }

  const ANALYSIS_COST = 10;
  await deductCredits(req.user._id, ANALYSIS_COST);

  try {
    const result = await aiService.analyze(type, data, question, provider, req.user.preferences);

    logger.info(`AI analysis completed for user ${req.user._id}, type: ${type}`);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    // Refund credits on AI failure
    await User.findByIdAndUpdate(req.user._id, { $inc: { credits: ANALYSIS_COST } });
    throw err;
  }
});

// ─── BULK ENRICH ─────────────────────────────────────────────────────────────
exports.enrich = asyncHandler(async (req, res) => {
  const { leadIds } = req.body;

  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    throw new AppError('leadIds array is required', 400);
  }

  if (leadIds.length > 100) {
    throw new AppError('Cannot enrich more than 100 leads at once', 400);
  }

  const Lead = require('../models/Lead');

  // Verify all leads belong to user
  const leads = await Lead.find({
    _id: { $in: leadIds },
    createdBy: req.user._id,
  }).select('_id enrichmentStatus');

  if (leads.length === 0) {
    throw new AppError('No valid leads found', 404);
  }

  const { enrichmentQueue } = require('../jobs/queues');
  const queued = [];
  const skipped = [];

  for (const lead of leads) {
    if (lead.enriched) {
      skipped.push(lead._id);
      continue;
    }

    await enrichmentQueue.add(
      'enrich-lead',
      {
        leadId: lead._id.toString(),
        userId: req.user._id.toString()
      }
    );

    queued.push(lead._id);
  }

  logger.info(
    `Bulk enrich: ${queued.length} queued, ${skipped.length} skipped for user ${req.user._id}`
  );

  res.status(202).json({
    success: true,
    message: `${queued.length} leads added to enrichment queue`,
    data: { queued: queued.length, skipped: skipped.length },
  });
});

// ─── GENERATE DRAFT EMAIL ─────────────────────────────────────────────────────
exports.draft = asyncHandler(async (req, res) => {
  const {
    leadData,
    templateType,
    tone,
    goal,
    fromName,
    fromCompany,
    additionalContext,
    provider = 'groq',
  } = req.body;

  if (!leadData) throw new AppError('Lead data is required for draft generation', 400);

  const result = await aiService.generateEmailDraft({
    leadData,
    templateType: templateType || 'cold_outreach',
    tone: tone || 'professional',
    goal: goal || 'schedule a meeting',
    fromName: fromName || req.user.name,
    fromCompany: additionalContext?.company || '',
    additionalContext,
    provider,
    customKeys: req.user.preferences,
  });

  logger.info(`Email draft generated for user ${req.user._id}`);

  res.status(200).json({
    success: true,
    data: {
      subject: result.subject,
      body: result.body,
      tone: result.tone || tone,
    },
  });
});

// ─── GET PROMPTS ──────────────────────────────────────────────────────────────
exports.getPrompts = asyncHandler(async (req, res) => {
  const { category, search, page = 1, limit = 20 } = req.query;

  const filter = { userId: req.user._id };
  if (search) filter.name = { $regex: search, $options: 'i' };

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 100);
  const skip = (pageNum - 1) * limitNum;

  const [prompts, total] = await Promise.all([
    AIPrompt.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    AIPrompt.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: prompts,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── CREATE PROMPT ────────────────────────────────────────────────────────────
exports.createPrompt = asyncHandler(async (req, res) => {
  const { name, systemPrompt, model, temperature, maxTokens } = req.body;

  if (!name) throw new AppError('Prompt name is required', 400);
  if (!systemPrompt) throw new AppError('System prompt content is required', 400);

  const prompt = await AIPrompt.create({
    name: name.trim(),
    systemPrompt,
    model: model || 'gpt-4o',
    temperature: temperature || 0.7,
    maxTokens: maxTokens || 2000,
    userId: req.user._id,
  });

  res.status(201).json({
    success: true,
    data: prompt,
    message: 'Prompt saved successfully',
  });
});

// ─── UPDATE PROMPT ────────────────────────────────────────────────────────────
exports.updatePrompt = asyncHandler(async (req, res) => {
  delete req.body.userId;

  const prompt = await AIPrompt.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: req.body },
    { new: true, runValidators: true }
  );

  if (!prompt) throw new AppError('Prompt not found', 404);

  res.status(200).json({ success: true, data: prompt, message: 'Prompt updated' });
});

// ─── DELETE PROMPT ────────────────────────────────────────────────────────────
exports.deletePrompt = asyncHandler(async (req, res) => {
  const prompt = await AIPrompt.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!prompt) throw new AppError('Prompt not found', 404);

  res.status(200).json({ success: true, message: 'Prompt deleted' });
});
