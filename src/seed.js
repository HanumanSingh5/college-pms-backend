const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

mongoose.connect('mongodb://localhost:27017/college-pms')
  .then(async () => {
    const existing = await User.findOne({ email: 'admin@college.com' });
    if (existing) {
      console.log('Admin already exists');
      process.exit();
    }
    const hashed = await bcrypt.hash('admin123', 10);
    await User.create({
      name: 'Administrator',
      email: 'admin@college.com',
      password: hashed,
      role: 'admin',
      isVerified: true,
    });
    console.log('Admin created successfully');
    console.log('Email: admin@college.com');
    console.log('Password: admin123');
    process.exit();
  });