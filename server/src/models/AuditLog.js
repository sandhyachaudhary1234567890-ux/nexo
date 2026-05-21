'use strict';
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  resource: { type: String, required: true },
  resourceId: { type: String },
  ip: { type: String },
  userAgent: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
