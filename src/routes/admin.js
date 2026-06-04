const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User    = require('../models/User');
const Project = require('../models/Project');
const Task    = require('../models/Task');

// Fallback to localhost if environment variable is not defined
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey123';

const getTransporter = () => nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (to, subject, html) => {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: '"College PMS" <' + process.env.EMAIL_USER + '>',
      to, subject, html,
    });
    console.log('Email sent to:', to);
    return true;
  } catch (err) {
    console.log('Email failed:', err.message);
    return false;
  }
};

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ msg: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ msg: 'Invalid token' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admin only' });
  next();
};

// Stats
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const faculties = await User.countDocuments({ role: 'faculty' });
    const students  = await User.countDocuments({ role: 'student' });
    const projects  = await Project.countDocuments();
    const tasks     = await Task.countDocuments();
    res.json({ faculties, students, projects, tasks });
  } catch (err) {
    console.log('Stats error:', err.message);
    res.status(500).json({ msg: 'Error' });
  }
});

// Get all faculties
router.get('/faculties', auth, adminOnly, async (req, res) => {
  try {
    const faculties = await User.find({ role: 'faculty' }).sort({ createdAt: -1 });
    res.json(faculties);
  } catch (err) {
    console.log('Faculties error:', err.message);
    res.status(500).json({ msg: 'Error' });
  }
});

// Get all students
router.get('/students', auth, adminOnly, async (req, res) => {
  try {
    console.log('Fetching students...');
    const students = await User.find({ role: 'student' }).sort({ createdAt: -1 });
    console.log('Students found:', students.length);
    res.json(students);
  } catch (err) {
    console.log('Students error:', err.message);
    res.status(500).json({ msg: 'Error' });
  }
});

// Get all student groups
router.get('/student-groups', auth, adminOnly, async (req, res) => {
  try {
    const students = await User.find({ role: 'student', isVerified: true })
      .select('-password')
      .sort({ createdAt: -1 });

    const groups = await Promise.all(students.map(async (s) => {
      const project = await Project.findOne({ students: s._id })
        .populate('faculty', 'name email');
      return {
        student:          s,
        teamMembers:      s.teamMembers || [],
        project:          project || null,
        definitions:      project?.definitions || [],
        definitionStatus: project?.definitionStatus || 'pending',
        faculty:          project?.faculty || null,
        groupNo:          project?.groupNo || null,
      };
    }));

    res.json(groups);
  } catch (err) {
    console.log('Student groups error:', err.message);
    res.status(500).json({ msg: 'Error' });
  }
});

// Get student definitions
router.get('/student-definitions', auth, adminOnly, async (req, res) => {
  try {
    const projects = await Project.find({ 'definitions.0': { $exists: true } })
      .populate('students', 'name email enrollment studentClass teamMembers')
      .populate('faculty', 'name')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    console.log('Student definitions error:', err.message);
    res.status(500).json({ msg: 'Error' });
  }
});

// CREATE faculty
router.post('/faculty', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ msg: 'Name, email and password are required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name, email,
      password: hashed,
      role: 'faculty',
      isVerified: true,
    });

    const loginUrl = `${FRONTEND_URL}/login`;

    const emailHtml = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">'
      + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">'
      + '<table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">'
      + '<tr><td style="background:#4f46e5;padding:32px;text-align:center">'
      + '<h1 style="color:white;margin:0;font-size:26px">College PMS</h1>'
      + '<p style="color:#c7d2fe;margin:8px 0 0;font-size:14px">Project Management System</p>'
      + '</td></tr>'
      + '<tr><td style="padding:32px 40px 16px">'
      + '<h2 style="margin:0 0 8px;color:#111">Welcome, ' + name + '!</h2>'
      + '<p style="color:#555;margin:0;font-size:15px;line-height:1.7">Your faculty account has been created.</p>'
      + '</td></tr>'
      + '<tr><td style="padding:16px 40px">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:12px;overflow:hidden">'
      + '<tr><td style="padding:18px 24px;border-bottom:1px solid #e0e7ff">'
      + '<p style="margin:0;font-size:12px;color:#6366f1;font-weight:700;text-transform:uppercase">Login URL</p>'
      + '<p style="margin:6px 0 0;font-size:15px"><a href="' + loginUrl + '" style="color:#4f46e5;font-weight:600">' + loginUrl + '</a></p>'
      + '</td></tr>'
      + '<tr><td style="padding:18px 24px;border-bottom:1px solid #e0e7ff">'
      + '<p style="margin:0;font-size:12px;color:#6366f1;font-weight:700;text-transform:uppercase">Email</p>'
      + '<p style="margin:6px 0 0;font-size:15px;font-weight:700;color:#1e1b4b">' + email + '</p>'
      + '</td></tr>'
      + '<tr><td style="padding:18px 24px">'
      + '<p style="margin:0;font-size:12px;color:#6366f1;font-weight:700;text-transform:uppercase">Password</p>'
      + '<p style="margin:8px 0 0"><span style="font-size:20px;font-weight:700;color:#1e1b4b;background:#e0e7ff;padding:8px 20px;border-radius:8px;font-family:monospace;letter-spacing:2px">' + password + '</span></p>'
      + '</td></tr></table></td></tr>'
      + '<tr><td style="padding:16px 40px 32px">'
      + '<a href="' + loginUrl + '" style="display:block;background:#4f46e5;color:white;text-align:center;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px">Login to College PMS</a>'
      + '</td></tr></table></td></tr></table></body></html>';

    sendEmail(email, 'College PMS — Your Faculty Login Credentials', emailHtml)
      .then(sent => console.log(sent ? 'Faculty email sent' : 'Faculty email failed'));

    res.json({ msg: 'Faculty created successfully!', user });
  } catch (err) {
    console.log('Create faculty error:', err.message);
    res.status(500).json({ msg: 'Failed to create faculty' });
  }
});

// CREATE student directly
router.post('/student', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, enrollment, mobile, studentClass } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ msg: 'Name, email and password are required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name, email,
      password: hashed,
      role: 'student',
      isVerified: true,
      enrollment:   enrollment   || '',
      mobile:       mobile       || '',
      studentClass: studentClass || '',
    });
    res.json({ msg: 'Student created successfully!', user });
  } catch (err) {
    console.log('Create student error:', err.message);
    res.status(500).json({ msg: 'Failed to create student' });
  }
});

// Single invite student
router.post('/invite-student', auth, adminOnly, async (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const Invite = require('../models/Invite');
    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: 'Email is required' });

    const existing = await User.findOne({ email, role: 'student' });
    if (existing) return res.status(400).json({ msg: 'Student with this email already exists' });

    const existingInvite = await Invite.findOne({ email, used: false });
    if (existingInvite) {
      const link = `${FRONTEND_URL}/register/${existingInvite.token}`;
      return res.json({ msg: 'Invite already exists', link });
    }

    const token = uuidv4();
    await Invite.create({ email, role: 'student', token });
    const link = `${FRONTEND_URL}/register/${token}`;
    res.json({ msg: 'Invite created', link });
  } catch (err) {
    console.log('Invite error:', err.message);
    res.status(500).json({ msg: 'Failed to create invite' });
  }
});

// Bulk invite students via Excel
const multer  = require('multer');
const XLSX    = require('xlsx');
const uploadExcel = multer({ storage: multer.memoryStorage() });

router.post('/upload-students-excel', auth, adminOnly, uploadExcel.single('file'), async (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const Invite = require('../models/Invite');

    if (!req.file) return res.status(400).json({ msg: 'No file uploaded' });

    const workbook  = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rows      = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0)
      return res.status(400).json({ msg: 'Excel file is empty' });

    const results = {
      success:           [],
      alreadyRegistered: [],
      alreadyInvited:    [],
      failed:            [],
      invalidRows:       [],
    };

    const transporter = getTransporter();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email = (
        row['Email'] || row['email'] || row['Email ID'] ||
        row['email_id'] || row['EmailID'] || row['Mail'] || row['mail'] || ''
      ).toString().trim().toLowerCase();

      const name = (
        row['Name'] || row['name'] || row['Student Name'] ||
        row['StudentName'] || row['Full Name'] || ''
      ).toString().trim();

      if (!email || !email.includes('@')) {
        results.invalidRows.push('Row ' + (i + 2) + ': Invalid email');
        continue;
      }

      try {
        const existing = await User.findOne({ email, role: 'student' });
        if (existing) { results.alreadyRegistered.push({ email, name: existing.name }); continue; }

        const existingInvite = await Invite.findOne({ email, used: false });
        if (existingInvite) {
          results.alreadyInvited.push({ email, name, link: `${FRONTEND_URL}/register/${existingInvite.token}` });
          continue;
        }

        const token = uuidv4();
        await Invite.create({ email, role: 'student', token });
        const link = `${FRONTEND_URL}/register/${token}`;

        let emailSent = false;
        try {
          await transporter.sendMail({
            from: '"College PMS" <' + process.env.EMAIL_USER + '>',
            to: email,
            subject: 'College PMS — Student Registration Link',
            html: '<h2>Hello ' + (name || 'Student') + '!</h2>'
              + '<p>Click the link below to register on College PMS:</p>'
              + '<a href="' + link + '" style="background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0">Register Now</a>'
              + '<p>Or copy: ' + link + '</p>'
              + '<p>Fill your Name, Enrollment Number, Class and set a password.</p>'
          });
          emailSent = true;
        } catch (emailErr) {
          console.log('Email failed for ' + email + ':', emailErr.message);
        }

        results.success.push({ email, name, link, emailSent });
      } catch (err) {
        results.failed.push({ email, error: err.message });
      }
    }

    res.json({ msg: 'Excel processed', total: rows.length, results });
  } catch (err) {
    console.log('Excel upload error:', err.message);
    res.status(500).json({ msg: 'Failed to process Excel: ' + err.message });
  }
});

// UPDATE faculty
router.put('/faculty/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const update = { name, email };
    if (password) update.password = await bcrypt.hash(password, 10);
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(user);
  } catch { res.status(500).json({ msg: 'Failed to update' }); }
});

// UPDATE student
router.put('/student/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, enrollment, mobile, studentClass } = req.body;
    const update = { name, email, enrollment, mobile, studentClass };
    if (password) update.password = await bcrypt.hash(password, 10);
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(user);
  } catch { res.status(500).json({ msg: 'Failed to update' }); }
});

// UPDATE student team members
router.put('/student/:id/team', auth, adminOnly, async (req, res) => {
  try {
    const { teamMembers } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { teamMembers: teamMembers || [] },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// DELETE faculty
router.delete('/faculty/:id', auth, adminOnly, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Deleted' });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// DELETE student
router.delete('/student/:id', auth, adminOnly, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Deleted' });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// DELETE student by email (also deletes invite)
router.delete('/invite/:email', auth, adminOnly, async (req, res) => {
  try {
    const Invite = require('../models/Invite');
    const email = decodeURIComponent(req.params.email);
    await User.deleteMany({ email, role: 'student' });
    await Invite.deleteMany({ email });
    res.json({ msg: 'Student and invite deleted' });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// GET all projects
router.get('/projects', auth, adminOnly, async (req, res) => {
  try {
    const projects = await Project.find()
      .populate('faculty', 'name email')
      .populate('students', 'name email enrollment mobile studentClass teamMembers')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// CREATE project
router.post('/project', auth, adminOnly, async (req, res) => {
  try {
    const { title, description, definition, faculty, students, groupNo, frontend, backend } = req.body;
    const project = await Project.create({
      title:       title       || '',
      description: description || '',
      definition:  definition  || '',
      groupNo:     groupNo     || '',
      frontend:    frontend    || '',
      backend:     backend     || '',
      faculty:     faculty     || null,
      students:    students    || [],
    });
    res.json(project);
  } catch (err) {
    console.log('Create project error:', err.message);
    res.status(500).json({ msg: 'Failed to create project' });
  }
});

// UPDATE project
router.put('/project/:id', auth, adminOnly, async (req, res) => {
  try {
    const { title, description, definition, faculty, students, groupNo, frontend, backend } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      {
        title:       title       || '',
        description: description || '',
        definition:  definition  || '',
        groupNo:     groupNo     || '',
        frontend:    frontend    || '',
        backend:     backend     || '',
        faculty:     faculty     || null,
        students:    students    || [],
      },
      { new: true }
    );
    res.json(project);
  } catch { res.status(500).json({ msg: 'Failed to update' }); }
});

// DELETE project
router.delete('/project/:id', auth, adminOnly, async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Deleted' });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// Assign group to faculty
router.post('/assign-group', auth, adminOnly, async (req, res) => {
  try {
    const { studentId, facultyId, groupNo } = req.body;
    if (!studentId || !facultyId || !groupNo)
      return res.status(400).json({ msg: 'Student, Faculty and Group No are required' });

    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ msg: 'Student not found' });

    // Check if student is already in another finalized group
    const finalizedProject = await Project.findOne({
      students: studentId,
      definitionStatus: 'finalized'
    });
    if (finalizedProject) {
      return res.status(400).json({
        msg: 'This student is already in a finalized group (' + finalizedProject.groupNo + '). Cannot reassign.'
      });
    }

    let project = await Project.findOne({ students: studentId });
    if (project) {
      project.faculty  = facultyId;
      project.groupNo  = groupNo;
      await project.save();
    } else {
      project = await Project.create({
        title:            student.name + "'s Group",
        description:      'Project group for ' + student.name,
        groupNo:          groupNo,
        faculty:          facultyId,
        students:         [studentId],
        definitionStatus: 'pending',
      });
    }

    res.json({ msg: 'Group assigned to faculty!', project });
  } catch (err) {
    console.log('Assign group error:', err.message);
    res.status(500).json({ msg: 'Failed to assign group' });
  }
});

// GET all tasks (admin monitor)
router.get('/all-tasks', auth, adminOnly, async (req, res) => {
  try {
    const now = new Date();
    // Auto mark late
    await Task.updateMany(
      { dueDate: { $lt: now }, status: { $in: ['pending','in-progress'] } },
      { $set: { status: 'late' } }
    );
    const tasks = await Task.find()
      .populate('assignedTo', 'name email enrollment')
      .populate('assignedBy', 'name email')
      .populate('project', 'title groupNo')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch { res.status(500).json({ msg: 'Error' }); }
});

// CREATE task (admin)
router.post('/task', auth, adminOnly, async (req, res) => {
  try {
    const { title, description, phase, projectId, dueDate } = req.body;
    if (!title || !description || !projectId || !dueDate)
      return res.status(400).json({ msg: 'All fields are required' });
    const project = await Project.findById(projectId)
      .populate('faculty', 'name');
    if (!project) return res.status(404).json({ msg: 'Project not found' });
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
    console.log('Admin create task error:', err.message);
    res.status(500).json({ msg: 'Failed to create task' });
  }
});

// UPDATE task (admin)
router.put('/task/:id', auth, adminOnly, async (req, res) => {
  try {
    const { title, description, dueDate, status } = req.body;
    const update = {};
    if (title)       update.title       = title;
    if (description) update.description = description;
    if (dueDate)     update.dueDate     = new Date(dueDate);
    if (status)      update.status      = status;
    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('assignedTo', 'name email enrollment')
      .populate('assignedBy', 'name email')
      .populate('project', 'title groupNo');
    res.json(task);
  } catch { res.status(500).json({ msg: 'Failed to update' }); }
});

// DELETE task (admin)
router.delete('/task/:id', auth, adminOnly, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Deleted' });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// Enable/disable upload for a task (admin)
router.put('/task/:id/enable-upload', auth, adminOnly, async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { uploadEnabled: req.body.enabled },
      { new: true }
    ).populate('assignedTo', 'name email')
     .populate('project', 'title groupNo');
    res.json({
      msg: req.body.enabled ? 'Upload enabled!' : 'Upload disabled!',
      task
    });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

module.exports = router;