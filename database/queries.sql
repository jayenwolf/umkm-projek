-- Contoh query yang paling sering dibutuhkan admin WarungFit.

-- Produk dan stok per varian
SELECT p.name, pv.sku, pv.name AS variant, pv.stock, pv.price
FROM products p JOIN product_variants pv ON pv.product_id = p.id
WHERE p.status = 'active'
ORDER BY p.name, pv.name;

-- Produk terlaris
SELECT oi.product_name, SUM(oi.quantity) AS unit_terjual, SUM(oi.total_price) AS omzet
FROM order_items oi JOIN orders o ON o.id = oi.order_id
WHERE o.payment_status = 'paid'
GROUP BY oi.product_name
ORDER BY unit_terjual DESC
LIMIT 10;

-- Omzet bulanan
SELECT DATE_TRUNC('month', created_at) AS bulan,
       COUNT(*) AS jumlah_pesanan,
       SUM(grand_total) AS omzet
FROM orders
WHERE payment_status = 'paid'
GROUP BY 1 ORDER BY 1 DESC;

-- Batch suplemen yang akan kedaluwarsa dalam 90 hari
SELECT p.name, pv.sku, ib.batch_number, ib.quantity, ib.expiry_date
FROM inventory_batches ib
JOIN product_variants pv ON pv.id = ib.product_variant_id
JOIN products p ON p.id = pv.product_id
WHERE ib.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY ib.expiry_date;
