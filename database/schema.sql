CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('customer','admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE product_status AS ENUM ('draft','active','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('unpaid','pending','paid','expired','failed','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE order_status AS ENUM ('waiting_payment','processing','packed','shipped','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(30),
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(50) NOT NULL DEFAULT 'Rumah',
  recipient_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  province VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  detail TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  brand VARCHAR(100),
  short_description VARCHAR(300),
  description TEXT NOT NULL,
  base_price BIGINT NOT NULL CHECK (base_price >= 0),
  compare_at_price BIGINT CHECK (compare_at_price >= 0),
  status product_status NOT NULL DEFAULT 'active',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  nutrition_facts JSONB,
  ingredients TEXT,
  consumption_directions TEXT,
  warnings TEXT,
  net_weight_grams INTEGER CHECK (net_weight_grams >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text VARCHAR(200),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  flavor VARCHAR(60),
  price BIGINT NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  weight_grams INTEGER NOT NULL DEFAULT 0 CHECK (weight_grams >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  expiry_date DATE NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  buyer_name VARCHAR(120) NOT NULL,
  buyer_email VARCHAR(255),
  buyer_phone VARCHAR(30) NOT NULL,
  shipping_address JSONB NOT NULL,
  subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
  shipping_cost BIGINT NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  discount_amount BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  grand_total BIGINT NOT NULL CHECK (grand_total >= 0),
  coupon_code VARCHAR(50),
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  order_status order_status NOT NULL DEFAULT 'waiting_payment',
  customer_notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name VARCHAR(200) NOT NULL,
  sku VARCHAR(100),
  variant_description VARCHAR(200),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
  total_price BIGINT NOT NULL CHECK (total_price >= 0)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_reference VARCHAR(255) UNIQUE,
  payment_method VARCHAR(100),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  status payment_status NOT NULL DEFAULT 'pending',
  checkout_url TEXT,
  raw_response JSONB,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_key VARCHAR(255) NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  courier VARCHAR(60) NOT NULL,
  service VARCHAR(80),
  tracking_number VARCHAR(120),
  shipping_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  tracking_history JSONB,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent','fixed')),
  value BIGINT NOT NULL CHECK (value >= 0),
  minimum_spend BIGINT NOT NULL DEFAULT 0,
  maximum_discount BIGINT,
  usage_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS coupon_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  discount_amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  movement_type VARCHAR(30) NOT NULL,
  quantity INTEGER NOT NULL,
  reference_type VARCHAR(50),
  reference_id VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  channel VARCHAR(30) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  template VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  payload JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN (to_tsvector('simple', name || ' ' || COALESCE(brand,'') || ' ' || COALESCE(description,'')));
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(buyer_phone);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, is_approved);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date);
