# Folder Database

- `schema.sql` berisi seluruh struktur PostgreSQL.
- `queries.sql` berisi contoh laporan dan operasional.
- `setup.js` menjalankan schema dan mengisi data demo secara aman.

Cara termudah:

```bash
cp .env.example .env
# sesuaikan DATABASE_URL
npm install
npm run db:setup
npm start
```

Akun demo setelah setup:

- Admin: `admin@warungfit.local` / `Admin123!`
- Pelanggan: `pelanggan@warungfit.local` / `Customer123!`
