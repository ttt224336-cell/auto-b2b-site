const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const upload = require('../middleware/upload');
let axios;
try { axios = require('axios'); } catch (e) { axios = null; }

function requireLogin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

// ---------- 登录 ----------
router.get('/login', (req, res) => {
  if (req.session && req.session.admin) return res.redirect('/admin/product');
  res.render('admin/login', { error: null, success: null });
});

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

router.post('/change-password', requireLogin, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.json({ success: false, message: '参数错误，新密码至少6位' });
  }
  db.get('SELECT * FROM admins WHERE username = ?', ['admin'], (err, admin) => {
    if (err || !admin) return res.json({ success: false, message: '用户不存在' });
    if (!bcrypt.compareSync(oldPassword, admin.password)) {
      return res.json({ success: false, message: '当前密码错误' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE admins SET password = ? WHERE username = ?', [hash, 'admin'], (err2) => {
      if (err2) return res.json({ success: false, message: '修改失败' });
      res.json({ success: true, message: '密码修改成功' });
    });
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ---------- 通用：处理图片字段（URL 或上传文件） ----------
function resolveImage(req, fieldName, bodyField) {
  if (req.files && req.files[fieldName] && req.files[fieldName][0]) {
    return '/uploads/' + req.files[fieldName][0].filename;
  }
  return (req.body[bodyField] || '').trim();
}

// ---------- 产品管理 ----------
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
  if (cat) { where += ' AND category_id = ?'; params.push(cat); }
  if (status !== '') { where += ' AND status = ?'; params.push(status); }

  db.all('SELECT * FROM categories ORDER BY sort_order, id', [], (e, cats) => {
    db.all(
      `SELECT p.*, c.name_zh as cat_name FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE ${where} ORDER BY p.id DESC`, params,
      (e2, list) => {
        res.render('admin/product', {
          page: 'product', admin: req.session.admin,
          productList: list || [], categoryList: cats || [],
          keyword: q, catId: cat, statusFilter: status
        });
      }
    );
  });
});

router.post('/product/add', requireLogin, upload.fields([
  { name: 'image_file', maxCount: 1 },
  { name: 'images_file', maxCount: 8 }
]), (req, res) => {
  const b = req.body;
  let image = resolveImage(req, 'image_file', 'image');
  let images = (b.images || '').trim();
  if (req.files && req.files.images_file) {
    const urls = req.files.images_file.map(f => '/uploads/' + f.filename);
    images = images ? images + ',' + urls.join(',') : urls.join(',');
  }
  db.run(
    `INSERT INTO products 
     (category_id, name_zh, name_en, oe, model, price, stock, image, images, 
      description_zh, description_en, seo_title, seo_keywords, seo_desc, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      b.category_id || 0, b.name_zh, b.name_en || '', b.oe || '', b.model || '',
      b.price || 0, b.stock || 0, image, images,
      b.description_zh || '', b.description_en || '',
      b.seo_title || '', b.seo_keywords || '', b.seo_desc || '', b.status || 1
    ],
    function (err) {
      if (err) console.error(err);
      res.redirect('/admin/product');
    }
  );
});

router.post('/product/edit/:id', requireLogin, upload.fields([
  { name: 'image_file', maxCount: 1 },
  { name: 'images_file', maxCount: 8 }
]), (req, res) => {
  const b = req.body;
  let image = resolveImage(req, 'image_file', 'image');
  let images = (b.images || '').trim();
  if (req.files && req.files.images_file) {
    const urls = req.files.images_file.map(f => '/uploads/' + f.filename);
    images = images ? images + ',' + urls.join(',') : urls.join(',');
  }
  db.run(
    `UPDATE products SET 
     category_id=?, name_zh=?, name_en=?, oe=?, model=?, price=?, stock=?, 
     image=?, images=?, description_zh=?, description_en=?, 
     seo_title=?, seo_keywords=?, seo_desc=?, status=?, updated_at=CURRENT_TIMESTAMP 
     WHERE id=?`,
    [
      b.category_id || 0, b.name_zh, b.name_en || '', b.oe || '', b.model || '',
      b.price || 0, b.stock || 0, image, images,
      b.description_zh || '', b.description_en || '',
      b.seo_title || '', b.seo_keywords || '', b.seo_desc || '', b.status || 1,
      req.params.id
    ],
    () => res.redirect('/admin/product')
  );
});

router.get('/product/del/:id', requireLogin, (req, res) => {
  db.run('DELETE FROM products WHERE id=?', [req.params.id], () => res.redirect('/admin/product'));
});

router.post('/product/batch', requireLogin, (req, res) => {
  const { ids, action } = req.body;
  if (!ids || !Array.isArray(ids)) return res.redirect('/admin/product');
  const status = action === 'on' ? 1 : 0;
  const placeholders = ids.map(() => '?').join(',');
  db.run(`UPDATE products SET status=? WHERE id IN (${placeholders})`, [status, ...ids], () => res.redirect('/admin/product'));
});

// ---------- 分类管理（含底部背景图） ----------
router.get('/category', requireLogin, (req, res) => {
  db.all(
    `SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id=c.id) as count 
     FROM categories c ORDER BY sort_order, id`, [],
    (e, list) => {
      res.render('admin/category', {
        page: 'category', admin: req.session.admin, categoryList: list || []
      });
    }
  );
});

router.post('/category/add', requireLogin, upload.single('bg_file'), (req, res) => {
  const { name_zh, name_en, sort_order } = req.body;
  let bg = (req.body.bg_image || '').trim();
  if (req.file) bg = '/uploads/' + req.file.filename;
  db.run(
    'INSERT INTO categories (name_zh, name_en, sort_order, bg_image) VALUES (?,?,?,?)',
    [name_zh, name_en || '', sort_order || 0, bg],
    () => res.redirect('/admin/category')
  );
});

router.post('/category/edit/:id', requireLogin, upload.single('bg_file'), (req, res) => {
  const { name_zh, name_en, sort_order } = req.body;
  let bg = (req.body.bg_image || '').trim();
  if (req.file) bg = '/uploads/' + req.file.filename;
  db.run(
    'UPDATE categories SET name_zh=?, name_en=?, sort_order=?, bg_image=? WHERE id=?',
    [name_zh, name_en || '', sort_order || 0, bg, req.params.id],
    () => res.redirect('/admin/category')
  );
});

router.get('/category/del/:id', requireLogin, (req, res) => {
  db.run('DELETE FROM categories WHERE id=?', [req.params.id], () => res.redirect('/admin/category'));
});

// ---------- 工厂展示 ----------
router.get('/factory', requireLogin, (req, res) => {
  db.get('SELECT * FROM factory_content WHERE id=1', [], (e, content) => {
    res.render('admin/factory', {
      page: 'factory', admin: req.session.admin,
      content: content || {}, saved: req.query.saved
    });
  });
});

router.post('/factory', requireLogin, upload.array('images_file', 12), (req, res) => {
  const b = req.body;
  let images = (b.images || '').trim();
  if (req.files && req.files.length) {
    const urls = req.files.map(f => '/uploads/' + f.filename);
    images = images ? images + ',' + urls.join(',') : urls.join(',');
  }
  db.run(
    `UPDATE factory_content SET 
     title_zh=?, title_en=?, intro_zh=?, intro_en=?, 
     advantages_zh=?, advantages_en=?, images=?, updated_at=CURRENT_TIMESTAMP 
     WHERE id=1`,
    [b.title_zh, b.title_en, b.intro_zh, b.intro_en, b.advantages_zh, b.advantages_en, images],
    () => res.redirect('/admin/factory?saved=1')
  );
});

// ---------- 询盘 ----------
router.get('/inquiry', requireLogin, (req, res) => {
  db.all('SELECT * FROM inquiries ORDER BY id DESC', [], (e, list) => {
    res.render('admin/inquiry', {
      page: 'inquiry', admin: req.session.admin, inquiryList: list || []
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

// ---------- 系统设置（背景、透明度、轮播特效、汇率） ----------
router.get('/settings', requireLogin, (req, res) => {
  db.all('SELECT * FROM config', [], (e, rows) => {
    const config = {};
    (rows || []).forEach(r => (config[r.key] = r.value));
    res.render('admin/settings', {
      page: 'settings', admin: req.session.admin, config, saved: req.query.saved
    });
  });
});

router.post('/settings', requireLogin, upload.fields([
  { name: 'hero_bg_file', maxCount: 1 },
  { name: 'products_bg_file', maxCount: 1 },
  { name: 'page_bg_file', maxCount: 1 },
  { name: 'social1_file', maxCount: 1 },
  { name: 'social2_file', maxCount: 1 },
  { name: 'social3_file', maxCount: 1 }
]), (req, res) => {
  const fields = [
    'site_name', 'company_name', 'contact_email', 'contact_whatsapp', 'copyright_text', 'address',
    'hero_bg', 'hero_bg_opacity', 'products_bg', 'products_bg_opacity',
    'page_bg', 'page_bg_opacity', 'page_bg_full',
    'factory_images', 'carousel_delay', 'carousel_effect', 'carousel_random',
    'social1_img', 'social1_url', 'social2_img', 'social2_url', 'social3_img', 'social3_url',
    'rate_usd', 'rate_cny', 'rate_krw', 'rate_jpy', 'rate_auto'
  ];
  // 覆盖上传文件
  if (req.files) {
    if (req.files.hero_bg_file) req.body.hero_bg = '/uploads/' + req.files.hero_bg_file[0].filename;
    if (req.files.products_bg_file) req.body.products_bg = '/uploads/' + req.files.products_bg_file[0].filename;
    if (req.files.page_bg_file) req.body.page_bg = '/uploads/' + req.files.page_bg_file[0].filename;
    if (req.files.social1_file) req.body.social1_img = '/uploads/' + req.files.social1_file[0].filename;
    if (req.files.social2_file) req.body.social2_img = '/uploads/' + req.files.social2_file[0].filename;
    if (req.files.social3_file) req.body.social3_img = '/uploads/' + req.files.social3_file[0].filename;
  }
  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  fields.forEach(k => {
    if (req.body[k] !== undefined) stmt.run(k, req.body[k]);
  });
  stmt.finalize(() => res.redirect('/admin/settings?saved=1'));
});

// ---------- 实时汇率 ----------
router.get('/api/rates', requireLogin, async (req, res) => {
  if (!axios) return res.json({ success: false, message: 'axios 未安装' });
  try {
    // 免费 API：以 HKD 为基准
    const r = await axios.get('https://open.er-api.com/v6/latest/HKD', { timeout: 8000 });
    if (r.data && r.data.rates) {
      const rates = {
        usd: (1 / r.data.rates.USD).toFixed(4),
        cny: (1 / r.data.rates.CNY).toFixed(4),
        krw: (1 / r.data.rates.KRW).toFixed(2),
        jpy: (1 / r.data.rates.JPY).toFixed(2),
        updated: r.data.time_last_update_utc || new Date().toISOString()
      };
      // 可选自动写入 config
      if (req.query.save === '1') {
        const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
        stmt.run('rate_usd', rates.usd);
        stmt.run('rate_cny', rates.cny);
        stmt.run('rate_krw', rates.krw);
        stmt.run('rate_jpy', rates.jpy);
        stmt.finalize();
      }
      return res.json({ success: true, rates, base: 'HKD' });
    }
    res.json({ success: false, message: '获取失败' });
  } catch (e) {
    res.json({ success: false, message: e.message || '网络错误' });
  }
});

// ---------- 智能翻译（中英互译） ----------
router.post('/api/translate', requireLogin, async (req, res) => {
  const { text, from = 'zh', to = 'en' } = req.body;
  if (!text || !text.trim()) return res.json({ success: false, message: '无文本' });
  if (!axios) return res.json({ success: false, message: 'axios 未安装，请手动翻译' });
  try {
    // 使用 MyMemory 免费翻译 API
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
    const r = await axios.get(url, { timeout: 10000 });
    const translated = r.data?.responseData?.translatedText || text;
    res.json({ success: true, translated, from, to });
  } catch (e) {
    // 降级：简单词典映射常用词
    const dict = {
      '刹车片': 'Brake Pads', '机油滤清器': 'Oil Filter', '空气滤清器': 'Air Filter',
      '火花塞': 'Spark Plug', '雨刷': 'Wiper Blade', '轮胎': 'Tire', '减震器': 'Shock Absorber',
      '发电机': 'Alternator', '起动机': 'Starter Motor', '散热器': 'Radiator',
      '高质量': 'High Quality', '原厂': 'OEM', '适用': 'Compatible with', '汽车': 'Automotive'
    };
    let result = text;
    Object.entries(dict).forEach(([zh, en]) => {
      if (from === 'zh') result = result.replace(new RegExp(zh, 'g'), en);
      else result = result.replace(new RegExp(en, 'gi'), zh);
    });
    res.json({ success: true, translated: result, from, to, note: '使用本地词典降级翻译' });
  }
});

// ---------- 数据包：导出 / 分析 / 一键导入 ----------
router.get('/datapack', requireLogin, (req, res) => {
  res.render('admin/datapack', {
    page: 'datapack', admin: req.session.admin, result: null
  });
});

router.get('/datapack/export', requireLogin, (req, res) => {
  db.all('SELECT * FROM categories ORDER BY id', [], (e1, cats) => {
    db.all('SELECT * FROM products ORDER BY id', [], (e2, prods) => {
      db.get('SELECT * FROM factory_content WHERE id=1', [], (e3, factory) => {
        db.all('SELECT * FROM config', [], (e4, confRows) => {
          const config = {};
          (confRows || []).forEach(r => config[r.key] = r.value);
          const pack = {
            version: '2.0',
            exported_at: new Date().toISOString(),
            description: '汽配B2B数据包 - 包含分类、产品、工厂、配置',
            categories: cats || [],
            products: prods || [],
            factory: factory || {},
            config: config
          };
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename=auto-b2b-datapack.json');
          res.send(JSON.stringify(pack, null, 2));
        });
      });
    });
  });
});

router.post('/datapack/analyze', requireLogin, upload.json.single('pack_file'), (req, res) => {
  let data = null;
  try {
    if (req.file) {
      const raw = fs.readFileSync(req.file.path, 'utf8');
      data = JSON.parse(raw);
      fs.unlinkSync(req.file.path);
    } else if (req.body.pack_json) {
      data = JSON.parse(req.body.pack_json);
    }
  } catch (e) {
    return res.render('admin/datapack', {
      page: 'datapack', admin: req.session.admin,
      result: { error: 'JSON 解析失败: ' + e.message }
    });
  }
  if (!data) {
    return res.render('admin/datapack', {
      page: 'datapack', admin: req.session.admin,
      result: { error: '未提供数据包' }
    });
  }
  const analysis = {
    version: data.version || 'unknown',
    categories: (data.categories || []).length,
    products: (data.products || []).length,
    hasFactory: !!data.factory,
    configKeys: Object.keys(data.config || {}).length,
    sampleCats: (data.categories || []).slice(0, 5).map(c => c.name_zh || c.name),
    sampleProds: (data.products || []).slice(0, 5).map(p => p.name_zh || p.name),
    raw: data
  };
  res.render('admin/datapack', {
    page: 'datapack', admin: req.session.admin, result: { analysis }
  });
});

router.post('/datapack/import', requireLogin, upload.json.single('pack_file'), (req, res) => {
  let data = null;
  try {
    if (req.file) {
      const raw = fs.readFileSync(req.file.path, 'utf8');
      data = JSON.parse(raw);
      fs.unlinkSync(req.file.path);
    } else if (req.body.pack_json) {
      data = JSON.parse(req.body.pack_json);
    }
  } catch (e) {
    return res.render('admin/datapack', {
      page: 'datapack', admin: req.session.admin,
      result: { error: '导入失败: ' + e.message }
    });
  }
  if (!data) {
    return res.render('admin/datapack', {
      page: 'datapack', admin: req.session.admin,
      result: { error: '无数据' }
    });
  }

  const clear = req.body.clear === '1';
  const doImport = () => {
    let catMap = {};
    // 导入分类
    const cats = data.categories || [];
    let catDone = 0;
    if (cats.length === 0) {
      importProducts();
      return;
    }
    cats.forEach(c => {
      db.run(
        `INSERT INTO categories (name_zh, name_en, sort_order, status, bg_image) VALUES (?,?,?,?,?)`,
        [c.name_zh || c.name || '', c.name_en || '', c.sort_order || 0, c.status ?? 1, c.bg_image || ''],
        function (err) {
          if (!err) catMap[c.id] = this.lastID;
          catDone++;
          if (catDone >= cats.length) importProducts();
        }
      );
    });

    function importProducts() {
      const prods = data.products || [];
      let pDone = 0;
      if (prods.length === 0) {
        importFactory();
        return;
      }
      prods.forEach(p => {
        const newCatId = catMap[p.category_id] || p.category_id || 0;
        db.run(
          `INSERT INTO products 
           (category_id, name_zh, name_en, oe, model, price, stock, image, images,
            description_zh, description_en, seo_title, seo_keywords, seo_desc, status, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            newCatId, p.name_zh || p.name || '', p.name_en || '', p.oe || '', p.model || '',
            p.price || 0, p.stock || 0, p.image || '', p.images || '',
            p.description_zh || '', p.description_en || '',
            p.seo_title || '', p.seo_keywords || '', p.seo_desc || '',
            p.status ?? 1, p.sort_order || 0
          ],
          () => {
            pDone++;
            if (pDone >= prods.length) importFactory();
          }
        );
      });
    }

    function importFactory() {
      if (data.factory) {
        const f = data.factory;
        db.run(
          `UPDATE factory_content SET title_zh=?, title_en=?, intro_zh=?, intro_en=?,
           advantages_zh=?, advantages_en=?, images=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
          [f.title_zh || '', f.title_en || '', f.intro_zh || '', f.intro_en || '',
           f.advantages_zh || '', f.advantages_en || '', f.images || ''],
          () => importConfig()
        );
      } else importConfig();
    }

    function importConfig() {
      if (data.config) {
        const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
        Object.entries(data.config).forEach(([k, v]) => stmt.run(k, String(v)));
        stmt.finalize(() => finish());
      } else finish();
    }

    function finish() {
      res.render('admin/datapack', {
        page: 'datapack', admin: req.session.admin,
        result: {
          success: true,
          message: `导入完成！分类 ${(data.categories||[]).length} 个，产品 ${(data.products||[]).length} 个`
        }
      });
    }
  };

  if (clear) {
    db.run('DELETE FROM products', [], () => {
      db.run('DELETE FROM categories', [], () => doImport());
    });
  } else {
    doImport();
  }
});

// ---------- 统计 ----------
router.get('/stats', requireLogin, (req, res) => {
  db.get('SELECT COUNT(*) as total FROM products', [], (e, p) => {
    db.get('SELECT COUNT(*) as total FROM categories', [], (e2, c) => {
      db.get('SELECT COUNT(*) as total FROM inquiries WHERE status="pending"', [], (e3, i) => {
        res.render('admin/stats', {
          page: 'stats', admin: req.session.admin,
          totalProduct: p ? p.total : 0,
          totalCategory: c ? c.total : 0,
          pendingInquiry: i ? i.total : 0
        });
      });
    });
  });
});

module.exports = router;
