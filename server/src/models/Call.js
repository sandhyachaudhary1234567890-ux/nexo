'use strict';
const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String },
  joinedAt: { type: Date, default: Date.now },
  leftAt: { type: Date }
}, { _id: false });

const transcriptSchema = new mongoose.Schema({
  speaker: { type: String },
  text: { type: String },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const callSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  participants: [participantSchema],
  duration: { type: Number, default: 0 },
  status: { type: String, enum: ['waiting', 'active', 'ended'], default: 'waiting' },
  transcript: [transcriptSchema],
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

callSchema.index({ owner: 1 });

module.exports = mongoose.model('Call', callSchema);
