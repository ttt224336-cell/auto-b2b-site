const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const app = express();

// Render / 反向代理
app.set('trust proxy', 1);

const uploadDir = path.join(__dirname, 'public', 'uploads');
const sessionDir = path.join(__dirname, 'data', 'sessions');
[uploadDir, sessionDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { console.warn('mkdir', dir, e.message); }
  }
});

// 简易文件 Session 存储（消除 MemoryStore 生产警告，单机可用）
class FileSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.dir = options.dir || sessionDir;
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }
  _file(sid) {
    const safe = String(sid).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dir, safe + '.json');
  }
  get(sid, cb) {
    const f = this._file(sid);
    fs.readFile(f, 'utf8', (err, data) => {
      if (err) return cb(null, null);
      try {
        const sess = JSON.parse(data);
        if (sess.__expires && Date.now() > sess.__expires) {
          fs.unlink(f, () => {});
          return cb(null, null);
        }
        cb(null, sess);
      } catch (e) {
        cb(null, null);
      }
    });
  }
  set(sid, sess, cb) {
    const f = this._file(sid);
    const maxAge = (sess.cookie && sess.cookie.maxAge) || 4 * 60 * 60 * 1000;
    const payload = Object.assign({}, sess, { __expires: Date.now() + maxAge });
    fs.writeFile(f, JSON.stringify(payload), (err) => cb && cb(err));
  }
  destroy(sid, cb) {
    fs.unlink(this._file(sid), () => cb && cb());
  }
  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new FileSessionStore({ dir: sessionDir }),
  secret: process.env.SESSION_SECRET || 'ap2026-secret-key-v2-change-me',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    maxAge: 4 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.RENDER === 'true' || process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

const db = require('./db');

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

app.use((err, req, res, next) => {
  console.error('[ERROR]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).send('服务器暂时异常，请稍后重试。若持续出现，请查看 Render 日志。');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Running on port', PORT);
  console.log('Admin: /admin/login');
});
