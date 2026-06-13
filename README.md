# WarungFit — Website Penjualan Suplemen Gym

Paket website UMKM full-stack yang dapat langsung dijalankan dengan **Node.js/Express** dan **PostgreSQL**. Frontend dibuat tanpa proses build, sehingga deployment lebih sederhana.

## Fitur yang tersedia

### Pelanggan

- Beranda: banner promo, produk unggulan/terbaru, kategori, testimoni, dan informasi toko.
- Katalog: pencarian, filter kategori, urutkan harga/rating.
- Detail produk: foto, harga, deskripsi, stok, berat, varian rasa, komposisi, informasi nutrisi, cara konsumsi, dan catatan expired date.
- Keranjang: tambah, hapus, dan ubah jumlah produk.
- Checkout: data pembeli, alamat, kurir, voucher, pilihan pembayaran, dan ringkasan pesanan.
- Akun: register/login, profil sederhana, dan riwayat pesanan.
- Wishlist tersimpan di browser; dapat dikembangkan menjadi sinkronisasi database.
- Rating/review pelanggan dengan moderasi admin pada database.
- Tracking pesanan dan nomor resi.
- Tombol WhatsApp dan asisten produk berbasis pencarian katalog.
- Voucher demo `PROMO10`.
- Poin member otomatis setelah webhook pembayaran berstatus berhasil.

### Admin

- Dashboard omzet, jumlah pesanan, pelanggan, dan produk.
- Produk terlaris dan pesanan terbaru.
- Tambah produk dan varian awal.
- Kelola status pesanan, kurir, serta nomor resi.
- Export laporan penjualan CSV yang dapat dibuka di Excel.
- Riwayat stok, batch produk, expired date, payment event, dan notification queue tersedia pada database.

### Integrasi

- Midtrans Snap dan webhook signature verification.
- Transfer manual sebagai fallback.
- Struktur provider ongkir berada di `services/shipping.js` dan mudah diganti dengan Biteship/RajaOngkir/provider lain.
- Queue notifikasi berada di `services/notifications.js`; hubungkan dengan provider email/WhatsApp resmi milik Anda.

## Struktur folder

```text
warungfit-store/
├── public/                  # Frontend HTML, CSS, JavaScript, gambar
├── database/
│   ├── schema.sql           # Struktur PostgreSQL lengkap
│   ├── queries.sql          # Contoh query laporan
│   ├── setup.js             # Membuat tabel + data demo
│   └── README.md
├── middleware/auth.js       # JWT login dan otorisasi admin
├── services/
│   ├── midtrans.js
│   ├── shipping.js
│   └── notifications.js
├── server.js                # API dan web server
├── db.js                    # Koneksi PostgreSQL
├── demo-data.js             # Data katalog fallback
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Menjalankan secara lokal

### Cara 1 — PostgreSQL lokal

Pastikan Node.js 20+ dan PostgreSQL telah terpasang.

```bash
npm install
cp .env.example .env
```

Buat database kosong bernama `warungfit`, lalu sesuaikan `DATABASE_URL` pada `.env`:

```env
DATABASE_URL=postgresql://postgres:password_anda@localhost:5432/warungfit
JWT_SECRET=ganti-dengan-random-secret-minimal-32-karakter
```

Jalankan:

```bash
npm run db:setup
npm start
```

Buka `http://localhost:3000`.

### Cara 2 — Docker Compose

```bash
cp .env.example .env
# Ganti JWT_SECRET di docker-compose.yml sebelum production

docker compose up -d postgres
npm install
npm run db:setup
npm start
```

Atau jalankan app dan database dalam container:

```bash
docker compose up --build -d
# Setelah PostgreSQL sehat, jalankan setup sekali:
docker compose exec app npm run db:setup
```

## Akun demo

Akun dibuat oleh `npm run db:setup`:

```text
Admin
Email    : admin@warungfit.local
Password : Admin123!

Pelanggan
Email    : pelanggan@warungfit.local
Password : Customer123!
```

**Ganti atau hapus akun demo sebelum production.**

## Mengaktifkan Midtrans

Isi `.env`:

```env
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxx
MIDTRANS_IS_PRODUCTION=false
BASE_URL=https://domain-anda.com
```

Atur Payment Notification URL pada dashboard Midtrans menjadi:

```text
https://domain-anda.com/api/webhooks/midtrans
```

Jangan menaruh `MIDTRANS_SERVER_KEY` di frontend. Status pesanan diperbarui oleh webhook yang diverifikasi di backend.

## Publish

Paling mudah menggunakan Railway, Render, Fly.io, VPS, atau layanan lain yang mendukung Node.js dan PostgreSQL.

1. Upload folder ini ke GitHub.
2. Buat PostgreSQL pada provider.
3. Buat layanan web dari repository.
4. Isi seluruh environment variable.
5. Gunakan start command `npm start`.
6. Jalankan `npm run db:setup` satu kali melalui shell provider.
7. Atur domain dan `BASE_URL`.
8. Atur webhook Midtrans.

Docker juga dapat dipakai langsung menggunakan `Dockerfile` yang tersedia.

## Hal yang wajib diubah sebelum production

- Nama, alamat, nomor WhatsApp, rekening, logo, dan kebijakan toko.
- `JWT_SECRET` dengan nilai acak dan panjang.
- Hapus akun serta password demo.
- Aktifkan HTTPS.
- Gunakan managed PostgreSQL dengan backup otomatis.
- Pasang rate limiting, monitoring, dan log terpusat sesuai skala trafik.
- Hubungkan provider email/WhatsApp resmi.
- Ganti tarif ongkir sederhana dengan API ongkir produksi.
- Uji payment sandbox dari awal sampai webhook berhasil.
- Tinjau ketentuan penjualan suplemen, label produk, privasi, retur, dan kewajiban usaha yang berlaku.

## Catatan mode demo

Katalog tetap tampil dari `demo-data.js` apabila database belum dapat diakses. Checkout data demo juga dapat disimulasikan, tetapi tidak disimpan. Untuk transaksi nyata, jalankan setup PostgreSQL terlebih dahulu.
