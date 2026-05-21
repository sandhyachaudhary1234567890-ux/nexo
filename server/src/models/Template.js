'use strict';
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  variables: [{ type: String }],
  category: { type: String, enum: ['cold', 'followup', 'proposal', 'closing'], default: 'cold' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isPublic: { type: Boolean, default: false }
}, { timestamps: true });

templateSchema.index({ owner: 1 });
templateSchema.index({ category: 1 });
templateSchema.index({ isPublic: 1 });

module.exports = mongoose.model('Template', templateSchema);
