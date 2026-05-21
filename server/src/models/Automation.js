'use strict';
const mongoose = require('mongoose');

const conditionSchema = new mongoose.Schema({
  field: { type: String, required: true },
  operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists'], required: true },
  value: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const actionSchema = new mongoose.Schema({
  type: { type: String, enum: ['send_email', 'update_lead_status', 'create_notification', 'add_to_campaign'], required: true },
  params: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const automationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  trigger: { type: String, enum: ['new_lead', 'lead_status_change', 'deal_stage_change', 'time_based'], required: true },
  conditions: [conditionSchema],
  actions: [actionSchema],
  schedule: { type: String },
  isActive: { type: Boolean, default: false },
  lastRun: { type: Date },
  runCount: { type: Number, default: 0 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

automationSchema.index({ owner: 1 });
automationSchema.index({ isActive: 1 });

module.exports = mongoose.model('Automation', automationSchema);
