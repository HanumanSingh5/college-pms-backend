const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  phase:       { type: String },
  project:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  assignedTo:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  assignedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:      { type: String, enum: ['pending','in-progress','completed','late'], default: 'pending' },
  dueDate:     { type: Date },
  uploadEnabled: { type: Boolean, default: true },  // ← NEW
  submissions: [{
    student:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    document:    { type: String },
    comment:     { type: String },
    submittedAt: { type: Date, default: Date.now },
    isLate:      { type: Boolean, default: false },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);