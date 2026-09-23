const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

// 登录校验中间件
function requireLogin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

// 登录页
router.get('/login', (req, res) => {
  if (req.session && req.session.admin) return res.redirect('/admin/product');
  res.render('admin/login', { error: null, success: null });
});

// 登录提交
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, admin) => {
    if (err || !admin || !bcrypt.compareSync(password, admin.password)) {
      return res.render('admin/login', { error: '用户名或密码错误', success: null });
    }
    req.session.admin = { id: admin.id, username: admin.username, role: admin.role };
    res.redirect('/admin/product');
  });
});

// 修改密码接口（新增）
router.post('/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.json({ success: false, message: '参数错误，新密码至少6位' });
  }

  db.get('SELECT * FROM admins WHERE username = ?', ['admin'], (err, admin) => {
    if (err || !admin) {
      return res.json({ success: false, message: '用户不存在' });
    }

    if (!bcrypt.compareSync(oldPassword, admin.password)) {
      return res.json({ success: false, message: '当前密码错误' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE admins SET password = ? WHERE username = ?', [hash, 'admin'], (err2) => {
      if (err2) {
        return res.json({ success: false, message: '修改失败，请稍后重试' });
      }
      res.json({ success: true, message: '密码修改成功' });
    });
  });
});

// 退出
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// ========== 产品管理 ==========
router.get('/product', requireLogin, (req, res) => {
  const q = req.query.q || '';
  const cat = req.query.cat || '';
  const status = req.query.status || '';
  let where = '1=1';
  const params = [];

  if (q) {
    where += ' AND (name_zh LIKE ? OR name_en LIKE ? OR oe LIKE ? OR model LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (cat) {
    where += ' AND category_id = ?';
    params.push(cat);
  }
  if (status !== '') {
    where += ' AND status = ?';
    params.push(status);
  }

  db.all('SELECT * FROM categories ORDER BY sort_order, id', [], (e, cats) => {
    db.all(
      `SELECT p.*, c.name_zh as cat_name 
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE ${where} 
       ORDER BY p.id DESC`,
      params,
      (e2, list) => {
        res.render('admin/product', {
          page: 'product',
          admin: req.session.admin,
          productList: list || [],
          categoryList: cats || [],
          keyword: q,
          catId: cat,
          statusFilter: status
        });
      }
    );
  });
});

// 添加产品
router.post('/product/add', requireLogin, (req, res) => {
  const b = req.body;
  db.run(
    `INSERT INTO products 
     (category_id, name_zh, name_en, oe, model, price, stock, image, images, 
      description_zh, description_en, seo_title, seo_keywords, seo_desc, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      b.category_id || 0,
      b.name_zh,
      b.name_en || '',
      b.oe || '',
      b.model || '',
      b.price || 0,
      b.stock || 0,
      b.image || '',
      b.images || '',
      b.description_zh || '',
      b.description_en || '',
      b.seo_title || '',
      b.seo_keywords || '',
      b.seo_desc || '',
      b.status || 1
    ],
    function (err) {
      if (err) console.error(err);
      res.redirect('/admin/product');
    }
  );
});

// 编辑产品
router.post('/product/edit/:id', requireLogin, (req, res) => {
  const b = req.body;
  db.run(
    `UPDATE products SET 
     category_id=?, name_zh=?, name_en=?, oe=?, model=?, price=?, stock=?, 
     image=?, images=?, description_zh=?, description_en=?, 
     seo_title=?, seo_keywords=?, seo_desc=?, status=?, updated_at=CURRENT_TIMESTAMP 
     WHERE id=?`,
    [
      b.category_id || 0,
      b.name_zh,
      b.name_en || '',
      b.oe || '',
      b.model || '',
      b.price || 0,
      b.stock || 0,
      b.image || '',
      b.images || '',
      b.description_zh || '',
      b.description_en || '',
      b.seo_title || '',
      b.seo_keywords || '',
      b.seo_desc || '',
      b.status || 1,
      req.params.id
    ],
    () => res.redirect('/admin/product')
  );
});

// 删除产品
router.get('/product/del/:id', requireLogin, (req, res) => {
  db.run('DELETE FROM products WHERE id=?', [req.params.id], () => res.redirect('/admin/product'));
});

// 批量上架/下架
router.post('/product/batch', requireLogin, (req, res) => {
  const { ids, action } = req.body;
  if (!ids || !Array.isArray(ids)) return res.redirect('/admin/product');
  const status = action === 'on' ? 1 : 0;
  const placeholders = ids.map(() => '?').join(',');
  db.run(`UPDATE products SET status=? WHERE id IN (${placeholders})`, [status, ...ids], () => res.redirect('/admin/product'));
});

// ========== 分类管理 ==========
router.get('/category', requireLogin, (req, res) => {
  db.all(
    `SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id=c.id) as count 
     FROM categories c ORDER BY sort_order, id`,
    [],
    (e, list) => {
      res.render('admin/category', {
        page: 'category',
        admin: req.session.admin,
        categoryList: list || []
      });
    }
  );
});

router.post('/category/add', requireLogin, (req, res) => {
  const { name_zh, name_en, sort_order } = req.body;
  db.run(
    'INSERT INTO categories (name_zh, name_en, sort_order) VALUES (?,?,?)',
    [name_zh, name_en || '', sort_order || 0],
    () => res.redirect('/admin/category')
  );
});

router.post('/category/edit/:id', requireLogin, (req, res) => {
  const { name_zh, name_en, sort_order } = req.body;
  db.run(
    'UPDATE categories SET name_zh=?, name_en=?, sort_order=? WHERE id=?',
    [name_zh, name_en || '', sort_order || 0, req.params.id],
    () => res.redirect('/admin/category')
  );
});

router.get('/category/del/:id', requireLogin, (req, res) => {
  db.run('DELETE FROM categories WHERE id=?', [req.params.id], () => res.redirect('/admin/category'));
});

// ========== 工厂展示 ==========
router.get('/factory', requireLogin, (req, res) => {
  db.get('SELECT * FROM factory_content WHERE id=1', [], (e, content) => {
    res.render('admin/factory', {
      page: 'factory',
      admin: req.session.admin,
      content: content || {},
      saved: req.query.saved   // 这里补上了
    });
  });
});

router.post('/factory', requireLogin, (req, res) => {
  const b = req.body;
  db.run(
    `UPDATE factory_content SET 
     title_zh=?, title_en=?, intro_zh=?, intro_en=?, 
     advantages_zh=?, advantages_en=?, images=?, updated_at=CURRENT_TIMESTAMP 
     WHERE id=1`,
    [b.title_zh, b.title_en, b.intro_zh, b.intro_en, b.advantages_zh, b.advantages_en, b.images],
    () => res.redirect('/admin/factory?saved=1')
  );
});

// ========== 询盘管理 ==========
router.get('/inquiry', requireLogin, (req, res) => {
  db.all('SELECT * FROM inquiries ORDER BY id DESC', [], (e, list) => {
    res.render('admin/inquiry', {
      page: 'inquiry',
      admin: req.session.admin,
      inquiryList: list || []
    });
  });
});

router.post('/inquiry/reply/:id', requireLogin, (req, res) => {
  const { reply, status } = req.body;
  db.run(
    'UPDATE inquiries SET reply=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [reply, status || 'replied', req.params.id],
    () => res.redirect('/admin/inquiry')
  );
});

// ========== 系统设置 ==========
router.get('/settings', requireLogin, (req, res) => {
  db.all('SELECT * FROM config', [], (e, rows) => {
    const config = {};
    (rows || []).forEach(r => (config[r.key] = r.value));
    res.render('admin/settings', {
      page: 'settings',
      admin: req.session.admin,
      config,
      saved: req.query.saved
    });
  });
});

router.post('/settings', requireLogin, (req, res) => {
  // 所有可保存的字段（包含新增的底图和轮播延时）
  const fields = [
    'site_name',
    'company_name',
    'contact_email',
    'contact_whatsapp',
    'copyright_text',
    'address',
    'hero_bg',
    'products_bg',
    'factory_images',
    'carousel_delay',
    // 三个圆形图标（图片+链接）
    'social1_img', 'social1_url',
    'social2_img', 'social2_url',
    'social3_img', 'social3_url',
    // 汇率（相对 1 HKD）
    'rate_usd', 'rate_cny', 'rate_krw', 'rate_jpy'
  ];

  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  fields.forEach(k => {
    if (req.body[k] !== undefined) {
      stmt.run(k, req.body[k]);
    }
  });
  stmt.finalize(() => {
    res.redirect('/admin/settings?saved=1');
  });
});

// ========== 数据统计 ==========
router.get('/stats', requireLogin, (req, res) => {
  db.get('SELECT COUNT(*) as total FROM products', [], (e, p) => {
    db.get('SELECT COUNT(*) as total FROM categories', [], (e2, c) => {
      db.get('SELECT COUNT(*) as total FROM inquiries WHERE status="pending"', [], (e3, i) => {
        res.render('admin/stats', {
          page: 'stats',
          admin: req.session.admin,
          totalProduct: p ? p.total : 0,
          totalCategory: c ? c.total : 0,
          pendingInquiry: i ? i.total : 0
        });
      });
    });
  });
});

module.exports = router;