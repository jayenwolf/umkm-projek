import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query, transaction } from './db.js';
import { demoProducts } from './demo-data.js';
import { signUser, readUser, requireAuth, requireAdmin } from './middleware/auth.js';
import { createSnapTransaction, mapMidtransStatus, verifyMidtransSignature } from './services/midtrans.js';
import { getShippingOptions, shippingCost } from './services/shipping.js';
import { queueNotification } from './services/notifications.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 86400000, path: '/' };
const rupiahNumber = value => Math.max(0, Math.round(Number(value || 0)));
const orderNumber = () => `WF-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.floor(1000 + Math.random()*9000)}`;
const slugify = value => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function demoProductPayload() {
  return demoProducts.map((p, index) => ({
    id: `demo-${index+1}`, slug:p.slug, name:p.name, brand:p.brand,
    category:p.category, categorySlug:p.categorySlug, shortDescription:p.short,
    description:p.description, basePrice:p.price, compareAtPrice:p.compareAt,
    featured:p.featured, image:p.image, ingredients:p.ingredients,
    consumptionDirections:p.directions, nutritionFacts:p.nutrition,
    rating:4.7 + (index%3)*.1, reviewCount:24+index*13,
    variants:p.variants.map((v,i)=>({ id:`demo-${v[0]}`, sku:v[0], name:v[1], flavor:v[2], price:v[3], stock:v[4], weightGrams:v[5] }))
  }));
}

async function databaseReady() {
  try { await query('SELECT 1'); return true; } catch { return false; }
}

app.get('/api/health', async (_req,res) => res.json({ ok:true, database:await databaseReady(), time:new Date().toISOString() }));

app.get('/api/products', async (req,res) => {
  try {
    const values=[]; const where=[`p.status='active'`];
    if(req.query.q){values.push(`%${req.query.q}%`);where.push(`(p.name ILIKE $${values.length} OR p.brand ILIKE $${values.length} OR p.description ILIKE $${values.length})`)}
    if(req.query.category){values.push(req.query.category);where.push(`c.slug=$${values.length}`)}
    const result=await query(`SELECT p.id,p.slug,p.name,p.brand,p.short_description,p.description,p.base_price,p.compare_at_price,p.featured,p.nutrition_facts,p.ingredients,p.consumption_directions,p.net_weight_grams,c.name category,c.slug category_slug,
      COALESCE((SELECT image_url FROM product_images WHERE product_id=p.id ORDER BY is_primary DESC,sort_order LIMIT 1),'/images/whey.svg') image,
      COALESCE((SELECT ROUND(AVG(rating)::numeric,1) FROM reviews WHERE product_id=p.id AND is_approved),4.8) rating,
      (SELECT COUNT(*)::int FROM reviews WHERE product_id=p.id AND is_approved) review_count,
      COALESCE((SELECT json_agg(json_build_object('id',pv.id,'sku',pv.sku,'name',pv.name,'flavor',pv.flavor,'price',pv.price,'stock',pv.stock,'weightGrams',pv.weight_grams) ORDER BY pv.price) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active),'[]') variants
      FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where.join(' AND ')} ORDER BY p.featured DESC,p.created_at DESC`,values);
    res.json(result.rows.map(p=>({id:p.id,slug:p.slug,name:p.name,brand:p.brand,category:p.category,categorySlug:p.category_slug,shortDescription:p.short_description,description:p.description,basePrice:Number(p.base_price),compareAtPrice:p.compare_at_price?Number(p.compare_at_price):null,featured:p.featured,nutritionFacts:p.nutrition_facts,ingredients:p.ingredients,consumptionDirections:p.consumption_directions,netWeightGrams:p.net_weight_grams,image:p.image,rating:Number(p.rating),reviewCount:p.review_count,variants:p.variants.map(v=>({...v,price:Number(v.price)}))})));
  } catch(error) { console.warn('Produk memakai data demo:',error.message); res.json(demoProductPayload()); }
});

app.post('/api/auth/register', async (req,res) => {
  const {name,email,phone,password}=req.body||{};
  if(!name||!/^\S+@\S+\.\S+$/.test(email||'')||String(phone||'').length<8||String(password||'').length<8) return res.status(400).json({error:'Data tidak valid. Password minimal 8 karakter.'});
  try { const hash=await bcrypt.hash(password,12); const result=await query(`INSERT INTO users(name,email,phone,password_hash) VALUES($1,LOWER($2),$3,$4) RETURNING id,name,email,role`,[name,email,phone,hash]); const user=result.rows[0]; res.cookie('warungfit_session',signUser(user),cookieOptions).json({ok:true,user}); }
  catch(error){res.status(error.code==='23505'?409:500).json({error:error.code==='23505'?'Email sudah terdaftar.':'Registrasi gagal.'})}
});
app.post('/api/auth/login', async (req,res) => { const {email,password}=req.body||{}; try{const result=await query('SELECT * FROM users WHERE email=LOWER($1)',[email]);const user=result.rows[0];if(!user||!await bcrypt.compare(password||'',user.password_hash))return res.status(401).json({error:'Email atau password salah.'});const safe={id:user.id,name:user.name,email:user.email,role:user.role};res.cookie('warungfit_session',signUser(safe),cookieOptions).json({ok:true,user:safe})}catch{res.status(503).json({error:'Database belum siap. Jalankan npm run db:setup.'})} });
app.post('/api/auth/logout',(_req,res)=>res.clearCookie('warungfit_session',{path:'/'}).json({ok:true}));
app.get('/api/auth/me',(req,res)=>res.json({user:readUser(req)}));

app.get('/api/shipping', (req,res) => res.json(getShippingOptions({subtotal:rupiahNumber(req.query.subtotal),city:String(req.query.city||'')})));
app.post('/api/coupons/validate', async (req,res) => {const code=String(req.body.code||'').toUpperCase();const subtotal=rupiahNumber(req.body.subtotal);try{const result=await query(`SELECT * FROM coupons WHERE code=$1 AND is_active AND starts_at<=NOW() AND ends_at>=NOW()`,[code]);const c=result.rows[0];if(!c||subtotal<Number(c.minimum_spend)||(c.usage_limit&&c.used_count>=c.usage_limit))return res.json({valid:false,discount:0});let discount=c.discount_type==='percent'?Math.round(subtotal*Number(c.value)/100):Number(c.value);if(c.maximum_discount)discount=Math.min(discount,Number(c.maximum_discount));res.json({valid:true,discount})}catch{const discount=code==='PROMO10'&&subtotal>=150000?Math.min(Math.round(subtotal*.1),50000):0;res.json({valid:discount>0,discount})}});

app.post('/api/orders', async (req,res) => {
  const data=req.body||{}; const user=readUser(req);
  if(!data.buyer?.name||!data.buyer?.phone||!data.address?.detail||!Array.isArray(data.items)||!data.items.length) return res.status(400).json({error:'Data checkout belum lengkap.'});
  try {
    if (data.items.some(item => String(item.variantId).startsWith('demo-'))) {
      const variants = demoProductPayload().flatMap(product => product.variants.map(variant => ({...variant, product})));
      const lines = data.items.map(item => {
        const variant = variants.find(candidate => candidate.id === item.variantId);
        const quantity = Math.max(1, Math.min(99, Number(item.quantity)));
        if (!variant || variant.stock < quantity) throw new Error('Produk demo tidak tersedia atau stok tidak cukup.');
        return { variant, quantity };
      });
      const subtotal = lines.reduce((sum, line) => sum + line.variant.price * line.quantity, 0);
      const discount = String(data.couponCode || '').toUpperCase() === 'PROMO10' && subtotal >= 150000 ? Math.min(Math.round(subtotal * .1), 50000) : 0;
      const freight = shippingCost(data.courier || 'REG', subtotal, data.address.city || '');
      return res.status(201).json({ orderNumber: orderNumber(), grandTotal: subtotal + freight - discount, paymentUrl: null, warning: 'Mode demo: hubungkan PostgreSQL agar pesanan tersimpan.' });
    }
    const created=await transaction(async client=>{
      const ids=data.items.map(i=>i.variantId);
      const variants=await client.query(`SELECT pv.*,p.name product_name,p.id product_id FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE pv.id=ANY($1::uuid[]) AND pv.is_active FOR UPDATE`,[ids]);
      if(variants.rows.length!==new Set(ids).size)throw new Error('Ada produk yang tidak tersedia. Muat ulang katalog.');
      const lines=data.items.map(item=>{const variant=variants.rows.find(v=>v.id===item.variantId);const quantity=Math.max(1,Math.min(99,Number(item.quantity)));if(!variant||variant.stock<quantity)throw new Error(`Stok ${variant?.product_name||'produk'} tidak cukup.`);return{variant,quantity,total:Number(variant.price)*quantity}});
      const subtotal=lines.reduce((s,l)=>s+l.total,0);let discount=0,coupon=null;
      if(data.couponCode){const found=await client.query(`SELECT * FROM coupons WHERE code=$1 AND is_active AND starts_at<=NOW() AND ends_at>=NOW() FOR UPDATE`,[String(data.couponCode).toUpperCase()]);coupon=found.rows[0];if(!coupon||subtotal<Number(coupon.minimum_spend)||(coupon.usage_limit&&coupon.used_count>=coupon.usage_limit))throw new Error('Voucher tidak valid.');discount=coupon.discount_type==='percent'?Math.round(subtotal*Number(coupon.value)/100):Number(coupon.value);if(coupon.maximum_discount)discount=Math.min(discount,Number(coupon.maximum_discount));}
      const freight=shippingCost(data.courier||'REG',subtotal,data.address.city||'');const total=subtotal+freight-discount;const number=orderNumber();
      const order=(await client.query(`INSERT INTO orders(order_number,user_id,buyer_name,buyer_email,buyer_phone,shipping_address,subtotal,shipping_cost,discount_amount,grand_total,coupon_code,payment_status,customer_notes) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[number,user?.id||null,data.buyer.name,data.buyer.email||null,data.buyer.phone,JSON.stringify(data.address),subtotal,freight,discount,total,coupon?.code||null,data.paymentMethod==='MIDTRANS'?'pending':'unpaid',data.notes||null])).rows[0];
      for(const line of lines){await client.query(`INSERT INTO order_items(order_id,product_id,product_variant_id,product_name,sku,variant_description,quantity,unit_price,total_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[order.id,line.variant.product_id,line.variant.id,line.variant.product_name,line.variant.sku,line.variant.name,line.quantity,line.variant.price,line.total]);await client.query(`UPDATE product_variants SET stock=stock-$1,updated_at=NOW() WHERE id=$2`,[line.quantity,line.variant.id]);await client.query(`INSERT INTO stock_movements(product_variant_id,movement_type,quantity,reference_type,reference_id,notes) VALUES($1,'sale',$2,'order',$3,$4)`,[line.variant.id,-line.quantity,order.id,number]);}
      await client.query(`INSERT INTO shipments(order_id,courier,service) VALUES($1,$2,$3)`,[order.id,data.courier||'REG',data.courier==='YES'?'Express':data.courier==='SMD'?'Kurir lokal':'Reguler']);
      const payment=(await client.query(`INSERT INTO payments(order_id,provider,amount,status) VALUES($1,$2,$3,$4) RETURNING *`,[order.id,data.paymentMethod||'MANUAL',total,data.paymentMethod==='MIDTRANS'?'pending':'unpaid'])).rows[0];
      if(coupon){await client.query('UPDATE coupons SET used_count=used_count+1 WHERE id=$1',[coupon.id]);await client.query(`INSERT INTO coupon_usages(coupon_id,user_id,order_id,discount_amount) VALUES($1,$2,$3,$4)`,[coupon.id,user?.id||null,order.id,discount])}
      await queueNotification(client,{orderId:order.id,channel:'system',recipient:data.buyer.email||data.buyer.phone,template:'ORDER_CREATED',payload:{orderNumber:number,total}});
      return{order,payment,lines,subtotal,freight,discount,total,number};
    });
    let paymentUrl=null,warning=null;
    if(data.paymentMethod==='MIDTRANS')try{const snap=await createSnapTransaction({orderNumber:created.number,amount:created.total,customer:data.buyer,items:[...created.lines.map(l=>({id:l.variant.sku,price:Number(l.variant.price),quantity:l.quantity,name:l.variant.product_name.slice(0,50)})),...(created.freight?[{id:'SHIPPING',price:created.freight,quantity:1,name:'Ongkos kirim'}]:[]),...(created.discount?[{id:'DISCOUNT',price:-created.discount,quantity:1,name:'Diskon'}]:[])]});if(snap){paymentUrl=snap.redirect_url;await query(`UPDATE payments SET provider_reference=$1,checkout_url=$2,raw_response=$3::jsonb,updated_at=NOW() WHERE id=$4`,[snap.token,snap.redirect_url,JSON.stringify(snap),created.payment.id])}else warning='MIDTRANS_SERVER_KEY belum diisi; pesanan disimpan sebagai pembayaran manual.'}catch(error){console.error(error);warning='Pesanan tersimpan, tetapi link pembayaran gagal dibuat. Hubungi admin.'}
    res.status(201).json({orderNumber:created.number,grandTotal:created.total,paymentUrl,warning});
  } catch(error){console.error(error);res.status(400).json({error:error.message||'Checkout gagal.'})}
});

app.get('/api/orders',requireAuth,async(req,res)=>{const result=await query(`SELECT o.*,COALESCE(json_agg(json_build_object('name',oi.product_name,'variant',oi.variant_description,'quantity',oi.quantity,'price',oi.unit_price)) FILTER(WHERE oi.id IS NOT NULL),'[]') items,s.tracking_number,s.courier FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN shipments s ON s.order_id=o.id WHERE o.user_id=$1 GROUP BY o.id,s.tracking_number,s.courier ORDER BY o.created_at DESC`,[req.user.id]);res.json(result.rows)});
app.get('/api/orders/track',async(req,res)=>{const number=String(req.query.order||'');const digits=String(req.query.phone||'').replace(/\D/g,'');try{const result=await query(`SELECT o.order_number,o.payment_status,o.order_status,o.created_at,o.updated_at,s.courier,s.tracking_number,s.shipped_at,s.delivered_at FROM orders o LEFT JOIN shipments s ON s.order_id=o.id WHERE o.order_number=$1 AND regexp_replace(o.buyer_phone,'\\D','','g') LIKE $2`,[number,`%${digits.slice(-8)}`]);if(!result.rows[0])return res.status(404).json({error:'Pesanan tidak ditemukan.'});res.json(result.rows[0])}catch{res.json({order_number:number,payment_status:'demo',order_status:'waiting_payment',created_at:new Date(),courier:null,tracking_number:null})}});

app.get('/api/reviews/:productId',async(req,res)=>{try{const result=await query(`SELECT r.id,r.rating,r.comment,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=$1 AND r.is_approved ORDER BY r.created_at DESC`,[req.params.productId]);res.json(result.rows)}catch{res.json([])}});
app.post('/api/reviews/:productId',requireAuth,async(req,res)=>{const rating=Number(req.body.rating);if(rating<1||rating>5)return res.status(400).json({error:'Rating harus 1–5.'});await query(`INSERT INTO reviews(user_id,product_id,rating,comment) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,product_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment,is_approved=FALSE`,[req.user.id,req.params.productId,rating,req.body.comment||null]);res.json({ok:true,message:'Review menunggu persetujuan admin.'})});

app.get('/api/admin/dashboard',requireAdmin,async(_req,res)=>{const [m,best,recent]=await Promise.all([query(`SELECT (SELECT COALESCE(SUM(grand_total),0) FROM orders WHERE payment_status='paid') revenue,(SELECT COUNT(*) FROM orders) orders,(SELECT COUNT(*) FROM users WHERE role='customer') customers,(SELECT COUNT(*) FROM products WHERE status='active') products`),query(`SELECT oi.product_name,SUM(oi.quantity)::int units,SUM(oi.total_price) revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.payment_status='paid' GROUP BY oi.product_name ORDER BY units DESC LIMIT 5`),query(`SELECT order_number,buyer_name,grand_total,payment_status,order_status,created_at FROM orders ORDER BY created_at DESC LIMIT 8`)]);res.json({metrics:m.rows[0],best:best.rows,recent:recent.rows})});
app.get('/api/admin/products',requireAdmin,async(_req,res)=>{const result=await query(`SELECT p.id,p.name,p.slug,p.base_price,p.status,COALESCE(SUM(pv.stock),0)::int stock FROM products p LEFT JOIN product_variants pv ON pv.product_id=p.id GROUP BY p.id ORDER BY p.created_at DESC`);res.json(result.rows)});
app.post('/api/admin/products',requireAdmin,async(req,res)=>{const d=req.body||{};if(!d.name||!d.category||!d.sku||Number(d.price)<0)return res.status(400).json({error:'Data produk belum lengkap.'});try{const id=await transaction(async client=>{const c=(await client.query(`INSERT INTO categories(name,slug) VALUES($1,$2) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[d.category,slugify(d.category)])).rows[0];let slug=slugify(d.name);if((await client.query('SELECT 1 FROM products WHERE slug=$1',[slug])).rowCount)slug+=`-${Date.now().toString().slice(-5)}`;const p=(await client.query(`INSERT INTO products(category_id,name,slug,brand,short_description,description,base_price,status,ingredients,consumption_directions,net_weight_grams) VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10) RETURNING id`,[c.id,d.name,slug,d.brand||null,d.shortDescription||'',d.description||d.shortDescription||d.name,rupiahNumber(d.price),d.ingredients||null,d.directions||null,Number(d.weightGrams||0)])).rows[0];await client.query(`INSERT INTO product_images(product_id,image_url,alt_text,is_primary) VALUES($1,$2,$3,TRUE)`,[p.id,d.image||'/images/whey.svg',d.name]);await client.query(`INSERT INTO product_variants(product_id,sku,name,flavor,price,stock,weight_grams) VALUES($1,$2,$3,$4,$5,$6,$7)`,[p.id,String(d.sku).toUpperCase(),d.variantName||'Default',d.flavor||null,rupiahNumber(d.price),Number(d.stock||0),Number(d.weightGrams||0)]);return p.id});res.status(201).json({ok:true,id})}catch(error){res.status(400).json({error:error.code==='23505'?'SKU sudah digunakan.':error.message})}});
app.get('/api/admin/orders',requireAdmin,async(_req,res)=>{const result=await query(`SELECT o.*,s.courier,s.tracking_number FROM orders o LEFT JOIN shipments s ON s.order_id=o.id ORDER BY o.created_at DESC LIMIT 200`);res.json(result.rows)});
app.patch('/api/admin/orders/:id',requireAdmin,async(req,res)=>{const allowed=['waiting_payment','processing','packed','shipped','completed','cancelled'];if(!allowed.includes(req.body.orderStatus))return res.status(400).json({error:'Status tidak valid.'});await transaction(async client=>{await client.query(`UPDATE orders SET order_status=$1,updated_at=NOW() WHERE id=$2`,[req.body.orderStatus,req.params.id]);await client.query(`INSERT INTO shipments(order_id,courier,tracking_number,shipping_status,shipped_at,delivered_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(order_id) DO UPDATE SET courier=EXCLUDED.courier,tracking_number=EXCLUDED.tracking_number,shipping_status=EXCLUDED.shipping_status,shipped_at=COALESCE(shipments.shipped_at,EXCLUDED.shipped_at),delivered_at=COALESCE(shipments.delivered_at,EXCLUDED.delivered_at),updated_at=NOW()`,[req.params.id,req.body.courier||'JNE',req.body.trackingNumber||null,req.body.orderStatus,req.body.orderStatus==='shipped'?new Date():null,req.body.orderStatus==='completed'?new Date():null])});res.json({ok:true})});
app.get('/api/admin/reports/sales.csv',requireAdmin,async(_req,res)=>{const result=await query(`SELECT o.order_number,o.created_at,o.buyer_name,o.buyer_phone,o.payment_status,o.order_status,o.subtotal,o.shipping_cost,o.discount_amount,o.grand_total,s.courier,s.tracking_number,STRING_AGG(oi.quantity||'x '||oi.product_name,'; ') products FROM orders o LEFT JOIN shipments s ON s.order_id=o.id LEFT JOIN order_items oi ON oi.order_id=o.id GROUP BY o.id,s.courier,s.tracking_number ORDER BY o.created_at DESC`);const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;const keys=['order_number','created_at','buyer_name','buyer_phone','payment_status','order_status','subtotal','shipping_cost','discount_amount','grand_total','courier','tracking_number','products'];res.type('text/csv').set('Content-Disposition',`attachment; filename="laporan-warungfit-${new Date().toISOString().slice(0,10)}.csv"`).send('\uFEFF'+[keys.map(esc).join(','),...result.rows.map(row=>keys.map(k=>esc(row[k])).join(','))].join('\n'))});

app.post('/api/webhooks/midtrans',async(req,res)=>{if(!process.env.MIDTRANS_SERVER_KEY)return res.status(503).json({error:'Midtrans belum dikonfigurasi.'});if(!verifyMidtransSignature(req.body))return res.status(401).json({error:'Signature tidak valid.'});const status=mapMidtransStatus(req.body);const key=`${req.body.transaction_id||req.body.order_id}:${req.body.transaction_status}:${req.body.status_code}`;try{await transaction(async client=>{const found=await client.query(`SELECT o.*,p.id payment_id,p.status old_payment_status FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.order_number=$1 ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE`,[req.body.order_id]);const order=found.rows[0];if(!order)throw new Error('Order tidak ditemukan.');if((await client.query('SELECT 1 FROM payment_events WHERE event_key=$1',[key])).rowCount)return;await client.query(`INSERT INTO payment_events(payment_id,event_key,payload) VALUES($1,$2,$3::jsonb)`,[order.payment_id,key,JSON.stringify(req.body)]);await client.query(`UPDATE payments SET status=$1,payment_method=$2,provider_reference=$3,raw_response=$4::jsonb,paid_at=CASE WHEN $1='paid' THEN NOW() ELSE paid_at END,updated_at=NOW() WHERE id=$5`,[status,req.body.payment_type||null,req.body.transaction_id||null,JSON.stringify(req.body),order.payment_id]);await client.query(`UPDATE orders SET payment_status=$1,order_status=CASE WHEN $1='paid' AND order_status='waiting_payment' THEN 'processing' ELSE order_status END,updated_at=NOW() WHERE id=$2`,[status,order.id]);if(status==='paid'&&order.old_payment_status!=='paid'&&order.user_id){const points=Math.floor(Number(order.grand_total)/1000);if(points>0){await client.query('UPDATE users SET points=points+$1 WHERE id=$2',[points,order.user_id]);await client.query(`INSERT INTO point_transactions(user_id,order_id,amount,description) VALUES($1,$2,$3,$4)`,[order.user_id,order.id,points,`Poin pesanan ${order.order_number}`])}}await queueNotification(client,{orderId:order.id,channel:'system',recipient:order.buyer_email||order.buyer_phone,template:`PAYMENT_${status.toUpperCase()}`,payload:{orderNumber:order.order_number}})});res.json({received:true})}catch(error){console.error(error);res.status(400).json({error:error.message})}});

app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint tidak ditemukan.'}));
app.use((req,res,next)=>{if(req.method!=='GET')return next();res.sendFile(path.join(__dirname,'public','index.html'))});
app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({error:'Terjadi kesalahan pada server.'})});

app.listen(port,()=>console.log(`WarungFit berjalan di http://localhost:${port}`));

process.on('SIGTERM',async()=>{await pool.end();process.exit(0)});
