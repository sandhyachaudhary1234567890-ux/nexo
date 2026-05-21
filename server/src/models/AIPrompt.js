'use strict';
const mongoose = require('mongoose');

const aiPromptSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  systemPrompt: { type: String, required: true },
  model: { type: String, enum: ['gpt-4o', 'gemini-1.5-flash', 'llama3-70b-8192'], default: 'gpt-4o' },
  temperature: { type: Number, default: 0.7, min: 0, max: 2 },
  maxTokens: { type: Number, default: 2000, min: 100, max: 8000 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

aiPromptSchema.index({ userId: 1 });

module.exports = mongoose.model('AIPrompt', aiPromptSchema);
