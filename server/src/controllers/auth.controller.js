const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const asyncHandler = require('../utils/asyncHandler');
const { AppError, sanitizeUser, generateTokens } = require('../utils/helpers');
const User = require('../models/User');
const logger = require('../config/logger');

const env = process.env;
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

// ─── REGISTER ────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new AppError('All fields required', 400);
  }
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) throw new AppError('Email already registered', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
  });

  const { accessToken, refreshToken } = generateTokens(
    user._id,
    env.JWT_SECRET,
    env.JWT_REFRESH_SECRET
  );

  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: refreshToken },
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  logger.info(`New user registered: ${user.email}`);

  res.status(201).json({
    success: true,
    data: { user: sanitizeUser(user), accessToken },
  });
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    '+passwordHash +refreshTokens'
  );
  if (!user || !user.passwordHash) {
    throw new AppError('Invalid email or password', 401);
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  const { accessToken, refreshToken } = generateTokens(
    user._id,
    env.JWT_SECRET,
    env.JWT_REFRESH_SECRET
  );

  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: refreshToken },
    lastLoginAt: new Date(),
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  logger.info(`User logged in: ${user.email}`);

  res.status(200).json({
    success: true,
    data: { user: sanitizeUser(user), accessToken },
  });
});

// ─── GOOGLE AUTH ─────────────────────────────────────────────────────────────
exports.googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) throw new AppError('Google ID token required', 400);

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    logger.error('Google token verification failed:', err.message);
    throw new AppError('Invalid Google token', 401);
  }

  const { sub: googleId, email, name, picture } = payload;

  if (!email) throw new AppError('Could not retrieve email from Google', 400);

  // Upsert user by googleId or email
  let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

  if (user) {
    // Link Google account if not already linked
    if (!user.googleId) {
      user.googleId = googleId;
      if (!user.avatar && picture) user.avatar = picture;
      await user.save();
    }
  } else {
    user = await User.create({
      name,
      email: email.toLowerCase(),
      googleId,
      avatar: picture || null,
      emailVerified: true,
    });
  }

  const { accessToken, refreshToken } = generateTokens(
    user._id,
    env.JWT_SECRET,
    env.JWT_REFRESH_SECRET
  );

  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: refreshToken },
    lastLoginAt: new Date(),
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  logger.info(`Google auth: ${user.email}`);

  res.status(200).json({
    success: true,
    data: { user: sanitizeUser(user), accessToken },
  });
});

// ─── REFRESH TOKEN ───────────────────────────────────────────────────────────
exports.refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) throw new AppError('Refresh token missing', 401);

  const jwt = require('jsonwebtoken');

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await User.findById(decoded.id).select('+refreshTokens');
  if (!user) throw new AppError('User not found', 401);

  // Validate that this refresh token is still stored (rotation check)
  if (!user.refreshTokens.includes(token)) {
    // Possible token reuse — clear all tokens (security measure)
    await User.findByIdAndUpdate(user._id, { $set: { refreshTokens: [] } });
    res.clearCookie('refreshToken');
    throw new AppError('Token reuse detected. Please log in again.', 401);
  }

  // Rotate: remove old, issue new
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(
    user._id,
    env.JWT_SECRET,
    env.JWT_REFRESH_SECRET
  );

  await User.findByIdAndUpdate(user._id, {
    $pull: { refreshTokens: token },
    $push: { refreshTokens: newRefreshToken },
  });

  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    success: true,
    data: { accessToken },
  });
});

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    // Remove specific refresh token from user's stored tokens
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { refreshTokens: token },
    });
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  logger.info(`User logged out: ${req.user.email}`);

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});
