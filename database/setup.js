import 'dotenv/config';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { pool, transaction } from '../db.js';
import { demoProducts } from '../demo-data.js';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diisi pada file .env');
  const schema = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);

  await transaction(async (client) => {
    const adminHash = await bcrypt.hash('Admin123!', 12);
    const customerHash = await bcrypt.hash('Customer123!', 12);
    await client.query(`INSERT INTO users(name,email,phone,password_hash,role) VALUES
      ('Admin WarungFit','admin@warungfit.local','6281234567890',$1,'admin'),
      ('Pelanggan Demo','pelanggan@warungfit.local','628111111111',$2,'customer')
      ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name`, [adminHash, customerHash]);

    for (const product of demoProducts) {
      const category = await client.query(
        `INSERT INTO categories(name,slug) VALUES($1,$2)
         ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [product.category, product.categorySlug]
      );
      const inserted = await client.query(
        `INSERT INTO products(category_id,name,slug,brand,short_description,description,base_price,compare_at_price,status,featured,nutrition_facts,ingredients,consumption_directions,net_weight_grams)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10::jsonb,$11,$12,$13)
         ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,base_price=EXCLUDED.base_price,updated_at=NOW()
         RETURNING id`,
        [category.rows[0].id, product.name, product.slug, product.brand, product.short, product.description, product.price, product.compareAt, product.featured, JSON.stringify(product.nutrition), product.ingredients, product.directions, product.variants[0][5]]
      );
      const productId = inserted.rows[0].id;
      await client.query(`INSERT INTO product_images(product_id,image_url,alt_text,is_primary) VALUES($1,$2,$3,TRUE) ON CONFLICT DO NOTHING`, [productId, product.image, product.name]);
      for (const [sku,name,flavor,price,stock,weight] of product.variants) {
        const variant = await client.query(
          `INSERT INTO product_variants(product_id,sku,name,flavor,price,stock,weight_grams)
           VALUES($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT(sku) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,stock=EXCLUDED.stock
           RETURNING id`, [productId,sku,name,flavor,price,stock,weight]
        );
        const expiry = new Date(); expiry.setFullYear(expiry.getFullYear()+1);
        await client.query(`INSERT INTO inventory_batches(product_variant_id,batch_number,quantity,expiry_date)
          SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM inventory_batches WHERE product_variant_id=$1)`, [variant.rows[0].id,`BATCH-${sku}`,stock,expiry.toISOString().slice(0,10)]);
      }
    }
    const end = new Date(); end.setFullYear(end.getFullYear()+1);
    await client.query(`INSERT INTO coupons(code,name,discount_type,value,minimum_spend,maximum_discount,starts_at,ends_at)
      VALUES('PROMO10','Diskon pelanggan baru','percent',10,150000,50000,NOW(),$1)
      ON CONFLICT(code) DO NOTHING`, [end]);
  });

  console.log('Database berhasil disiapkan.');
  console.log('Admin: admin@warungfit.local / Admin123!');
  console.log('Pelanggan: pelanggan@warungfit.local / Customer123!');
  await pool.end();
}

main().catch(async (error) => { console.error(error); await pool.end(); process.exit(1); });
