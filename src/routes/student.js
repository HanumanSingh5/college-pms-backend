const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const Project = require('../models/Project');
const Task    = require('../models/Task');
const User    = require('../models/User');

const JWT_SECRET = 'mysecretkey123';

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ msg: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ msg: 'Invalid token' }); }
};

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, Word, Excel, PPT, ZIP, TXT files allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Get student profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// Update profile + team members
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, mobile, studentClass, teamMembers } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, mobile, studentClass, teamMembers: teamMembers || [] },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// Get student's project
router.get('/project', auth, async (req, res) => {
  try {
    const project = await Project.findOne({ students: req.user.id })
      .populate('faculty', 'name email')
      .populate('students', 'name email enrollment studentClass mobile teamMembers')
      .populate('definitions.submittedBy', 'name enrollment');
    res.json(project);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// Submit project definitions (up to 5)
// Submit project definitions (up to 5)
// Submit project definitions (up to 5)
router.post('/submit-definitions', auth, async (req, res) => {
  try {
    const { definitions } = req.body;

    // Check if student already has a finalized project
    const existingProject = await Project.findOne({
      students: req.user.id,
      definitionStatus: 'finalized'
    });
    if (existingProject) {
      return res.status(400).json({
        msg: 'You are already part of a finalized group. You cannot join another group.'
      });
    }

    const project = await Project.findOne({ students: req.user.id });
    if (!project) return res.status(404).json({ msg: 'No project assigned yet. Contact admin.' });

    if (project.definitionStatus === 'finalized') {
      return res.status(400).json({ msg: 'Definitions already finalized by faculty.' });
    }

    if (!definitions || definitions.length === 0) {
      return res.status(400).json({ msg: 'Please add at least one definition.' });
    }

    if (definitions.length > 5) {
      return res.status(400).json({ msg: 'Maximum 5 definitions allowed.' });
    }

    const defs = definitions.map(d => ({
      title:       d.title       || '',
      description: d.description || '',
      frontend:    d.frontend    || '',
      backend:     d.backend     || '',
      submittedBy: req.user.id,
      submittedAt: new Date(),
    }));

    project.definitions      = defs;
    project.definition       = defs[0]?.description || '';
    project.title            = defs[0]?.title    || project.title;
    project.frontend         = defs[0]?.frontend || project.frontend;
    project.backend          = defs[0]?.backend  || project.backend;
    project.definitionStatus = 'submitted';
    await project.save();

    res.json({ msg: 'Definitions submitted successfully!', project });
  } catch (err) {
    console.log('Submit definitions error:', err.message);
    res.status(500).json({ msg: 'Failed to submit definitions' });
  }
});

// Get student's tasks
router.get('/tasks', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ assignedTo: req.user.id })
      .populate('assignedBy', 'name email')
      .populate('project', 'title groupNo')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// Update task status
router.put('/task/:id/status', auth, async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json(task);
  } catch { res.status(500).json({ msg: 'Failed to update' }); }
});


// Upload document for task
router.post('/task/:id/upload', auth, upload.single('document'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: 'Task not found' });

    // Check if upload is enabled
    if (!task.uploadEnabled) {
      return res.status(403).json({
        msg: 'Upload is disabled for this task. Your submission was past the due date. Contact your faculty or admin to enable upload.',
        uploadBlocked: true
      });
    }

    // Check if past due date — mark as late submission
    const isLate = task.dueDate && new Date() > new Date(task.dueDate);

    // Check if student already submitted
    const alreadySubmitted = task.submissions.find(
      s => s.student?.toString() === req.user.id
    );
    if (alreadySubmitted) {
      return res.status(400).json({ msg: 'You have already submitted this task.' });
    }

    task.submissions.push({
      student:     req.user.id,
      document:    req.file.filename,
      comment:     req.body.comment || '',
      isLate:      isLate,
      submittedAt: new Date(),
    });

    task.status = isLate ? 'late' : 'completed';
    await task.save();

    res.json({
      msg: isLate ? 'Submitted (late)!' : 'Submitted successfully!',
      isLate,
      task
    });
  } catch (err) {
    console.log('Upload error:', err.message);
    res.status(500).json({ msg: 'Upload failed: ' + err.message });
  }
});

// Stats
router.get('/stats', auth, async (req, res) => {
  try {
    const project   = await Project.findOne({ students: req.user.id });
    const tasks     = await Task.countDocuments({ assignedTo: req.user.id });
    const pending   = await Task.countDocuments({ assignedTo: req.user.id, status: 'pending' });
    const completed = await Task.countDocuments({ assignedTo: req.user.id, status: 'completed' });
    res.json({
      hasProject:       !!project,
      definitionStatus: project?.definitionStatus || 'pending',
      definitionsCount: project?.definitions?.length || 0,
      tasks, pending, completed,
    });
  } catch { res.status(500).json({ msg: 'Error' }); }
});

module.exports = router;