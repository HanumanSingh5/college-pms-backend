const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const axios   = require('axios');
const Project = require('../models/Project');
const Task    = require('../models/Task');
const User    = require('../models/User');
const { detectCategory } = require('../utils/categorize');
const { getSignedDownloadUrl } = require('../utils/cloudinary');

const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey123_college_pms_2024';

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ msg: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ msg: 'Invalid token' }); }
};

// Stats
router.get('/stats', auth, async (req, res) => {
  try {
    const projects   = await Project.countDocuments({ faculty: req.user.id });
    const tasks      = await Task.countDocuments({ assignedBy: req.user.id });
    const pending    = await Task.countDocuments({ assignedBy: req.user.id, status: 'pending' });
    const completed  = await Task.countDocuments({ assignedBy: req.user.id, status: 'completed' });
    const late       = await Task.countDocuments({ assignedBy: req.user.id, status: 'late' });
    res.json({ projects, tasks, pending, completed, late });
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// Get faculty's projects
router.get('/projects', auth, async (req, res) => {
  try {
    const projects = await Project.find({ faculty: req.user.id })
      .populate('students', 'name email enrollment studentClass mobile teamMembers')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// Select and finalize definition
router.put('/project/:id/select-definition', auth, async (req, res) => {
  try {
    const { selectedIndex, finalDefinition } = req.body;
    const project = await Project.findOne({ _id: req.params.id, faculty: req.user.id });
    if (!project) return res.status(404).json({ msg: 'Project not found' });

    const def = project.definitions[selectedIndex];
    if (!def) return res.status(400).json({ msg: 'Invalid definition index' });

    project.selectedDefinition = selectedIndex;
    project.finalDefinition    = finalDefinition || def.description;
    project.title              = def.title    || project.title;
    project.frontend           = def.frontend || project.frontend;
    project.backend            = def.backend  || project.backend;
    project.definitionStatus   = 'finalized';

    // Auto-detect category from the finalized title + definition text
    project.category = detectCategory(project.title, project.finalDefinition);

    await project.save();

    res.json({ msg: 'Definition finalized!', project });
  } catch (err) {
    console.log('Finalize error:', err.message);
    res.status(500).json({ msg: 'Failed to finalize' });
  }
});

// Get all tasks
router.get('/tasks', auth, async (req, res) => {
  try {
    const now = new Date();
    await Task.updateMany(
      { assignedBy: req.user.id, dueDate: { $lt: now }, status: { $in: ['pending', 'in-progress'] } },
      { $set: { status: 'late' } }
    );
    const tasks = await Task.find({ assignedBy: req.user.id })
      .populate('assignedTo', 'name email enrollment')
      .populate('project', 'title groupNo')
      .populate('submissions.student', 'name email enrollment')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// Get late submissions
router.get('/late-submissions', auth, async (req, res) => {
  try {
    const now = new Date();
    await Task.updateMany(
      { assignedBy: req.user.id, dueDate: { $lt: now }, status: { $in: ['pending', 'in-progress'] } },
      { $set: { status: 'late' } }
    );
    const tasks = await Task.find({
      assignedBy: req.user.id,
      $or: [
        { status: 'late' },
        { dueDate: { $lt: now }, status: { $in: ['pending', 'in-progress'] } }
      ]
    })
      .populate('assignedTo', 'name email enrollment')
      .populate('project', 'title groupNo')
      .sort({ dueDate: 1 });
    res.json(tasks);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// Create task
router.post('/task', auth, async (req, res) => {
  try {
    const { title, description, phase, projectId, dueDate } = req.body;
    if (!dueDate) return res.status(400).json({ msg: 'Due date is required for every task' });

    const project = await Project.findOne({ _id: projectId, faculty: req.user.id });
    if (!project) return res.status(404).json({ msg: 'Project not found' });

    if (project.definitionStatus !== 'finalized')
      return res.status(400).json({ msg: 'Please finalize project definition before assigning tasks' });

    const task = await Task.create({
      title, description,
      phase:      phase || '',
      project:    projectId,
      assignedTo: project.students,
      assignedBy: req.user.id,
      dueDate:    new Date(dueDate),
    });
    res.json(task);
  } catch (err) {
    console.log('Create task error:', err.message);
    res.status(500).json({ msg: 'Failed to create task' });
  }
});

// Update task
router.put('/task/:id', auth, async (req, res) => {
  try {
    const { title, description, dueDate, status } = req.body;
    const update = {};
    if (title)       update.title       = title;
    if (description) update.description = description;
    if (dueDate)     update.dueDate     = new Date(dueDate);
    if (status)      update.status      = status;
    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(task);
  } catch { res.status(500).json({ msg: 'Failed to update' }); }
});

// Delete task
router.delete('/task/:id', auth, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Deleted' });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// Enable/disable upload for a task (faculty)
router.put('/task/:id/enable-upload', auth, async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { uploadEnabled: req.body.enabled },
      { new: true }
    );
    res.json({
      msg: req.body.enabled ? 'Upload enabled for students' : 'Upload disabled for students',
      task
    });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// Add/update faculty remark on a specific submission
router.put('/task/:taskId/remark/:submissionIndex', auth, async (req, res) => {
  try {
    const { remark } = req.body;
    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ msg: 'Task not found' });

    const idx = parseInt(req.params.submissionIndex);
    if (idx < 0 || idx >= task.submissions.length)
      return res.status(400).json({ msg: 'Invalid submission index' });

    task.submissions[idx].facultyRemark = remark || '';
    task.submissions[idx].remarkAt      = remark ? new Date() : null;
    await task.save();

    res.json({ msg: 'Remark saved', submission: task.submissions[idx] });
  } catch (err) {
    res.status(500).json({ msg: 'Failed to save remark: ' + err.message });
  }
});

// Faculty sends feedback on a specific student submission
router.put('/task/:taskId/submission/:studentId/feedback', auth, async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback || !feedback.trim())
      return res.status(400).json({ msg: 'Feedback message is required' });

    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ msg: 'Task not found' });

    const sub = task.submissions.find(
      s => s.student?.toString() === req.params.studentId
    );
    if (!sub) return res.status(404).json({ msg: 'Submission not found' });

    sub.facultyFeedback = feedback.trim();
    sub.feedbackAt = new Date();
    await task.save();

    res.json({ msg: 'Feedback sent successfully!', feedback: sub.facultyFeedback });
  } catch (err) {
    res.status(500).json({ msg: 'Failed to send feedback: ' + err.message });
  }
});

// Download / preview proxy for faculty — view or download a student's submitted document.
// No auth middleware here intentionally: this route is opened via <a href> / <iframe src>,
// which cannot send an Authorization header. It only proxies a Cloudinary file URL through,
// matching the same pattern already used by the student-side /download route.
// Pass ?inline=1 to display the file in-browser (used by the Preview modal);
// omit it (or pass ?inline=0) to force a file download.
router.get('/download', async (req, res) => {
  try {
    const fileUrl  = decodeURIComponent(req.query.url  || '');
    const fileName = decodeURIComponent(req.query.name || 'document');
    const inline    = req.query.inline === '1';

    if (!fileUrl || !fileUrl.startsWith('http'))
      return res.status(400).json({ msg: 'Invalid file URL' });

    let response;
    try {
      const signedUrl = getSignedDownloadUrl(fileUrl);
      response = await axios.get(signedUrl, { responseType: 'stream', timeout: 30000 });
    } catch (signedErr) {
      const fallbackUrl = fileUrl.includes('cloudinary.com')
        ? fileUrl.replace('/upload/', '/upload/fl_attachment/')
        : fileUrl;
      response = await axios.get(fallbackUrl, { responseType: 'stream', timeout: 30000 });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
    res.setHeader('Access-Control-Allow-Origin', '*');
    response.data.pipe(res);
  } catch (err) {
    console.log('Faculty download error:', err.message);
    res.status(500).json({ msg: 'Download failed: ' + err.message });
  }
});

module.exports = router;