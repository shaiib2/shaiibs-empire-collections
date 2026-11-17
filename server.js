const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'Shaiibrihanna@gmail.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_HASH = ADMIN_PASSWORD ? bcrypt.hashSync(ADMIN_PASSWORD, 10) : null;
const WHATSAPP = process.env.WHATSAPP_NUMBER || '2348168660487';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, {recursive:true});
fs.mkdirSync(UPLOAD_DIR, {recursive:true});
const DB = path.join(DATA_DIR, 'products.json');
if (!fs.existsSync(DB)) fs.writeFileSync(DB, '[]');
if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error('Set ADMIN_PASSWORD and SESSION_SECRET environment variables before starting.');
  process.exit(1);
}
const readProducts = () => JSON.parse(fs.readFileSync(DB, 'utf8'));
const writeProducts = p => fs.writeFileSync(DB, JSON.stringify(p, null, 2));
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'1mb'}));
app.use(session({
  name:'shaiib.sid', secret:SESSION_SECRET, resave:false, saveUninitialized:false,
  cookie:{httpOnly:true, sameSite:'lax', secure:process.env.NODE_ENV === 'production', maxAge: 8*60*60*1000}
}));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname,'public')));
const auth = (req,res,next) => req.session && req.session.admin ? next() : res.status(401).json({error:'Please log in again.'});
const storage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,UPLOAD_DIR),
  filename:(req,file,cb)=>cb(null,Date.now()+'-'+Math.random().toString(36).slice(2,9)+path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage, limits:{fileSize:100*1024*1024, files:8},
  fileFilter:(req,file,cb)=>{
    const ok=/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.mimetype);
    cb(ok ? null : new Error('Only JPG, PNG, WEBP, GIF images and MP4, WEBM or MOV videos are allowed.'), ok);
  }
});
app.post('/api/login',(req,res)=>{
  const email=String(req.body.email||'').toLowerCase();
  const pass=String(req.body.password||'');
  if(email!==ADMIN_EMAIL || !bcrypt.compareSync(pass,bcrypt.hashSync(ADMIN_PASSWORD, 10))) {
    // Timing-safe-ish password check using bcrypt; compare against configured password hash per request.
    return res.status(401).json({error:'Email or password is incorrect.'});
  }
  req.session.admin=true; res.json({ok:true});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>res.json({admin:!!(req.session&&req.session.admin)}));
app.get('/api/products',(req,res)=>res.json(readProducts()));
app.post('/api/products',auth,upload.array('media',8),(req,res)=>{
  const {name,brand,category,price,description,stock}=req.body;
  if(!name || !['shaiibs','rihanna'].includes(brand)) return res.status(400).json({error:'Product name and valid brand are required.'});
  const media=(req.files||[]).map(f=>({url:'/uploads/'+f.filename,type:f.mimetype.startsWith('video/')?'video':'image'}));
  const products=readProducts();
  const product={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:String(name).slice(0,100),brand,category:String(category||'General').slice(0,60),price:Number(price)||0,description:String(description||'').slice(0,1000),stock:stock==='false'?'soldout':'available',media,createdAt:new Date().toISOString()};
  products.unshift(product); writeProducts(products); res.json(product);
});
app.put('/api/products/:id',auth,(req,res)=>{
  const products=readProducts(), p=products.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:'Product not found.'});
  for(const k of ['name','category','description']) if(req.body[k]!==undefined) p[k]=String(req.body[k]).slice(0,1000);
  if(req.body.price!==undefined) p.price=Number(req.body.price)||0;
  if(req.body.stock!==undefined) p.stock=req.body.stock==='soldout'?'soldout':'available';
  writeProducts(products); res.json(p);
});
app.delete('/api/products/:id',auth,(req,res)=>{
  const products=readProducts(), p=products.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:'Product not found.'});
  for(const m of p.media||[]) { const f=path.join(UPLOAD_DIR,path.basename(m.url)); if(fs.existsSync(f)) fs.unlinkSync(f); }
  writeProducts(products.filter(x=>x.id!==req.params.id)); res.json({ok:true});
});
app.get('/api/config',(req,res)=>res.json({whatsapp:WHATSAPP,accountName:process.env.PAYMENT_ACCOUNT_NAME||'Rehinat Shaiib',bank:process.env.PAYMENT_BANK||'OPay',accountNumber:process.env.PAYMENT_ACCOUNT_NUMBER||'8168660487'}));
app.use((err,req,res,next)=>res.status(400).json({error:err.message||'Upload failed.'}));
app.listen(PORT,()=>console.log('Store running on port '+PORT));
