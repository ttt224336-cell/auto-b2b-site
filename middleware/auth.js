const express = require('express');
const router = express.Router();
const db = require('../db/database.js');

// ============== 登录页面 ==============
router.get('/admin/login', async (req, res) => {
  try {
    res.render('admin/login');
  } catch (err) {
    console.error('[登录页渲染异常]', err);
    res.send('页面加载异常 <a href="/admin/login">刷新重试</a>');
  }
});

// ============== 登录提交（核心优化）==============
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('[登录提交] 用户名:', username);

  // 基础校验
  if (!username || !password) {
    console.log('⚠️ 账号或密码为空');
    return res.send(
      '请填写完整账号密码 <a href="/admin/login">返回登录</a>'
    );
  }

  try {
    // 数据库查询：与 database.js 表名/字段完全对应
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM admin_user WHERE username = ? AND password = ?',
        [username, password],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    if (user) {
      // ✅ 统一会话标记：只写 adminId，与中间件判断一致
      req.session.adminId = user.id;
      console.log('✅ 登录成功 → 跳转后台 /admin');
      // 确保写入完成再跳转，避免时序问题
      req.session.save((err) => {
        if (err) {
          console.error('❌ 会话保存失败', err);
          return res.send('登录状态异常 <a href="/admin/login">返回登录</a>');
        }
        res.redirect('/admin'); // 已修复：固定跳后台
      });
    } else {
      console.log('❌ 账号或密码错误');
      res.send(
        '账号或密码错误 <a href="/admin/login">返回登录</a>'
      );
    }
  } catch (err) {
    console.error('[登录数据库异常]', err);
    res.send(
      '系统繁忙，请稍后重试 <a href="/admin/login">返回登录</a>'
    );
  }
});

// ============== 退出登录 ==============
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('[退出异常]', err);
    res.redirect('/admin/login');
  });
});

module.exports = router;
