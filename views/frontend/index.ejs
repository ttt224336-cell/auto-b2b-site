const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const app = express();

// 确保 uploads 目录存在
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) { console.warn('mkdir uploads:', e.message); }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ap2026-secret-key-v2',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 4 * 60 * 60 * 1000 }
}));

const db = require('./db');

// 全局注入配置（容错：数据库异常也不阻塞页面）
app.use((req, res, next) => {
  res.locals.config = res.locals.config || {};
  db.all('SELECT key, value FROM config', [], (err, rows) => {
    const cfg = {};
    if (!err && rows) rows.forEach(r => { cfg[r.key] = r.value; });
    cfg.wa = cfg.contact_whatsapp || '+85264960641';
    cfg.email = cfg.contact_email || '';
    res.locals.config = cfg;
    next();
  });
});

const indexRouter = require('./routes/index');
const adminRouter = require('./routes/admin');
app.use('/', indexRouter);
app.use('/admin', adminRouter);

// 404
app.use((req, res) => {
  res.status(404).render('frontend/index', {
    page: 'list',
    categories: [],
    products: [],
    product: null,
    keyword: '',
    catId: '',
    sort: 'date',
    config: res.locals.config || {},
    factory: {}
  });
});

// 全局错误处理，避免裸 Internal Server Error
app.use((err, req, res, next) => {
  console.error('[ERROR]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).send('服务器暂时异常，请稍后重试。若持续出现，请查看 Render 日志。');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Running on port', PORT);
  console.log('Admin: /admin/login  (admin / 123456)');
});
