const asyncHandler = require('../utils/asyncHandler');
const { AppError, sanitizeUser } = require('../utils/helpers');
const User = require('../models/User');
const logger = require('../config/logger');

// ─── GET ME ──────────────────────────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  // req.user is already set by protect middleware
  res.status(200).json({
    success: true,
    data: { user: sanitizeUser(req.user) },
  });
});

// ─── UPDATE ME ───────────────────────────────────────────────────────────────
exports.updateMe = asyncHandler(async (req, res) => {
  const allowedFields = ['name', 'avatar', 'preferences', 'phone', 'timezone', 'language'];
  const updates = {};

  for (const key of allowedFields) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  // Merge preferences to prevent wiping out other settings
  if (updates.preferences !== undefined && typeof updates.preferences === 'object') {
    const currentPrefs = req.user.preferences && req.user.preferences.toObject ? req.user.preferences.toObject() : (req.user.preferences || {});
    updates.preferences = {
      ...currentPrefs,
      ...updates.preferences,
    };
  }

  // Validate name if provided
  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (!name || name.length < 2) {
      throw new AppError('Name must be at least 2 characters', 400);
    }
    updates.name = name;
  }

  // Prevent updating sensitive fields via this endpoint
  const forbidden = ['email', 'passwordHash', 'refreshTokens', 'role', 'plan', 'credits'];
  for (const field of forbidden) {
    if (req.body[field] !== undefined) {
      throw new AppError(`Field '${field}' cannot be updated via this endpoint`, 400);
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields provided for update', 400);
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!user) throw new AppError('User not found', 404);

  logger.info(`User profile updated: ${user.email}`);

  res.status(200).json({
    success: true,
    data: { user: sanitizeUser(user) },
    message: 'Profile updated successfully',
  });
});

// ─── SAVE ONBOARDING ─────────────────────────────────────────────────────────
exports.saveOnboarding = asyncHandler(async (req, res) => {
  const {
    businessType,
    targetCountry,
    services,
    goals,
  } = req.body;

  const onboarding = {
    businessType: businessType?.trim(),
    targetCountry: targetCountry?.trim(),
    services: Array.isArray(services) ? services : [],
    goals: typeof goals === 'string' ? goals.trim() : (Array.isArray(goals) ? goals.join(', ') : goals),
    completed: true,
  };

  // Remove undefined fields
  Object.keys(onboarding).forEach(
    (key) => onboarding[key] === undefined && delete onboarding[key]
  );

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { onboarding } },
    { new: true, runValidators: true }
  );

  if (!user) throw new AppError('User not found', 404);

  logger.info(`Onboarding completed for: ${user.email}`);

  res.status(200).json({
    success: true,
    data: { user: sanitizeUser(user) },
    message: 'Onboarding saved successfully',
  });
});

// ─── GET CREDITS ─────────────────────────────────────────────────────────────
exports.getCredits = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('credits plan');

  if (!user) throw new AppError('User not found', 404);

  res.status(200).json({
    success: true,
    data: {
      credits: user.credits,
      plan: user.plan,
    },
  });
});
