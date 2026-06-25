const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const Project = require('../models/Project');
const Task    = require('../models/Task');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey123';

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
    res.status(500).json({ msg: 'Error' });
  }
});

// Get all faculties
router.get('/faculties', auth, adminOnly, async (req, res) => {
  try {
    const faculties = await User.find({ role: 'faculty' }).sort({ createdAt: -1 });
    res.json(faculties);
  } catch (err) {
    res.status(500).json({ msg: 'Error' });
  }
});

// Get all students
router.get('/students', auth, adminOnly, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
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
    res.status(500).json({ msg: 'Error' });
  }
});

// CREATE faculty — NO email sent, credentials shown to admin only
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
      password:      hashed,
      plainPassword: password,
      role:          'faculty',
      isVerified:    true,
    });

    // Return plain password so admin can show/copy it
    res.json({
      msg: 'Faculty created successfully!',
      user,
      credentials: { email, password },
    });
  } catch (err) {
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
    res.status(500).json({ msg: 'Failed to create student' });
  }
});

// Generate a generic student registration link (no email required)
router.post('/invite-student', auth, adminOnly, async (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const Invite = require('../models/Invite');

    const token = uuidv4();
    // Store invite without email — student will fill it themselves
    await Invite.create({ email: '', role: 'student', token });
    const link = `${FRONTEND_URL}/register/${token}`;
    res.json({ msg: 'Registration link created', link });
  } catch (err) {
    res.status(500).json({ msg: 'Failed to create registration link' });
  }
});

// Bulk invite students via Excel — generates links, NO emails sent
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

    const results = { success: [], failed: [], invalidRows: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (
        row['Name'] || row['name'] || row['Student Name'] ||
        row['StudentName'] || row['Full Name'] || ''
      ).toString().trim();

      try {
        const token = uuidv4();
        await Invite.create({ email: '', role: 'student', token });
        const link = `${FRONTEND_URL}/register/${token}`;
        results.success.push({ name: name || 'Student ' + (i + 1), link });
      } catch (err) {
        results.failed.push({ row: i + 2, error: err.message });
      }
    }

    res.json({ msg: 'Links generated', total: rows.length, results });
  } catch (err) {
    res.status(500).json({ msg: 'Failed to process Excel: ' + err.message });
  }
});

// UPDATE faculty
router.put('/faculty/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const update = { name, email };
    if (password) {
      update.password      = await bcrypt.hash(password, 10);
      update.plainPassword = password;
    }
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

// UPDATE student team members (admin can always edit, even if locked)
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

// Toggle team lock — admin can unlock so student can edit again, or re-lock
router.put('/student/:id/team-lock', auth, adminOnly, async (req, res) => {
  try {
    const { locked } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { teamLocked: !!locked },
      { new: true }
    ).select('-password');
    res.json({ msg: locked ? 'Team locked' : 'Team unlocked — student can edit again', user });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// DELETE faculty
// Cascading cleanup: unassign (not delete) any projects this faculty was guiding,
// since those projects/students/tasks should NOT disappear just because the faculty is removed.
router.delete('/faculty/:id', auth, adminOnly, async (req, res) => {
  try {
    await Project.updateMany(
      { faculty: req.params.id },
      { $set: { faculty: null } }
    );
    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Deleted' });
  } catch { res.status(500).json({ msg: 'Failed' }); }
});

// Shared helper: fully removes a student and everything that belongs only to them —
// their Project(s) (since each student/team-leader owns exactly one Project),
// every Task under those Projects (which also removes that task from other
// students assigned to the same project, since the whole task record is project-scoped),
// and finally the User document itself.
const cascadeDeleteStudent = async (studentId) => {
  const projects = await Project.find({ students: studentId });
  const projectIds = projects.map(p => p._id);

  if (projectIds.length > 0) {
    await Task.deleteMany({ project: { $in: projectIds } });
    await Project.deleteMany({ _id: { $in: projectIds } });
  }

  await User.findByIdAndDelete(studentId);
};

// DELETE student — cascades to their project, team members, and all related tasks
router.delete('/student/:id', auth, adminOnly, async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Student not found' });

    await cascadeDeleteStudent(req.params.id);
    res.json({ msg: 'Student and all related project/group/task data deleted' });
  } catch (err) {
    res.status(500).json({ msg: 'Failed to delete: ' + err.message });
  }
});

// DELETE student by email (also deletes invite) — same cascading cleanup as above
router.delete('/invite/:email', auth, adminOnly, async (req, res) => {
  try {
    const Invite = require('../models/Invite');
    const email = decodeURIComponent(req.params.email);

    const students = await User.find({ email, role: 'student' });
    for (const s of students) {
      await cascadeDeleteStudent(s._id);
    }

    await Invite.deleteMany({ email });
    res.json({ msg: 'Student and all related project/group/task data deleted, invite removed' });
  } catch (err) {
    res.status(500).json({ msg: 'Failed: ' + err.message });
  }
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

// DELETE project — also removes its tasks, since tasks cannot meaningfully exist
// without the project they belong to (matches the cascade used when a student is deleted).
router.delete('/project/:id', auth, adminOnly, async (req, res) => {
  try {
    await Task.deleteMany({ project: req.params.id });
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
    res.status(500).json({ msg: 'Failed to assign group' });
  }
});

// GET all tasks (admin monitor)
router.get('/all-tasks', auth, adminOnly, async (req, res) => {
  try {
    const now = new Date();
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
    const project = await Project.findById(projectId).populate('faculty', 'name');
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