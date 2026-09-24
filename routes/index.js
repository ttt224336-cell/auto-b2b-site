const express = require('express');
const r = express.Router();
const db = require('../db');

function getConfig(cb) {
  db.all('SELECT * FROM config', [], (e, rows) => {
    const config = {};
    (rows || []).forEach(row => { config[row.key] = row.value; });
    config.wa = config.contact_whatsapp || '+85264960641';
    config.email = config.contact_email || '';
    cb(config);
  });
}

function safeRender(res, data) {
  const base = {
    page: 'list',
    categories: [],
    products: [],
    product: null,
    keyword: '',
    catId: '',
    sort: 'date',
    config: res.locals.config || {},
    factory: {}
  };
  try {
    res.render('frontend/index', Object.assign(base, data));
  } catch (e) {
    console.error('render error', e);
    res.status(500).send('页面渲染失败');
  }
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
    p.push('%' + q + '%', '%' + q + '%', '%' + q + '%', '%' + q + '%');
  }
  if (cat) {
    w += ' AND category_id = ?';
    p.push(cat);
  }
  if (s === 'priceAsc') o = 'price ASC';
  if (s === 'priceDesc') o = 'price DESC';

  getConfig(config => {
    db.all('SELECT * FROM categories WHERE status=1 ORDER BY sort_order, id', [], (e, cats) => {
      db.all('SELECT * FROM products WHERE ' + w + ' ORDER BY ' + o, p, (e2, prods) => {
        db.get('SELECT * FROM factory_content WHERE id=1', [], (e3, factory) => {
          safeRender(res, {
            page: 'list',
            categories: cats || [],
            products: prods || [],
            product: null,
            catId: cat,
            keyword: q,
            sort: s,
            config: config,
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
        if (!p) {
          return safeRender(res, {
            page: 'list',
            categories: cats || [],
            products: [],
            product: null,
            config: config,
            factory: {}
          });
        }
        safeRender(res, {
          page: 'detail',
          categories: cats || [],
          products: [],
          product: p,
          config: config,
          factory: {}
        });
      });
    });
  });
});

r.post('/inquiry', (req, res) => {
  const b = req.body || {};
  db.run(
    'INSERT INTO inquiries (product_id, product_name, name, email, whatsapp, message) VALUES (?,?,?,?,?,?)',
    [b.product_id || null, b.product_name || '', b.name || '', b.email || '', b.whatsapp || '', b.message || ''],
    function (err) {
      if (err) return res.json({ success: false, message: '提交失败' });
      res.json({ success: true, message: '询盘已提交' });
    }
  );
});

module.exports = r;
