const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema({
  email: { type: String },
  role:  { type: String, enum: ['faculty','student'], required: true },
  token: { type: String, required: true, unique: true },
  used:  { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Invite', inviteSchema);