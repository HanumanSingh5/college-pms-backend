require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://college-pms-frontend.vercel.app',
  ],
  credentials: true,
}));

app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/faculty', require('./routes/faculty'));
app.use('/api/student', require('./routes/student'));

// FIXED: Use environment variable instead of hardcoded localhost
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('DB Error:', err.message));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));