const express = require('express');
const router = express.Router();

// 登录页面
router.get('/login', (req, res) => {
  res.render('admin/login');
});

// 退出登录
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('[退出异常]', err);
    res.redirect('/admin/login');
  });
});

module.exports = router;
