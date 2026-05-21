'use strict';
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['lead', 'campaign', 'automation', 'call', 'system'], default: 'system' },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  read: { type: Boolean, default: false },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
