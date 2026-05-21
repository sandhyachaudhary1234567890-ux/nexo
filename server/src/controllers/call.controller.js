const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const Call = require('../models/Call');
const webrtcService = require('../services/webrtc.service');
const logger = require('../config/logger');

// ─── CREATE CALL ─────────────────────────────────────────────────────────────
exports.createCall = asyncHandler(async (req, res) => {
  const { leadId, contactId, title, type = 'video' } = req.body;

  if (!leadId && !contactId) {
    throw new AppError('Either leadId or contactId is required', 400);
  }

  const validTypes = ['video', 'audio', 'screen_share'];
  if (!validTypes.includes(type)) {
    throw new AppError(`Invalid call type. Must be one of: ${validTypes.join(', ')}`, 400);
  }

  // Create WebRTC room
  const { roomId, iceServers } = await webrtcService.createRoom(
    req.user._id.toString(),
    leadId || contactId
  );

  const call = await Call.create({
    title: title || `Call with ${req.user.name}`,
    type,
    roomId,
    lead: leadId || undefined,
    contact: contactId || undefined,
    status: 'active',
    startedAt: new Date(),
    transcript: [],
    owner: req.user._id,
  });

  logger.info(`Call room created: ${call._id} (room: ${roomId})`);

  res.status(201).json({
    success: true,
    data: {
      callId: call._id,
      roomId,
      iceServers,
      call,
    },
    message: 'Call room created',
  });
});

// ─── GET CALLS ────────────────────────────────────────────────────────────────
exports.getCalls = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const filter = { owner: req.user._id };
  if (status) filter.status = status;

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 100);
  const skip = (pageNum - 1) * limitNum;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [calls, total] = await Promise.all([
    Call.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(limitNum)
      .populate('lead', 'firstName lastName companyName email')
      .populate('contact', 'firstName lastName company email')
      .select('-transcript') // Exclude transcript from list view for performance
      .lean(),
    Call.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: calls,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── GET CALL ─────────────────────────────────────────────────────────────────
exports.getCall = asyncHandler(async (req, res) => {
  const call = await Call.findOne({ _id: req.params.id, owner: req.user._id })
    .populate('lead', 'firstName lastName companyName email phone')
    .populate('contact', 'firstName lastName company email phone');

  if (!call) throw new AppError('Call not found', 404);

  res.status(200).json({ success: true, data: call });
});

// ─── END CALL ─────────────────────────────────────────────────────────────────
exports.endCall = asyncHandler(async (req, res) => {
  const call = await Call.findOne({ _id: req.params.id, owner: req.user._id });
  if (!call) throw new AppError('Call not found', 404);

  if (call.status === 'ended') {
    throw new AppError('Call has already ended', 400);
  }

  // End room and get duration from webrtc service
  let duration = 0;
  try {
    const result = await webrtcService.endRoom(call.roomId);
    duration = result?.duration || Math.floor((Date.now() - call.startedAt.getTime()) / 1000);
  } catch (err) {
    logger.warn(`WebRTC endRoom failed for ${call.roomId}: ${err.message}`);
    duration = Math.floor((Date.now() - call.startedAt.getTime()) / 1000);
  }

  const updatedCall = await Call.findByIdAndUpdate(
    call._id,
    {
      status: 'ended',
      endedAt: new Date(),
      duration,
    },
    { new: true }
  )
    .populate('lead', 'firstName lastName companyName email')
    .populate('contact', 'firstName lastName company email');

  logger.info(`Call ended: ${call._id}, duration: ${duration}s`);

  res.status(200).json({
    success: true,
    data: updatedCall,
    message: 'Call ended successfully',
  });
});

// ─── ADD TRANSCRIPT ENTRY ─────────────────────────────────────────────────────
exports.addTranscript = asyncHandler(async (req, res) => {
  const { speaker, text, timestamp, confidence } = req.body;

  if (!speaker || !text) throw new AppError('Speaker and text are required', 400);

  const entry = {
    speaker,
    text,
    timestamp: timestamp || new Date(),
    confidence: confidence !== undefined ? Number(confidence) : undefined,
  };

  const call = await Call.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $push: { transcript: entry } },
    { new: true }
  );

  if (!call) throw new AppError('Call not found', 404);

  res.status(201).json({
    success: true,
    data: entry,
    message: 'Transcript entry added',
  });
});

// ─── GET TRANSCRIPT ───────────────────────────────────────────────────────────
exports.getTranscript = asyncHandler(async (req, res) => {
  const call = await Call.findOne(
    { _id: req.params.id, owner: req.user._id },
    { transcript: 1, title: 1, duration: 1, startedAt: 1, endedAt: 1 }
  );

  if (!call) throw new AppError('Call not found', 404);

  res.status(200).json({
    success: true,
    data: {
      callId: call._id,
      title: call.title,
      duration: call.duration,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      transcript: call.transcript || [],
      entryCount: call.transcript?.length || 0,
    },
  });
});
