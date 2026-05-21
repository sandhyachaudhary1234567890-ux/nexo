'use strict';
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  type: { type: String, enum: ['call', 'email', 'meeting', 'note', 'deal_update', 'stage_change'], default: 'note' },
  description: { type: String, required: true },
  date: { type: Date, default: Date.now }
}, { _id: true });

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  company: { type: String, trim: true },
  phone: { type: String, trim: true },
  position: { type: String, trim: true },
  dealStage: { type: String, enum: ['lead', 'prospect', 'proposal', 'negotiation', 'closed_won', 'closed_lost'], default: 'lead' },
  dealValue: { type: Number, default: 0, min: 0 },
  pipeline: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  activities: [activitySchema],
  tags: [{ type: String, trim: true }],
  notes: { type: String },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }
}, { timestamps: true });

contactSchema.index({ owner: 1 });
contactSchema.index({ dealStage: 1 });
contactSchema.index({ owner: 1, dealStage: 1 });

module.exports = mongoose.model('Contact', contactSchema);
