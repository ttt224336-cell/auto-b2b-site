const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, unique + ext);
  }
});

// 图片上传（产品/背景等）
const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|svg|bmp/i;
  const ok = allowed.test(path.extname(file.originalname)) ||
    (file.mimetype && /image\//i.test(file.mimetype));
  cb(null, !!ok);
};

// 数据包 JSON 上传
const jsonFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const ok = ext === '.json' ||
    (file.mimetype && (
      file.mimetype.includes('json') ||
      file.mimetype === 'application/octet-stream' ||
      file.mimetype === 'text/plain'
    ));
  cb(null, !!ok);
};

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFilter
});

upload.json = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: jsonFilter
});

// 兼容：不限制类型（仅数据包备用）
upload.anyFile = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});


// 完整备份包：允许 zip / json
const backupFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const ok = ['.zip', '.json'].includes(ext) ||
    (file.mimetype && (
      file.mimetype.includes('zip') ||
      file.mimetype.includes('json') ||
      file.mimetype === 'application/octet-stream'
    ));
  cb(null, !!ok);
};
upload.backup = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: backupFilter
});

module.exports = upload;

