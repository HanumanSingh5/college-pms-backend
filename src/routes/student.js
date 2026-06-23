const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const axios   = require('axios');
const Project = require('../models/Project');
const Task    = require('../models/Task');
const User    = require('../models/User');
const { upload, getSignedDownloadUrl } = require('../utils/cloudinary');

const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey123_college_pms_2024';

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ msg: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ msg: 'Invalid token' }); }
};

// Get student profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// Update profile + team members — with full validation and one-time lock
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, mobile, studentClass, teamMembers } = req.body;

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) return res.status(404).json({ msg: 'User not found' });

    // If team was already locked, block any further edits to teamMembers
    if (currentUser.teamLocked && JSON.stringify(teamMembers || []) !== JSON.stringify(currentUser.teamMembers)) {
      return res.status(403).json({
        msg: 'Your team has already been saved and locked. Contact your admin to make changes.'
      });
    }

    const isValidEmail  = (email)  => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const isValidMobile = (mobile) => /^[6-9]\d{9}$/.test(mobile);
    const isValidEnrollment = (enrollment) => /^\d{14}$/.test(enrollment);

    if (teamMembers && teamMembers.length > 0 && !currentUser.teamLocked) {
      const seenEmails      = new Set();
      const seenMobiles     = new Set();
      const seenEnrollments = new Set();
      const seenNames       = new Set();

      for (let i = 0; i < teamMembers.length; i++) {
        const m   = teamMembers[i];
        const num = i + 1;

        const name_       = (m.name || '').trim();
        const email_       = (m.email || '').trim().toLowerCase();
        const enrollment_  = (m.enrollment || '').trim().replace(/\D/g, '');
        const mobile_      = (m.mobile || '').trim();
        const studentClass_ = (m.studentClass || '').trim();

        if (!name_)        return res.status(400).json({ msg: `Member ${num}: Full name is required` });
        if (!enrollment_)  return res.status(400).json({ msg: `Member ${num}: Enrollment number is required` });
        if (!isValidEnrollment(enrollment_))
          return res.status(400).json({ msg: `Member ${num}: Enrollment number must be exactly 14 digits` });
        if (!email_)       return res.status(400).json({ msg: `Member ${num}: Email is required` });
        if (!isValidEmail(email_))
          return res.status(400).json({ msg: `Member ${num}: Enter a valid email address` });
        if (!mobile_)      return res.status(400).json({ msg: `Member ${num}: Mobile number is required` });
        if (!isValidMobile(mobile_))
          return res.status(400).json({ msg: `Member ${num}: Enter a valid 10-digit mobile number` });
        if (!studentClass_) return res.status(400).json({ msg: `Member ${num}: Class name is required` });

        // Duplicate check WITHIN the submitted team itself
        if (seenEmails.has(email_))
          return res.status(400).json({ msg: `Member ${num}: Duplicate email "${email_}" within your team` });
        if (seenMobiles.has(mobile_))
          return res.status(400).json({ msg: `Member ${num}: Duplicate mobile number within your team` });
        if (seenEnrollments.has(enrollment_))
          return res.status(400).json({ msg: `Member ${num}: Duplicate enrollment number within your team` });
        if (seenNames.has(name_.toLowerCase()))
          return res.status(400).json({ msg: `Member ${num}: Duplicate name within your team` });

        seenEmails.add(email_);
        seenMobiles.add(mobile_);
        seenEnrollments.add(enrollment_);
        seenNames.add(name_.toLowerCase());

        // Duplicate check AGAINST all existing students in the database (excluding self)
        const dupEmail = await User.findOne({
          role: 'student', _id: { $ne: req.user.id }, email: email_
        });
        if (dupEmail)
          return res.status(400).json({ msg: `Member ${num}: Email "${email_}" is already registered to another student` });

        const dupEnrollment = await User.findOne({
          role: 'student', _id: { $ne: req.user.id }, enrollment: enrollment_
        });
        if (dupEnrollment)
          return res.status(400).json({ msg: `Member ${num}: Enrollment "${enrollment_}" is already registered to another student` });

        const dupMobile = await User.findOne({
          role: 'student', _id: { $ne: req.user.id }, mobile: mobile_
        });
        if (dupMobile)
          return res.status(400).json({ msg: `Member ${num}: Mobile number is already registered to another student` });

        // Duplicate check against OTHER teams' members
        const dupInOtherTeam = await User.findOne({
          role: 'student',
          _id: { $ne: req.user.id },
          $or: [
            { 'teamMembers.email':      email_ },
            { 'teamMembers.enrollment': enrollment_ },
            { 'teamMembers.mobile':     mobile_ },
          ]
        });
        if (dupInOtherTeam)
          return res.status(400).json({ msg: `Member ${num}: This student is already part of another team` });

        // Normalize before saving
        teamMembers[i] = { name: name_, email: email_, enrollment: enrollment_, mobile: mobile_, studentClass: studentClass_ };
      }
    }

    const update = { name, mobile, studentClass };
    if (teamMembers && !currentUser.teamLocked) {
      update.teamMembers = teamMembers;
      update.teamLocked  = true; // lock after first successful save
    }

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: 'Failed to save: ' + err.message });
  }
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
router.post('/submit-definitions', auth, async (req, res) => {
  try {
    const { definitions } = req.body;

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

// Upload document for task (uses Cloudinary)
router.post('/task/:id/upload', auth, upload.single('document'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: 'Task not found' });

    if (!task.uploadEnabled) {
      return res.status(403).json({
        msg: 'Upload is disabled. Contact your faculty or admin.',
        uploadBlocked: true
      });
    }

    const isLate = task.dueDate && new Date() > new Date(task.dueDate);

    const alreadySubmitted = task.submissions.find(
      s => s.student?.toString() === req.user.id
    );
    if (alreadySubmitted) {
      return res.status(400).json({ msg: 'You have already submitted this task.' });
    }

    // Cloudinary returns full URL in req.file.path
    const fileUrl = req.file.path || req.file.secure_url || req.file.filename;

    task.submissions.push({
      student:     req.user.id,
      document:    fileUrl,
      comment:     req.body.comment || '',
      isLate:      isLate,
      submittedAt: new Date(),
    });

    task.status = isLate ? 'late' : 'completed';
    await task.save();

    res.json({
      msg: isLate ? 'Submitted (late)!' : 'Submitted successfully!',
      isLate, task
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

// Download / preview proxy for students — view or download their own submitted documents.
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
      // Try signed private download URL first (works for authenticated/private files)
      const signedUrl = getSignedDownloadUrl(fileUrl);
      response = await axios.get(signedUrl, { responseType: 'stream', timeout: 30000 });
    } catch (signedErr) {
      // Fallback — try the direct/public URL with fl_attachment
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
    console.log('Download error:', err.message);
    res.status(500).json({ msg: 'Download failed: ' + err.message });
  }
});

module.exports = router;