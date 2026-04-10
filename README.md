# PRISMA · TA-ex System

Full-stack Material Reservation & PR Management System.

## Struktur File

```
prisma-taex/
├── server.js          ← Backend Express + SQLite (auto-migrate)
├── package.json
├── railway.toml       ← Konfigurasi Railway
├── .gitignore
└── public/
    └── index.html     ← Frontend single-page app
```

## Deploy ke Railway

### 1. Push ke GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/prisma-taex.git
git push -u origin main
```

### 2. Deploy di Railway
1. Buka [railway.app](https://railway.app) → New Project
2. **Deploy from GitHub repo** → pilih repo `prisma-taex`
3. Railway otomatis detect Node.js dan jalankan `node server.js`
4. Tunggu deploy selesai → dapat URL seperti `https://prisma-taex-xxx.railway.app`

### 3. ⚠️ Tambah Volume (WAJIB agar data tidak hilang)
> Tanpa ini, database SQLite hilang setiap redeploy!

1. Di Railway project → klik service → tab **Volumes**
2. Klik **Add Volume**
3. Mount path: `/app` (atau sesuaikan dengan `DATABASE_PATH`)
4. Klik **Add**

Atau set environment variable:
```
DATABASE_PATH=/data/data.db
```
Dan tambah volume dengan mount path `/data`

### 4. Akses Aplikasi
Buka URL Railway → aplikasi langsung jalan, data otomatis dimuat dari database.

## API Endpoints

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/data` | Load semua data (init) |
| GET | `/api/health` | Health check |
| POST | `/api/taex/replace` | Upload Excel replace |
| POST | `/api/taex/append` | Upload Excel append |
| POST | `/api/taex` | Tambah 1 baris |
| PUT | `/api/taex` | Update semua taex |
| PUT | `/api/prisma` | Update prisma reservasi |
| PUT | `/api/kumpulan` | Update kumpulan summary |
| PUT | `/api/pr` | Update SAP PR |
| POST | `/api/pr/replace` | Upload SAP PR replace |
| POST | `/api/pr/append` | Upload SAP PR append |
| POST | `/api/state/:key` | Simpan state (kk, counter) |
| GET | `/api/state/:key` | Ambil state |
| POST | `/api/reset` | Reset semua data |
| POST | `/api/save` | Bulk sync semua data |

## Local Development

```bash
npm install
node server.js
# Buka http://localhost:3000
```
