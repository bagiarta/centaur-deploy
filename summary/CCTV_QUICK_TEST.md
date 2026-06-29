# 🧪 CCTV Monitoring - Quick Test Guide

## ✅ Setup Completed

1. ✅ Database tables created (`CCTVLocations`, `CCTVDevices`, `CCTVChannels`, `CCTVStorage`, `CCTVMonitoringLogs`)
2. ✅ API routes integrated (`/api/cctv/*`)
3. ✅ Frontend page created (`/cctv`)
4. ✅ Polling service configured (every 5 minutes)
5. ✅ Frontend built and ready

## 🚀 Cara Test

### 1. Start Server

```bash
cd f:\PepiUpdater\centaur-deploy
node server.js
```

Server akan menampilkan:
```
✅ Connected to SQL Server: 192.168.85.29
🚀 HTTP Server running on port 3001 (ES Modules + Socket.io)
✅ CCTV Polling job scheduled (every 5 minutes)
```

### 2. Test API Endpoints

Buka terminal baru dan jalankan:

```bash
cd f:\PepiUpdater\centaur-deploy
node test_cctv_api.cjs
```

Expected output:
```
🧪 Testing CCTV API Endpoints...

1️⃣ Testing GET /api/cctv/locations
✅ Locations: 3 locations found

2️⃣ Testing GET /api/cctv/dashboard
✅ Dashboard: {...}

3️⃣ Testing GET /api/cctv/devices
✅ Devices: 0 devices found

4️⃣ Testing POST /api/cctv/locations
✅ Created Location: {...}

5️⃣ Testing POST /api/cctv/devices
✅ Created Device: {...}

✅ All tests completed!
```

### 3. Test Frontend

1. Buka browser: `http://localhost:3001`
2. Login dengan credentials Centaur
3. Navigate ke: `http://localhost:3001/cctv`

Anda akan melihat:
- Dashboard dengan statistik (Total Devices, Channels, Storage, Alerts)
- Device list (kosong jika belum ada device)
- Tabs: All Devices, Online, Offline

### 4. Add First CCTV Device

#### Via API (curl/Postman):

```bash
curl -X POST http://localhost:3001/api/cctv/devices \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NVR Head Office",
    "deviceType": "NVR",
    "vendor": "hikvision",
    "model": "DS-7616NI-K2",
    "ipAddress": "192.168.1.64",
    "port": 80,
    "username": "admin",
    "password": "admin123",
    "isHttps": false,
    "locationId": "<location_id>",
    "pollInterval": 300
  }'
```

#### Via SQL (direct):

```sql
USE DBWH_8529

-- Get location ID first
SELECT * FROM CCTVLocations

-- Insert device
INSERT INTO CCTVDevices (
  id, name, device_type, vendor, model, ip_address, port, 
  username, password_hash, is_https, location_id, poll_interval, 
  status, is_active
) VALUES (
  NEWID(), 'NVR Test', 'NVR', 'hikvision', 'DS-7616NI-K2',
  '192.168.1.64', 80, 'admin', 
  CONVERT(NVARCHAR(MAX), CAST('admin123' AS VARBINARY(MAX)), 2),
  0, '<location_id>', 300, 'offline', 1
)

-- Verify
SELECT * FROM CCTVDevices
```

### 5. Monitor Polling

Setelah device ditambahkan, dalam 30 detik (initial poll) atau 5 menit (scheduled poll), server akan mencoba polling device.

Check logs di server console:
```
[CCTV Polling] Running initial poll...
[CCTV Polling] Starting poll for 1 devices
[CCTV Polling] Error polling device NVR Test: ...
[CCTV Polling] Completed: 0 success, 1 failed
```

Check database logs:
```sql
SELECT TOP 10 * FROM CCTVMonitoringLogs ORDER BY created_at DESC
```

### 6. Check Dashboard Stats

Refresh halaman `/cctv`, dashboard akan menampilkan:
```
Total Devices: 1
  ✓ 0 Online
  ✗ 1 Offline

Channels: 0
Storage: 0
Alerts: 0
```

## 📊 Database Queries untuk Monitoring

```sql
-- Check all locations
SELECT * FROM CCTVLocations

-- Check all devices
SELECT d.*, l.name as location_name 
FROM CCTVDevices d
LEFT JOIN CCTVLocations l ON d.location_id = l.id

-- Check monitoring logs (last 24 hours)
SELECT ml.*, d.name as device_name
FROM CCTVMonitoringLogs ml
JOIN CCTVDevices d ON ml.device_id = d.id
WHERE ml.created_at >= DATEADD(DAY, -1, GETDATE())
ORDER BY ml.created_at DESC

-- Check device with channels and storage
SELECT 
  d.name as device_name,
  d.status as device_status,
  COUNT(DISTINCT c.id) as total_channels,
  COUNT(DISTINCT s.id) as total_disks
FROM CCTVDevices d
LEFT JOIN CCTVChannels c ON d.id = c.device_id
LEFT JOIN CCTVStorage s ON d.id = s.device_id
WHERE d.is_active = 1
GROUP BY d.name, d.status

-- Dashboard stats query
SELECT 
  (SELECT COUNT(*) FROM CCTVDevices WHERE is_active = 1) as total_devices,
  (SELECT COUNT(*) FROM CCTVDevices WHERE is_active = 1 AND status = 'online') as online_devices,
  (SELECT COUNT(*) FROM CCTVChannels WHERE is_enabled = 1) as total_channels,
  (SELECT COUNT(*) FROM CCTVStorage) as total_disks
```

## 🔍 Troubleshooting

### API returns HTML instead of JSON

**Problem**: `/api/cctv/locations` mengembalikan HTML  
**Solution**: 
1. Pastikan server ter-restart setelah build
2. Check `server.js` line untuk `app.use('/api/cctv', cctvRoutes)`
3. Restart server: Kill process dan start ulang

### Device tidak terpoll

**Problem**: Device status tetap offline setelah 5 menit  
**Possible causes**:
1. IP address salah
2. Credentials salah  
3. Device tidak support ISAPI (bukan Hikvision)
4. Network tidak bisa reach device
5. Firewall blocking

**Debug**:
```javascript
// Add console.log di cctvPollingService.js
console.log('[CCTV Polling] Polling device:', device.name, device.ip_address);
```

### Frontend tidak tampil

**Problem**: Page `/cctv` shows 404  
**Solution**:
1. Check `App.tsx` - pastikan route ada
2. npm run build
3. Restart server
4. Hard refresh browser (Ctrl+Shift+R)

### Polling tidak jalan

**Problem**: Tidak ada log polling di console  
**Solution**:
1. Check `server.js` - pastikan `startCCTVPollingJob()` dipanggil
2. Restart server
3. Check cron schedule di `cctvPollingService.js`

## ✅ Success Indicators

Jika semua berjalan dengan benar, Anda akan melihat:

1. **Server Console**:
   ```
   ✅ Connected to SQL Server
   🚀 HTTP Server running on port 3001
   ✅ CCTV Polling job scheduled
   [CCTV Polling] Running initial poll...
   [CCTV Polling] Completed: X success, Y failed
   ```

2. **Frontend `/cctv` page**:
   - Dashboard cards with stats
   - Device list with cards
   - Auto-refresh every 30 seconds

3. **Database**:
   - `CCTVDevices` has devices
   - `CCTVMonitoringLogs` has logs
   - Timestamps updating

4. **API Responses**:
   ```json
   {
     "success": true,
     "data": [...]
   }
   ```

## 📝 Next Steps After Testing

1. ✅ Configure real CCTV devices (Hikvision NVR/DVR)
2. ⏳ Add notification settings (Telegram/Email)
3. ⏳ Setup alert rules
4. ⏳ Add Dahua support (if needed)
5. ⏳ Optimize polling interval
6. ⏳ Add more monitoring features

## 🎉 You're All Set!

Sistem CCTV Monitoring sudah terintegrasi dengan Centaur Deploy dan siap digunakan!

For support: Check logs or database queries above.