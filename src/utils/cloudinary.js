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
  params: async (req, file) => ({
    folder:          'college-pms-uploads',
    resource_type:   'raw',
    public_id:       Date.now() + '_' + file.originalname.replace(/\s+/g, '_'),
    use_filename:    true,
    unique_filename: false,
  }),
});

const upload = multer({ storage });

// Fix URL — ensure it always uses raw/upload not image/upload
const fixCloudinaryUrl = (url) => {
  if (!url) return url;
  return url
    .replace('/image/upload/', '/raw/upload/')
    .replace('/video/upload/', '/raw/upload/');
};

// Generate a signed download URL for private/authenticated Cloudinary files
const getSignedDownloadUrl = (fileUrl) => {
  try {
    const fixedUrl = fixCloudinaryUrl(fileUrl);
    const match = fixedUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return fixedUrl;
    const publicId = match[1];
    return cloudinary.utils.private_download_url(publicId, null, {
      resource_type: 'raw',
      type:          'upload',
      attachment:    true,
      expires_at:    Math.floor(Date.now() / 1000) + 60 * 10,
    });
  } catch (err) {
    return fixCloudinaryUrl(fileUrl);
  }
};

module.exports = { cloudinary, upload, getSignedDownloadUrl, fixCloudinaryUrl };
