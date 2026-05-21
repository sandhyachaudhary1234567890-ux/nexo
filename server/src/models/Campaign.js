'use strict';
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['email', 'sms'], default: 'email' },
  status: { type: String, enum: ['draft', 'scheduled', 'running', 'paused', 'completed'], default: 'draft' },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  leads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }],
  schedule: { type: String },
  stats: {
    sent: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    replied: { type: Number, default: 0 },
    failed: { type: Number, default: 0 }
  },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

campaignSchema.index({ owner: 1 });
campaignSchema.index({ status: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
