const express = require('express');
const r = express.Router();
const db = require('../db');

function getConfig(cb) {
  db.all('SELECT * FROM config', [], (e, rows) => {
    const config = {};
    (rows || []).forEach(row => config[row.key] = row.value);
    // 兼容旧字段
    config.wa = config.contact_whatsapp || '+85264960641';
    config.email = config.contact_email || '';
    cb(config);
  });
}

r.get('/', (req, res) => {
  const q = req.query.q || '';
  const cat = req.query.cat || '';
  const s = req.query.sort || 'date';
  let w = 'status = 1';
  const p = [];
  let o = 'id DESC';

  if (q) {
    w += ' AND (name_zh LIKE ? OR name_en LIKE ? OR oe LIKE ? OR model LIKE ?)';
    p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (cat) {
    w += ' AND category_id = ?';
    p.push(cat);
  }
  if (s === 'priceAsc') o = 'price ASC';
  if (s === 'priceDesc') o = 'price DESC';

  getConfig(config => {
    db.all('SELECT * FROM categories WHERE status=1 ORDER BY sort_order, id', [], (e, cats) => {
      db.all(`SELECT * FROM products WHERE ${w} ORDER BY ${o}`, p, (e2, prods) => {
        db.get('SELECT * FROM factory_content WHERE id=1', [], (e3, factory) => {
          res.render('frontend/index', {
            page: 'list',
            categories: cats || [],
            products: prods || [],
            product: null,
            catId: cat,
            keyword: q,
            sort: s,
            config,
            factory: factory || {}
          });
        });
      });
    });
  });
});

r.get('/product/:id', (req, res) => {
  getConfig(config => {
    db.get('SELECT * FROM products WHERE id=? AND status=1', [req.params.id], (e, p) => {
      db.all('SELECT * FROM categories WHERE status=1 ORDER BY sort_order, id', [], (e2, cats) => {
        res.render('frontend/index', {
          page: 'detail',
          categories: cats || [],
          products: [],
          product: p || null,
          catId: '',
          keyword: '',
          sort: 'date',
          config,
          factory: {}
        });
      });
    });
  });
});

module.exports = r;
