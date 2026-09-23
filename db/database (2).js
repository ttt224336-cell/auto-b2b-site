const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'auto_b2b.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS admin_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    create_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_cn TEXT,
    name_en TEXT,
    category_id INTEGER,
    status TEXT DEFAULT 'draft',
    sort INTEGER DEFAULT 0,
    material TEXT,
    size TEXT,
    package_info TEXT,
    moq TEXT,
    desc_cn TEXT,
    desc_en TEXT,
    url_slug TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_oe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    oe_no TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_car_model (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    car_info TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_image (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    img_url TEXT,
    is_main INTEGER DEFAULT 0,
    sort INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_cn TEXT,
    name_en TEXT,
    sort INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS inquiry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_name TEXT,
    email TEXT,
    whatsapp TEXT,
    product_id INTEGER,
    qty TEXT,
    demand TEXT,
    follow_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS site_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    value TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS carousel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    img_url TEXT,
    title_cn TEXT,
    title_en TEXT,
    link_url TEXT,
    sort INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS page_bg (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_key TEXT UNIQUE,
    img_url TEXT,
    mask_opacity REAL DEFAULT 0.6,
    enabled INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS button_style (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    main_color TEXT,
    hover_color TEXT,
    radius TEXT
  )`);

  const bcrypt = require('bcryptjs');
  const pwdHash = bcrypt.hashSync('admin123', 10);
  db.get(`SELECT id FROM admin_user WHERE username = ?`, ['admin'], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO admin_user(username,password) VALUES (?,?)`, ['admin', pwdHash]);
    }
  });
});

module.exports = db;
