# 🚀 Cara Menjalankan Server Centaur dengan CCTV Monitoring

## Prerequisites

✅ Database sudah setup (run `node setup_cctv_db.cjs`)  
✅ Frontend sudah di-build (run `npm run build`)  
✅ Dependencies sudah terinstall (run `npm install`)

## Menjalankan Server

### Option 1: Development Mode (dengan auto-reload)

```bash
npm run dev
# atau
node --watch server.js
```

### Option 2: Production Mode

```bash
npm start
# atau  
node server.js
```

### Option 3: PM2 (Background Process)

```bash
pm2 start server.js --name centaur
pm2 logs centaur
pm2 stop centaur
pm2 restart centaur
```

## Akses Aplikasi

- **Frontend**: http://localhost:3001
- **CCTV Page**: http://localhost:3001/cctv
- **API Docs**: http://localhost:3001/api/cctv

## Test API Endpoints

```bash
# Test CCTV API
node test_cctv_api.cjs

# Manual curl tests
curl http://localhost:3001/api/cctv/locations
curl http://localhost:3001/api/cctv/dashboard
curl http://localhost:3001/api/cctv/devices
```

## Troubleshooting

### Port 3001 sudah digunakan

```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Atau ganti port di .env
PORT=3005
```

### API mengembalikan HTML bukan JSON

- Server belum ter-load routes yang baru
- Restart server setelah build: `npm run build` kemudian restart

### Database connection error

- Check `.env` file
- Pastikan SQL Server running
- Test connection: `node setup_cctv_db.cjs`

## Monitoring Logs

Server akan otomatis menampilkan log:

```
✅ Connected to SQL Server: 192.168.85.29
🚀 HTTP Server running on port 3001
✅ CCTV Polling job scheduled (every 5 minutes)
[CCTV Polling] Running initial poll...
```

## Fitur CCTV Monitoring

1. **Dashboard** - Statistik real-time device, channel, storage
2. **Device Management** - CRUD operations untuk CCTV devices
3. **Auto Polling** - Otomatis polling setiap 5 menit
4. **Monitoring Logs** - Track semua perubahan status
5. **Multi-vendor** - Support Hikvision, expandable ke Dahua

## Next Steps

1. ✅ Start server
2. ✅ Login ke aplikasi
3. ✅ Buka /cctv page
4. ✅ Add first CCTV device
5. ✅ Monitor logs