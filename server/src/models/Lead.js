'use strict';
const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  website: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  industry: { type: String, trim: true },
  country: { type: String, trim: true },
  city: { type: String, trim: true },
  score: { type: Number, default: 50, min: 0, max: 100 },
  status: { type: String, enum: ['new', 'contacted', 'qualified', 'converted', 'rejected'], default: 'new' },
  source: { type: String, enum: ['manual', 'csv', 'apollo', 'hunter', 'clearbit', 'ai'], default: 'manual' },
  enriched: { type: Boolean, default: false },
  enrichmentData: {
    description: { type: String },
    employees: { type: Number },
    revenue: { type: String },
    technologies: [{ type: String }],
    socialProfiles: {
      linkedin: { type: String },
      twitter: { type: String },
      facebook: { type: String }
    }
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tags: [{ type: String, trim: true }],
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

leadSchema.index({ status: 1 });
leadSchema.index({ source: 1 });
leadSchema.index({ country: 1 });
leadSchema.index({ createdBy: 1 });
leadSchema.index({ score: -1 });
leadSchema.index({ companyName: 'text', email: 'text', website: 'text' });

module.exports = mongoose.model('Lead', leadSchema);
