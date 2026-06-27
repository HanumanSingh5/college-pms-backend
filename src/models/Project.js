const mongoose = require('mongoose');

const definitionSchema = new mongoose.Schema({
  title:       { type: String },
  description: { type: String },
  frontend:    { type: String },
  backend:     { type: String },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: { type: Date, default: Date.now },
});

const projectSchema = new mongoose.Schema({
  title:              { type: String },
  description:        { type: String },
  definition:         { type: String },
  definitions:        [definitionSchema],
  finalDefinition:    { type: String },
  selectedDefinition: { type: Number, default: -1 },
  definitionStatus:   { type: String, enum: ['pending','submitted','finalized'], default: 'pending' },
  category:           { type: String, default: '' },
  groupNo:            { type: String },
  frontend:           { type: String },
  backend:            { type: String },
  faculty:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  students:           [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  attendance:         [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date:    { type: String },
    status:  { type: String, enum: ['present','absent','late','excused'], default: 'absent' },
    markedAt:{ type: Date, default: Date.now },
    markedBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
  status:             { type: String, enum: ['active','completed'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);