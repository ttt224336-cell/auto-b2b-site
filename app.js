const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'ap2026-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 2 * 60 * 60 * 1000 }
}));

// 全局注入配置（使用 config 表，与 routes 一致）
const db = require('./db');
app.use((req, res, next) => {
  db.all(`SELECT key, value FROM config`, (err, rows) => {
    const cfg = {};
    if (!err && rows) rows.forEach(r => cfg[r.key] = r.value);
    // 兼容别名
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

// 404 兜底
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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 运行: http://localhost:${PORT}`);
  console.log(`🔐 登录: http://localhost:${PORT}/admin/login`);
  console.log(`👤 账号: admin / admin123（若首次启动为 123456，请在后台改密）`);
});
