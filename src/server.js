require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
console.log('EMAIL_USER:', process.env.EMAIL_USER); // ← add this
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'loaded' : 'NOT loaded');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/faculty', require('./routes/faculty'));
app.use('/api/student', require('./routes/student'));

mongoose.connect('mongodb://localhost:27017/college-pms')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('DB Error:', err.message));

app.listen(5000, () => console.log('Server running on port 5000'));