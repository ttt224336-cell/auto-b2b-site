const express = require('express');
const router = express.Router();
const authMid = require('../middleware/auth');
const db = require('../db/database');

router.get('/', authMid, (req,res)=>{
  db.get(`SELECT COUNT(*) as productTotal FROM product`, (err,pRow)=>{
    db.get(`SELECT COUNT(*) as inquiryTotal FROM inquiry`, (err,iRow)=>{
      res.render('admin/dashboard',{
        productTotal:pRow.productTotal,
        inquiryTotal:iRow.inquiryTotal
      })
    })
  })
});

module.exports = router;
