'use strict';
const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  value: { type: Number, default: 0, min: 0 },
  stage: { type: String, required: true, trim: true },
  probability: { type: Number, default: 0, min: 0, max: 100 },
  closeDate: { type: Date },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  pipeline: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notes: { type: String }
}, { timestamps: true });

dealSchema.index({ owner: 1 });
dealSchema.index({ stage: 1 });
dealSchema.index({ pipeline: 1, stage: 1 });

module.exports = mongoose.model('Deal', dealSchema);
