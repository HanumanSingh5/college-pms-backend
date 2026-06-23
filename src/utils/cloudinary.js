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
      folder:          'college-pms-uploads',
      resource_type:   'raw',
      public_id:       Date.now() + '_' + file.originalname.replace(/\s+/g, '_'),
      use_filename:    true,
      unique_filename: false,
    };
  },
});

const upload = multer({ storage });

// Extract the Cloudinary public_id (including folder) from a stored URL
const extractPublicId = (fileUrl) => {
  // Example URL:
  // https://res.cloudinary.com/<cloud>/raw/upload/v123456/college-pms-uploads/171234_file.pdf
  const match = fileUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  return match ? match[1] : null;
};

// Generate a signed, time-limited download URL — works even if the file is private/authenticated.
// Pass inline=true to get a URL that displays in-browser (used for the Preview modal);
// the default (inline=false) forces a file download, as before.
const getSignedDownloadUrl = (fileUrl, inline = false) => {
  try {
    const publicId = extractPublicId(fileUrl);
    if (!publicId) return fileUrl;

    return cloudinary.utils.private_download_url(publicId, null, {
      resource_type: 'raw',
      type:          'upload',
      attachment:    !inline,
      expires_at:    Math.floor(Date.now() / 1000) + 60 * 10, // valid 10 minutes
    });
  } catch (err) {
    console.log('Signed URL error:', err.message);
    return fileUrl;
  }
};

module.exports = { cloudinary, upload, getSignedDownloadUrl };