const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径（保持你原有位置）
const dbPath = path.join(__dirname, 'auto_parts.db');
const db = new sqlite3.Database(dbPath);

// 初始化表结构
db.serialize(() => {
  // 管理员表 — 统一命名为 admin_user，和 auth.js 查询对应
  db.run(`CREATE TABLE IF NOT EXISTS admin_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  // 分类表
  db.run(`CREATE TABLE IF NOT EXISTS category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT
  )`);

  // 产品表
  db.run(`CREATE TABLE IF NOT EXISTS product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    oe TEXT,
    model TEXT,
    price REAL,
    category_id INTEGER,
    image TEXT,
    FOREIGN KEY(category_id) REFERENCES category(id)
  )`);

  // 询盘表（补充：前台提交的询价记录）
  db.run(`CREATE TABLE IF NOT EXISTS inquiry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT,
    contact TEXT,
    email TEXT,
    phone TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 初始化默认管理员账号 admin / 123456
  db.get("SELECT id FROM admin_user WHERE username = ?", ['admin'], (err, row) => {
    if (!row) {
      db.run(
        `INSERT INTO admin_user (username, password) VALUES (?, ?)`,
        ['admin', '123456'],
        (err) => {
          if (err) {
            console.error('❌ 初始化管理员账号失败:', err.message);
          } else {
            console.log('✅ 默认管理员账号已就绪: admin / 123456');
          }
        }
      );
    } else {
      console.log('✅ 管理员账号已存在');
    }
  });
});

module.exports = db;