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
  params: async (req, file) => {
    return {
      folder:        'college-pms-uploads',
      resource_type: 'raw',
      public_id:     Date.now() + '_' + file.originalname.replace(/\s+/g, '_'),
      // Generate a download URL with original filename preserved
      use_filename:  true,
      unique_filename: false,
    };
  },
});

const upload = multer({ storage });

// Generate a proper download URL for Cloudinary raw files
const getDownloadUrl = (fileUrl, originalName) => {
  if (!fileUrl) return fileUrl;
  try {
    // If it's already a Cloudinary URL, add fl_attachment to force download
    if (fileUrl.includes('cloudinary.com')) {
      // Insert fl_attachment flag into the URL
      return fileUrl.replace('/upload/', '/upload/fl_attachment/');
    }
    return fileUrl;
  } catch {
    return fileUrl;
  }
};

module.exports = { cloudinary, upload, getDownloadUrl };
