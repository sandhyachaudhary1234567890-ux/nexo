'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  googleId: { type: String, sparse: true },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  credits: { type: Number, default: 1000, min: 0 },
  isEmailVerified: { type: Boolean, default: false },
  onboarding: {
    completed: { type: Boolean, default: false },
    businessType: { type: String },
    targetCountry: { type: String },
    services: [{ type: String }],
    goals: { type: String }
  },
  preferences: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    notifications: { type: Boolean, default: true },
    smtpHost: { type: String },
    smtpPort: { type: String },
    smtpUser: { type: String },
    smtpPass: { type: String },
    apolloKey: { type: String },
    hunterKey: { type: String },
    clearbitKey: { type: String }
  },
  refreshTokens: { type: [String], select: false, default: [] }
}, { timestamps: true });

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
