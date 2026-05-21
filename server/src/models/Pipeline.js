'use strict';
const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  order: { type: Number, required: true },
  color: { type: String, default: '#6366f1' }
}, { _id: true });

const pipelineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  stages: [stageSchema],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

pipelineSchema.index({ owner: 1 });

module.exports = mongoose.model('Pipeline', pipelineSchema);
