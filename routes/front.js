const express = require('express');
const router = express.Router();
const db = require('../db/database.js');
// 剩下原有代码不变


// 前台首页，商品列表
router.get('/', async (req, res) => {
  const productList = await db.all(`
    SELECT p.*, c.name cat_name
    FROM product p
    LEFT JOIN category c ON p.category_id = c.id
    WHERE p.status = 1
    ORDER BY p.id DESC
  `);
  res.render('front_product', { productList });
});

// 前台商品详情页  /product/1
router.get('/product/:id', async (req, res) => {
  const id = req.params.id;
  const item = await db.get(`
    SELECT p.*, c.name cat_name
    FROM product p
    LEFT JOIN category c ON p.category_id = c.id
    WHERE p.id = ? AND p.status = 1
  `, [id]);

  if (!item) {
    return res.send('商品不存在或者已下架');
  }
  res.render('front_detail', { item });
});


module.exports = router;
module.exports = router;
