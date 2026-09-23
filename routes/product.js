const multer = require('multer');
const path = require('path');
const express = require('express');
const router = express.Router();
const db = require('../db/database.js');

// 鉴权中间件
const auth = require('../middleware/auth');

// multer图片上传配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/upload'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const saveName = Date.now() + ext;
    cb(null, saveName);
  }
});
const upload = multer({ storage });

//下面放你剩下原有业务代码

module.exports = router;
