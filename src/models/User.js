const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
  name:         { type: String },
  email:        { type: String },
  enrollment:   { type: String },
  mobile:       { type: String },
  studentClass: { type: String },
});

const userSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true, unique: true },
  password:     { type: String, required: true },
  plainPassword: { type: String, default: '' },
  role:         { type: String, enum: ['admin','faculty','student'], required: true },
  enrollment:   { type: String },
  mobile:       { type: String },
  studentClass: { type: String },
  teamMembers:  [teamMemberSchema],
  isVerified:   { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);