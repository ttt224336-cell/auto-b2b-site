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

  // 默认管理员 admin / 123456
  db.get('SELECT id FROM admins WHERE username = ?', ['admin'], (err, row) => {
    if (!row) {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('123456', 10);
      db.run('INSERT INTO admins (username, password, role) VALUES (?, ?, ?)', ['admin', hash, 'admin']);
    }
  });

  // 分类 - 新增 bg_image 底部背景图
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_zh TEXT NOT NULL,
    name_en TEXT DEFAULT '',
    parent_id INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,
    bg_image TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 尝试添加 bg_image 列（兼容旧库）
  db.run(`ALTER TABLE categories ADD COLUMN bg_image TEXT DEFAULT ''`, () => {});

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

  // 初始化默认配置
  const defaults = {
    site_name: 'AutoParts B2B',
    company_name: '汽配通工业自动化',
    contact_email: 'sales@example.com',
    contact_whatsapp: '+85264960641',
    copyright_text: '© 2026 AutoParts B2B. All rights reserved.',
    address: 'Hong Kong',
    hero_bg: '',
    hero_bg_opacity: '0.35',
    products_bg: '',
    products_bg_opacity: '0.25',
    factory_images: '',
    carousel_delay: '4000',
    carousel_effect: 'fade',
    carousel_random: '0',
    social1_img: '', social1_url: '',
    social2_img: '', social2_url: '',
    social3_img: '', social3_url: '',
    rate_usd: '0.128', rate_cny: '0.93', rate_krw: '175', rate_jpy: '19.5',
    rate_auto: '1',
    page_bg: '',
    page_bg_opacity: '0.15',
    page_bg_full: '1'
  };
  const stmt = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  Object.entries(defaults).forEach(([k, v]) => stmt.run(k, v));
  stmt.finalize();
});

module.exports = db;
