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

// Check invite token validity
router.get('/invite/:token', async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token });
    if (!invite) return res.status(400).json({ msg: 'Invalid registration link.' });

    // Check expiry
    if (invite.expiresAt && new Date() > new Date(invite.expiresAt))
      return res.status(400).json({ msg: 'This registration link has expired. Ask admin for a new one.' });

    // Check max uses
    if (invite.usedCount >= invite.maxUses)
      return res.status(400).json({ msg: 'This registration link has reached its maximum uses.' });

    res.json({ role: invite.role });
  } catch {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Student self-registration — multiple students can use the same link concurrently
router.post('/register/:token', async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token });
    if (!invite) return res.status(400).json({ msg: 'Invalid registration link.' });

    // Check expiry
    if (invite.expiresAt && new Date() > new Date(invite.expiresAt))
      return res.status(400).json({ msg: 'This registration link has expired. Ask your admin for a new one.' });

    // Check max uses
    if (invite.usedCount >= invite.maxUses)
      return res.status(400).json({ msg: 'This registration link has reached its limit. Ask admin for a new one.' });

    if (invite.role === 'faculty')
      return res.status(403).json({ msg: 'Faculty accounts are created by admin only.' });

    const { name, email, password, enrollment, studentClass, mobile } = req.body;

    const isValidEmail = (e) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(e);
    const isValidEnrollment = (en) => /^\d{1,14}$/.test(en);
    const isStrongPassword = (p) =>
      p && p.length >= 8 &&
      /[A-Z]/.test(p) && /[a-z]/.test(p) &&
      /[0-9]/.test(p) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p);

    if (!email || !isValidEmail(email))
      return res.status(400).json({ msg: 'Enter a valid, real email address' });

    if (!password || !isStrongPassword(password))
      return res.status(400).json({ msg: 'Password must be at least 8 characters with uppercase, lowercase, number and special character (!@#$ etc.)' });

    if (!enrollment || !enrollment.trim())
      return res.status(400).json({ msg: 'Enrollment number is required' });

    const enrollmentDigits = enrollment.trim().replace(/\D/g, '');
    if (!isValidEnrollment(enrollmentDigits))
      return res.status(400).json({ msg: 'Enrollment number must contain only digits (max 14 numbers)' });

    // Check email not already taken
    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail)
      return res.status(400).json({ msg: 'An account with this email already exists. Try logging in.' });

    // Check enrollment not already taken
    const existingEnrollment = await User.findOne({
      enrollment: enrollmentDigits,
      role: 'student'
    });
    if (existingEnrollment)
      return res.status(400).json({ msg: 'Enrollment number "' + enrollmentDigits + '" is already registered.' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name:         name.trim(),
      email:        email.toLowerCase().trim(),
      password:     hashed,
      role:         'student',
      enrollment:   enrollmentDigits,
      studentClass: studentClass ? studentClass.trim()             : '',
      mobile:       mobile       ? mobile.trim()                   : '',
      isVerified:   true,
    });

    // Increment use count — does NOT mark as used so others can still register
    await Invite.findByIdAndUpdate(invite._id, { $inc: { usedCount: 1 } });

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