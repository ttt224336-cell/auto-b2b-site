const express = require('express');
const router = express.Router();
const {auth} = require('./admin');
const db = require('../db');

//分类列表页
router.get('/', auth, (req, res)=>{
    db.all("SELECT * FROM category", (err, rows)=>{
        res.render('admin/category', {list:rows});
    })
})

//新增分类表单提交
router.post('/add', auth, (req,res)=>{
    const {name, remark} = req.body;
    db.run("INSERT INTO category(name,remark) VALUES(?,?)",[name,remark],()=>{
        res.redirect('/admin/category');
    })
})

//编辑页面
router.get('/edit/:id', auth, (req,res)=>{
    const id = req.params.id;
    db.get("SELECT * FROM category WHERE id=?",[id],(err,row)=>{
        res.render('admin/category_edit',{item:row})
    })
})

//保存编辑
router.post('/edit/:id', auth, (req,res)=>{
    const id = req.params.id;
    const {name,remark}=req.body;
    db.run("UPDATE category SET name=?,remark=? WHERE id=?",[name,remark,id],()=>{
        res.redirect('/admin/category');
    })
})

//删除
router.get('/del/:id', auth, (req,res)=>{
    const id = req.params.id;
    db.run("DELETE FROM category WHERE id=?",[id],()=>{
        res.redirect('/admin/category');
    })
})

module.exports = router;
