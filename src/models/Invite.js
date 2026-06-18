const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema({
  email:     { type: String, default: '' },
  role:      { type: String, enum: ['faculty','student'], required: true },
  token:     { type: String, required: true, unique: true },
  used:      { type: Boolean, default: false },
  usedCount: { type: Number, default: 0 },     // how many students used this link
  maxUses:   { type: Number, default: 999 },   // allow multiple uses — admin generates one link for the whole class
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, // 30 days
}, { timestamps: true });

module.exports = mongoose.model('Invite', inviteSchema);
