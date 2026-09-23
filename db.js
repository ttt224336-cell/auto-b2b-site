const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'auto_parts.db'));

db.serialize(() => {
  // 管理员
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 默认管理员 admin / 123456（首次运行会插入）
  db.get('SELECT id FROM admins WHERE username = ?', ['admin'], (err, row) => {
    if (!row) {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('123456', 10);
      db.run('INSERT INTO admins (username, password, role) VALUES (?, ?, ?)', ['admin', hash, 'admin']);
    }
  });

  // 分类
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_zh TEXT NOT NULL,
    name_en TEXT DEFAULT '',
    parent_id INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 产品
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER DEFAULT 0,
    name_zh TEXT NOT NULL,
    name_en TEXT DEFAULT '',
    oe TEXT DEFAULT '',
    model TEXT DEFAULT '',
    price REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    image TEXT DEFAULT '',
    images TEXT DEFAULT '',
    description_zh TEXT DEFAULT '',
    description_en TEXT DEFAULT '',
    seo_title TEXT DEFAULT '',
    seo_keywords TEXT DEFAULT '',
    seo_desc TEXT DEFAULT '',
    status INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 系统配置
  db.run(`CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // 工厂展示内容
  db.run(`CREATE TABLE IF NOT EXISTS factory_content (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title_zh TEXT DEFAULT '现代化生产基地 · 实力铸就品质',
    title_en TEXT DEFAULT 'Modern Manufacturing Base · Quality Built on Strength',
    intro_zh TEXT DEFAULT '',
    intro_en TEXT DEFAULT '',
    advantages_zh TEXT DEFAULT '',
    advantages_en TEXT DEFAULT '',
    images TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`INSERT OR IGNORE INTO factory_content (id) VALUES (1)`);

  // 客户询盘
  db.run(`CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    product_name TEXT,
    name TEXT,
    email TEXT,
    whatsapp TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    reply TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 操作日志
  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    action TEXT,
    detail TEXT,
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

module.exports = db;