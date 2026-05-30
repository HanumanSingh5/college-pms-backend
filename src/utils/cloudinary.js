const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'college-pms-uploads',
    resource_type:  'raw',
    allowed_formats: ['pdf','doc','docx','xls','xlsx','ppt','pptx','zip','txt'],
  },
});

const upload = multer({ storage });

module.exports = { cloudinary, upload };