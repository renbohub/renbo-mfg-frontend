# Renbo ERP Frontend

Frontend EJS tanpa sidebar untuk Renbo ERP, terpisah dari backend dan menggunakan API Prisma/PostgreSQL yang sudah ada.

## Menjalankan

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Buka `http://localhost:3100/login`, lalu masuk menggunakan akun backend. Token JWT disimpan pada `localStorage` atau `sessionStorage` sesuai pilihan **Ingat sesi saya**. Setelah login, pengguna diarahkan ke `/modules` untuk memilih area kerja.

## Modul Operasional

- Manufacturing BOM
- Planning PPIC
- Production
- Purchasing
- Inventory
- Incoming
- Outgoing

Halaman yang sudah memiliki route backend memakai DataTables server-side dan detail data nyata. Halaman yang belum memiliki route backend tetap tersedia sebagai frontend siap-integrasi, mengembalikan tabel kosong secara aman, dan tidak membuat data contoh palsu atau request yang menyebabkan 502.

Endpoint utama frontend:

- `/modules` — pemilih modul setelah login.
- `/modules/:module` — landing page tiap modul.
- `/modules/:module/:page` — tabel operasional atau laporan.
- `/modules/api/:module/:page` — proxy aman ke API backend.

## Modul Master Data

- `/master-data` — hub modul sesuai frame Figma.
- `/master-data/:entity` — daftar DataTables server-side.
- `/master-data/:entity/new` — form tambah data.
- `/master-data/:entity/:id/edit?key=:detailKey` — form edit data.
- `/master-data/:entity/:detailKey` — halaman detail.
- `/login` — halaman autentikasi yang terhubung ke `/api/auth/login` pada backend.

Registry `src/masterDataRegistry.js` mencakup seluruh mount master data backend serta master gudang. Registry `src/moduleRegistry.js` menjadi sumber tunggal menu operasional, kolom tabel, status integrasi API, dan endpoint backend.

Fitur bersama: pencarian dan pagination server-side, detail data, CSV export, JWT guard, Socket.IO, MQTT, serta chart ApexCharts pada halaman laporan.
