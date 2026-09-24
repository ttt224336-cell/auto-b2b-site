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
  { name: 'inquiry_bg_file', maxCount: 1 },
  { name: 'social1_file', maxCount: 1 },
  { name: 'social2_file', maxCount: 1 },
  { name: 'social3_file', maxCount: 1 }
]), (req, res) => {
  const fields = [
    'site_name', 'company_name', 'contact_email', 'contact_whatsapp', 'contact_phone', 'copyright_text', 'address', 'work_hours',
    'about_zh', 'about_en',
    'inquiry_title_zh', 'inquiry_title_en', 'inquiry_desc_zh', 'inquiry_desc_en', 'inquiry_bg',
    'hero_bg', 'hero_bg_opacity', 'products_bg', 'products_bg_opacity',
    'page_bg', 'page_bg_opacity', 'page_bg_full',
    'factory_images', 'carousel_delay', 'carousel_effect', 'carousel_random',
    'social1_img', 'social1_url', 'social1_text', 'social2_img', 'social2_url', 'social2_text', 'social3_img', 'social3_url', 'social3_text',
    'rate_usd', 'rate_cny', 'rate_krw', 'rate_jpy', 'rate_auto'
  ];
  // 覆盖上传文件
  if (req.files) {
    if (req.files.hero_bg_file) req.body.hero_bg = '/uploads/' + req.files.hero_bg_file[0].filename;
    if (req.files.products_bg_file) req.body.products_bg = '/uploads/' + req.files.products_bg_file[0].filename;
    if (req.files.page_bg_file) req.body.page_bg = '/uploads/' + req.files.page_bg_file[0].filename;
    if (req.files.inquiry_bg_file) req.body.inquiry_bg = '/uploads/' + req.files.inquiry_bg_file[0].filename;
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
      try { fs.unlinkSync(req.file.path); } catch (e) {}
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

  // 默认不清空！只有明确勾选 clear=1 才删除
  const clear = req.body.clear === '1';
  // 是否覆盖系统配置（默认不覆盖，保护前台已调好的设置）
  const overwriteConfig = req.body.overwrite_config === '1';

  const runImport = () => {
    const cats = data.categories || [];
    const prods = data.products || [];
    const catMap = {}; // oldId -> newId
    let catIdx = 0;

    function nextCat() {
      if (catIdx >= cats.length) return nextProd(0);
      const c = cats[catIdx++];
      const nameZh = c.name_zh || c.name || '';
      const nameEn = c.name_en || '';
      const sortOrder = c.sort_order || 0;
      const status = c.status != null ? c.status : 1;
      const bg = c.bg_image || '';

      // 按中文名合并：已存在则更新，不存在则插入
      db.get('SELECT id FROM categories WHERE name_zh = ?', [nameZh], function (err, row) {
        if (row && row.id) {
          db.run(
            'UPDATE categories SET name_en=?, sort_order=?, status=?, bg_image=? WHERE id=?',
            [nameEn, sortOrder, status, bg || null, row.id],
            function () {
              catMap[c.id] = row.id;
              // 若 bg 为空则不覆盖已有底图
              if (!bg) {
                // 已在上面可能写了空；若不想覆盖空 bg，再查一次保留
              }
              nextCat();
            }
          );
        } else {
          db.run(
            'INSERT INTO categories (name_zh, name_en, sort_order, status, bg_image) VALUES (?,?,?,?,?)',
            [nameZh, nameEn, sortOrder, status, bg],
            function (err2) {
              if (!err2) catMap[c.id] = this.lastID;
              nextCat();
            }
          );
        }
      });
    }

    let prodIdx = 0;
    let prodInserted = 0, prodUpdated = 0;
    function nextProd(start) {
      if (typeof start === 'number') prodIdx = start;
      if (prodIdx >= prods.length) return doFactory();
      const p = prods[prodIdx++];
      const newCatId = catMap[p.category_id] != null ? catMap[p.category_id] : (p.category_id || 0);
      const nameZh = p.name_zh || p.name || '';
      const oe = p.oe || '';

      // 优先按 OE 合并，无 OE 则按中文名
      const findSql = oe
        ? 'SELECT id FROM products WHERE oe = ? LIMIT 1'
        : 'SELECT id FROM products WHERE name_zh = ? LIMIT 1';
      const findArg = oe || nameZh;

      db.get(findSql, [findArg], function (err, row) {
        const vals = [
          newCatId, nameZh, p.name_en || '', oe, p.model || '',
          p.price || 0, p.stock || 0, p.image || '', p.images || '',
          p.description_zh || '', p.description_en || '',
          p.seo_title || '', p.seo_keywords || '', p.seo_desc || '',
          p.status != null ? p.status : 1, p.sort_order || 0
        ];
        if (row && row.id) {
          db.run(
            `UPDATE products SET category_id=?, name_zh=?, name_en=?, oe=?, model=?, price=?, stock=?,
             image=?, images=?, description_zh=?, description_en=?, seo_title=?, seo_keywords=?, seo_desc=?,
             status=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            vals.concat([row.id]),
            function () { prodUpdated++; nextProd(); }
          );
        } else {
          db.run(
            `INSERT INTO products
             (category_id, name_zh, name_en, oe, model, price, stock, image, images,
              description_zh, description_en, seo_title, seo_keywords, seo_desc, status, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            vals,
            function () { prodInserted++; nextProd(); }
          );
        }
      });
    }

    function doFactory() {
      if (!data.factory) return doConfig();
      const f = data.factory;
      // 工厂：有内容才更新，空字段不覆盖已有
      db.get('SELECT * FROM factory_content WHERE id=1', [], (e, old) => {
        const o = old || {};
        db.run(
          `UPDATE factory_content SET
           title_zh=?, title_en=?, intro_zh=?, intro_en=?,
           advantages_zh=?, advantages_en=?, images=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
          [
            f.title_zh || o.title_zh || '',
            f.title_en || o.title_en || '',
            f.intro_zh || o.intro_zh || '',
            f.intro_en || o.intro_en || '',
            f.advantages_zh || o.advantages_zh || '',
            f.advantages_en || o.advantages_en || '',
            f.images || o.images || ''
          ],
          () => doConfig()
        );
      });
    }

    function doConfig() {
      if (!overwriteConfig || !data.config) return finish();
      const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
      Object.entries(data.config).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') stmt.run(k, String(v));
      });
      stmt.finalize(() => finish());
    }

    function finish() {
      res.render('admin/datapack', {
        page: 'datapack', admin: req.session.admin,
        result: {
          success: true,
          message: clear
            ? `已清空后导入：分类 ${cats.length}，产品 ${prods.length}`
            : `合并导入完成：分类 ${cats.length}，产品新增 ${prodInserted} / 更新 ${prodUpdated}（未清空原有数据）`
        }
      });
    }

    if (cats.length === 0) nextProd(0);
    else nextCat();
  };

  if (clear) {
    // 仅在用户明确勾选时清空产品和分类；询盘、配置、管理员不动
    db.run('DELETE FROM products', [], () => {
      db.run('DELETE FROM categories', [], () => runImport());
    });
  } else {
    runImport();
  }
});


// ---------- 统计 ----------
router.get('/stats', requireLogin, (req, res) => {
  db.get('SELECT COUNT(*) as total FROM products', [], (e, p) => {
    db.get('SELECT COUNT(*) as total FROM categories', [], (e2, c) => {
      db.get('SELECT COUNT(*) as total FROM inquiries WHERE status="pending"', [], (e3, i) => {
        db.get('SELECT COUNT(*) as total FROM inquiries', [], (e4, it) => {
          db.all(`SELECT c.name_zh as name, COUNT(p.id) as cnt
                  FROM categories c LEFT JOIN products p ON p.category_id=c.id
                  GROUP BY c.id ORDER BY cnt DESC`, [], (e5, byCat) => {
            db.all(`SELECT status, COUNT(*) as cnt FROM products GROUP BY status`, [], (e6, byStatus) => {
              db.all(`SELECT date(created_at) as d, COUNT(*) as cnt FROM products
                      GROUP BY date(created_at) ORDER BY d DESC LIMIT 14`, [], (e7, byDay) => {
                res.render('admin/stats', {
                  page: 'stats', admin: req.session.admin,
                  totalProduct: p ? p.total : 0,
                  totalCategory: c ? c.total : 0,
                  pendingInquiry: i ? i.total : 0,
                  totalInquiry: it ? it.total : 0,
                  byCategory: byCat || [],
                  byStatus: byStatus || [],
                  byDay: (byDay || []).reverse()
                });
              });
            });
          });
        });
      });
    });
  });
});

// 导出产品 CSV
router.get('/export/products', requireLogin, (req, res) => {
  db.all(`SELECT p.id, p.name_zh, p.name_en, p.oe, p.model, p.price, p.stock, p.status,
                 c.name_zh as category, p.created_at
          FROM products p LEFT JOIN categories c ON p.category_id=c.id
          ORDER BY c.sort_order, p.id`, [], (err, rows) => {
    const header = 'ID,分类,中文名,英文名,OE,型号,价格,库存,状态,创建时间\n';
    const lines = (rows || []).map(r =>
      [r.id, r.category||'', r.name_zh||'', r.name_en||'', r.oe||'', r.model||'',
       r.price||0, r.stock||0, r.status==1?'上架':'下架', r.created_at||'']
        .map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')
    );
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=products-export.csv');
    res.send(bom + header + lines.join('\n'));
  });
});

// 导出询盘 CSV
router.get('/export/inquiries', requireLogin, (req, res) => {
  db.all('SELECT * FROM inquiries ORDER BY id DESC', [], (err, rows) => {
    const header = 'ID,产品ID,产品名,姓名,邮箱,WhatsApp,留言,状态,回复,创建时间\n';
    const lines = (rows || []).map(r =>
      [r.id, r.product_id||'', r.product_name||'', r.name||'', r.email||'', r.whatsapp||'',
       r.message||'', r.status||'', r.reply||'', r.created_at||'']
        .map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')
    );
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=inquiries-export.csv');
    res.send(bom + header + lines.join('\n'));
  });
});


// ---------- 完整业务备份（数据+图片，不含网站代码） ----------
router.get('/datapack/full-backup', requireLogin, (req, res) => {
  const os = require('os');
  const { execSync } = require('child_process');
  const tmpRoot = path.join(os.tmpdir(), 'ap-backup-' + Date.now());
  const uploadsSrc = path.join(__dirname, '../public/uploads');
  try {
    fs.mkdirSync(tmpRoot, { recursive: true });
    const packUploads = path.join(tmpRoot, 'uploads');
    fs.mkdirSync(packUploads, { recursive: true });

    db.all('SELECT * FROM categories ORDER BY id', [], (e1, cats) => {
      db.all('SELECT * FROM products ORDER BY id', [], (e2, prods) => {
        db.get('SELECT * FROM factory_content WHERE id=1', [], (e3, factory) => {
          db.all('SELECT * FROM config', [], (e4, confRows) => {
            db.all('SELECT id, product_id, product_name, name, email, whatsapp, message, status, reply, created_at FROM inquiries ORDER BY id', [], (e5, inquiries) => {
              const config = {};
              (confRows || []).forEach(r => { config[r.key] = r.value; });
              const data = {
                version: '3.0-full',
                type: 'full-business-backup',
                exported_at: new Date().toISOString(),
                note: '业务数据完整备份：分类/产品/工厂/系统设置/询盘。不含网站源代码。',
                categories: cats || [],
                products: prods || [],
                factory: factory || {},
                config: config,
                inquiries: inquiries || []
              };
              fs.writeFileSync(path.join(tmpRoot, 'data.json'), JSON.stringify(data, null, 2), 'utf8');

              // 复制 uploads（仅文件，不递归异常）
              try {
                if (fs.existsSync(uploadsSrc)) {
                  const files = fs.readdirSync(uploadsSrc);
                  files.forEach(name => {
                    const src = path.join(uploadsSrc, name);
                    try {
                      if (fs.statSync(src).isFile()) {
                        fs.copyFileSync(src, path.join(packUploads, name));
                      }
                    } catch (e) {}
                  });
                }
              } catch (e) {}

              const zipName = 'auto-b2b-full-backup-' + new Date().toISOString().slice(0, 10) + '.zip';
              const zipPath = path.join(os.tmpdir(), zipName);
              try {
                execSync('zip -r -q "' + zipPath + '" data.json uploads', { cwd: tmpRoot, timeout: 120000 });
              } catch (zipErr) {
                // 无 zip 命令时退回仅 JSON（图片路径仍保留）
                try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', 'attachment; filename=auto-b2b-full-backup.json');
                return res.send(JSON.stringify(data, null, 2));
              }

              res.download(zipPath, zipName, (err) => {
                try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
                try { fs.unlinkSync(zipPath); } catch (e) {}
              });
            });
          });
        });
      });
    });
  } catch (e) {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e2) {}
    res.status(500).send('备份失败: ' + e.message);
  }
});

router.post('/datapack/full-restore', requireLogin, upload.backup.single('backup_file'), (req, res) => {
  const os = require('os');
  const { execSync } = require('child_process');
  const uploadsDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const fail = (msg) => res.render('admin/datapack', {
    page: 'datapack', admin: req.session.admin,
    result: { error: msg }
  });

  if (!req.file) return fail('请上传备份文件（.zip 或 .json）');

  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  let data = null;
  const tmpRoot = path.join(os.tmpdir(), 'ap-restore-' + Date.now());

  try {
    if (ext === '.json') {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      fs.mkdirSync(tmpRoot, { recursive: true });
      try {
        execSync('unzip -o -q "' + filePath + '" -d "' + tmpRoot + '"', { timeout: 120000 });
      } catch (e) {
        try { fs.unlinkSync(filePath); } catch (e2) {}
        return fail('解压失败，请确认是本系统导出的 zip 备份包');
      }
      const dataPath = path.join(tmpRoot, 'data.json');
      if (!fs.existsSync(dataPath)) {
        // 可能解压在子目录
        const walk = (dir) => {
          for (const n of fs.readdirSync(dir)) {
            const p = path.join(dir, n);
            if (fs.statSync(p).isDirectory()) {
              const f = walk(p);
              if (f) return f;
            } else if (n === 'data.json') return p;
          }
          return null;
        };
        const found = walk(tmpRoot);
        if (!found) {
          try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
          try { fs.unlinkSync(filePath); } catch (e) {}
          return fail('备份包内未找到 data.json');
        }
        data = JSON.parse(fs.readFileSync(found, 'utf8'));
      } else {
        data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      }

      // 恢复图片
      const upSrc = path.join(tmpRoot, 'uploads');
      if (fs.existsSync(upSrc)) {
        fs.readdirSync(upSrc).forEach(name => {
          const src = path.join(upSrc, name);
          try {
            if (fs.statSync(src).isFile()) {
              fs.copyFileSync(src, path.join(uploadsDir, name));
            }
          } catch (e) {}
        });
      } else {
        // 找任意 uploads 目录
        const findUp = (dir) => {
          for (const n of fs.readdirSync(dir)) {
            const p = path.join(dir, n);
            if (fs.statSync(p).isDirectory()) {
              if (n === 'uploads') return p;
              const f = findUp(p);
              if (f) return f;
            }
          }
          return null;
        };
        const up2 = findUp(tmpRoot);
        if (up2) {
          fs.readdirSync(up2).forEach(name => {
            const src = path.join(up2, name);
            try {
              if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(uploadsDir, name));
            } catch (e) {}
          });
        }
      }
    }
  } catch (e) {
    try { fs.unlinkSync(filePath); } catch (e2) {}
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e2) {}
    return fail('读取备份失败: ' + e.message);
  }

  try { fs.unlinkSync(filePath); } catch (e) {}

  // 复用合并导入逻辑（含配置覆盖、询盘可选）
  const clear = req.body.clear === '1';
  const restoreInquiries = req.body.restore_inquiries === '1';

  const finishOk = (extra) => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
    res.render('admin/datapack', {
      page: 'datapack', admin: req.session.admin,
      result: {
        success: true,
        message: '完整恢复成功！分类/产品/工厂/系统设置已写回' + (extra || '') + '。请刷新前台查看。'
      }
    });
  };

  const run = () => {
    const cats = data.categories || [];
    const prods = data.products || [];
    const catMap = {};
    let ci = 0;

    function nextCat() {
      if (ci >= cats.length) return nextProd();
      const c0 = cats[ci++];
      const nameZh = c0.name_zh || c0.name || '';
      db.get('SELECT id FROM categories WHERE name_zh = ?', [nameZh], function (err, row) {
        if (row && row.id) {
          db.run('UPDATE categories SET name_en=?, sort_order=?, status=?, bg_image=? WHERE id=?',
            [c0.name_en || '', c0.sort_order || 0, c0.status != null ? c0.status : 1, c0.bg_image || '', row.id],
            () => { catMap[c0.id] = row.id; nextCat(); });
        } else {
          db.run('INSERT INTO categories (name_zh, name_en, sort_order, status, bg_image) VALUES (?,?,?,?,?)',
            [nameZh, c0.name_en || '', c0.sort_order || 0, c0.status != null ? c0.status : 1, c0.bg_image || ''],
            function () { catMap[c0.id] = this.lastID; nextCat(); });
        }
      });
    }

    let pi = 0;
    function nextProd() {
      if (pi >= prods.length) return doFactory();
      const p = prods[pi++];
      const newCatId = catMap[p.category_id] != null ? catMap[p.category_id] : (p.category_id || 0);
      const oe = p.oe || '';
      const nameZh = p.name_zh || p.name || '';
      const findSql = oe ? 'SELECT id FROM products WHERE oe = ? LIMIT 1' : 'SELECT id FROM products WHERE name_zh = ? LIMIT 1';
      const findArg = oe || nameZh;
      const vals = [
        newCatId, nameZh, p.name_en || '', oe, p.model || '',
        p.price || 0, p.stock || 0, p.image || '', p.images || '',
        p.description_zh || '', p.description_en || '',
        p.seo_title || '', p.seo_keywords || '', p.seo_desc || '',
        p.status != null ? p.status : 1, p.sort_order || 0
      ];
      db.get(findSql, [findArg], function (err, row) {
        if (row && row.id) {
          db.run(`UPDATE products SET category_id=?, name_zh=?, name_en=?, oe=?, model=?, price=?, stock=?,
            image=?, images=?, description_zh=?, description_en=?, seo_title=?, seo_keywords=?, seo_desc=?,
            status=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, vals.concat([row.id]), () => nextProd());
        } else {
          db.run(`INSERT INTO products
            (category_id, name_zh, name_en, oe, model, price, stock, image, images,
             description_zh, description_en, seo_title, seo_keywords, seo_desc, status, sort_order)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, vals, () => nextProd());
        }
      });
    }

    function doFactory() {
      if (!data.factory) return doConfig();
      const f = data.factory;
      db.run(`UPDATE factory_content SET title_zh=?, title_en=?, intro_zh=?, intro_en=?,
        advantages_zh=?, advantages_en=?, images=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
        [f.title_zh || '', f.title_en || '', f.intro_zh || '', f.intro_en || '',
         f.advantages_zh || '', f.advantages_en || '', f.images || ''],
        () => doConfig());
    }

    function doConfig() {
      if (data.config) {
        const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
        Object.entries(data.config).forEach(([k, v]) => {
          if (v !== undefined && v !== null) stmt.run(k, String(v));
        });
        stmt.finalize(() => doInquiries());
      } else doInquiries();
    }

    function doInquiries() {
      if (!restoreInquiries || !data.inquiries || !data.inquiries.length) return finishOk('');
      let ii = 0;
      const list = data.inquiries;
      function nextI() {
        if (ii >= list.length) return finishOk('；询盘 ' + list.length + ' 条已恢复');
        const r = list[ii++];
        db.run(
          `INSERT INTO inquiries (product_id, product_name, name, email, whatsapp, message, status, reply, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [r.product_id || null, r.product_name || '', r.name || '', r.email || '', r.whatsapp || '',
           r.message || '', r.status || 'pending', r.reply || '', r.created_at || null],
          () => nextI()
        );
      }
      nextI();
    }

    if (cats.length) nextCat();
    else nextProd();
  };

  if (clear) {
    db.run('DELETE FROM products', [], () => {
      db.run('DELETE FROM categories', [], () => run());
    });
  } else run();
});


module.exports = router;
