const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const Invite = require('../models/Invite');

const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey123_college_pms_2024';

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'User not found' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, role: user.role, name: user.name, id: user._id });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Check invite token — no email required now
router.get('/invite/:token', async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token, used: false });
    if (!invite) return res.status(400).json({ msg: 'Invalid or expired link' });
    res.json({ role: invite.role });
  } catch {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Student self-registration via invite link — student enters their own email
router.post('/register/:token', async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token, used: false });
    if (!invite) return res.status(400).json({ msg: 'Invalid or expired invite link' });

    if (invite.role === 'faculty')
      return res.status(403).json({ msg: 'Faculty accounts are created by admin only.' });

    const { name, email, password, enrollment, studentClass, mobile } = req.body;

    if (!email || !email.includes('@'))
      return res.status(400).json({ msg: 'Valid email is required' });

    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail) return res.status(400).json({ msg: 'An account with this email already exists' });

    if (enrollment) {
      const existingEnrollment = await User.findOne({
        enrollment: enrollment.trim().toUpperCase(),
        role: 'student'
      });
      if (existingEnrollment)
        return res.status(400).json({ msg: 'Enrollment number "' + enrollment + '" is already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name:         name.trim(),
      email:        email.toLowerCase().trim(),
      password:     hashed,
      role:         'student',
      enrollment:   enrollment   ? enrollment.trim().toUpperCase() : '',
      studentClass: studentClass ? studentClass.trim()             : '',
      mobile:       mobile       ? mobile.trim()                   : '',
      isVerified:   true,
    });

    invite.used = true;
    await invite.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, role: user.role, name: user.name, id: user._id });
  } catch (err) {
    res.status(500).json({ msg: 'Registration failed: ' + err.message });
  }
});

module.exports = router;
