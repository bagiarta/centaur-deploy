# Panduan Integrasi CCTV Monitoring ke Centaur Deploy

## Overview

Sistem CCTV Monitoring telah diintegrasikan ke dalam aplikasi Centaur Deploy yang sudah ada. Menggunakan database SQL Server yang sama dan server Node.js yang sama.

## Setup Database

### 1. Jalankan Setup Script

```bash
node setup_cctv_db.cjs
```

Script ini akan membuat tabel-tabel berikut di database Centaur yang sudah ada:

- `CCTVLocations` - Lokasi perangkat CCTV
- `CCTVDevices` - Perangkat DVR/NVR/XVR
- `CCTVChannels` - Channel/kamera
- `CCTVStorage` - Storage/HDD status
- `CCTVMonitoringLogs` - Log monitoring
- `CCTVNotificationSettings` - Pengaturan notifikasi

### 2. Verifikasi Tables

```sql
SELECT * FROM CCTVLocations
SELECT * FROM CCTVDevices
```

## API Endpoints

### Devices

```
GET    /api/cctv/devices              # Get all CCTV devices
GET    /api/cctv/devices/:id          # Get device by ID
POST   /api/cctv/devices              # Create new device
PUT    /api/cctv/devices/:id          # Update device
DELETE /api/cctv/devices/:id          # Delete device (soft)
```

### Dashboard

```
GET    /api/cctv/dashboard            # Get dashboard statistics
```

### Monitoring Logs

```
GET    /api/cctv/logs                 # Get monitoring logs
PUT    /api/cctv/logs/:id/resolve     # Resolve alert
```

### Locations

```
GET    /api/cctv/locations            # Get all locations
POST   /api/cctv/locations            # Create location
```

## Contoh Request

### Create Device

```http
POST /api/cctv/devices
Content-Type: application/json

{
  "name": "NVR Head Office",
  "deviceType": "NVR",
  "vendor": "hikvision",
  "model": "DS-7616NI-K2",
  "ipAddress": "192.168.1.64",
  "port": 80,
  "username": "admin",
  "password": "Admin123",
  "isHttps": false,
  "locationId": "loc-xxx",
  "pollInterval": 300
}
```

### Get Dashboard

```http
GET /api/cctv/dashboard

Response:
{
  "success": true,
  "data": {
    "devices": {
      "total_devices": 10,
      "online_devices": 8,
      "offline_devices": 2,
      "error_devices": 0
    },
    "channels": {
      "total_channels": 128,
      "online_channels": 120,
      "offline_channels": 8,
      "recording_channels": 120
    },
    "storage": {
      "total_disks": 20,
      "normal_disks": 18,
      "error_disks": 0,
      "critical_disks": 1,
      "warning_disks": 1
    }
  }
}
```

## Polling System

### Automatic Polling

Sistem akan otomatis melakukan polling setiap 5 menit untuk:

1. Mengecek status device (online/offline)
2. Mengambil status channel
3. Mengambil status storage
4. Mencatat perubahan status
5. Trigger notifikasi jika ada perubahan

### Manual Polling

Untuk trigger polling manual (debugging):

```javascript
import { triggerManualPoll } from './utils/cctvPollingService.js';

// In your code
const result = await triggerManualPoll();
console.log(result);
```

## Frontend Integration

### Add Route

Edit `src/App.tsx`:

```tsx
import CCTVMonitoringPage from './pages/CCTVMonitoringPage';

// Add route
<Route path="/cctv" element={<CCTVMonitoringPage />} />
```

### Add Menu Item

Edit navigation menu:

```tsx
{
  label: 'CCTV Monitoring',
  path: '/cctv',
  icon: Video
}
```

## Socket.IO Events (Optional)

Untuk real-time updates, tambahkan Socket.IO events:

```javascript
// In server.js
io.on('connection', (socket) => {
  socket.on('join_cctv_room', (deviceId) => {
    socket.join(`cctv:${deviceId}`);
  });
});

// Emit device status change
io.to(`cctv:${deviceId}`).emit('device_status_update', {
  deviceId,
  status: 'online',
  timestamp: new Date()
});
```

## Hikvision ISAPI Integration

### Supported Endpoints

- `/ISAPI/System/deviceInfo` - Device information
- `/ISAPI/ContentMgmt/InputProxy/channels` - Channel status
- `/ISAPI/ContentMgmt/Storage` - Storage status
- `/ISAPI/System/status` - System status

### Authentication

Menggunakan HTTP Basic Authentication:

```javascript
const auth = Buffer.from(`${username}:${password}`).toString('base64');
headers: {
  'Authorization': `Basic ${auth}`
}
```

## Multi-Vendor Support

Untuk menambahkan vendor baru (Dahua, dll):

1. Buat service baru: `utils/cctvDahuaService.js`
2. Implement polling function
3. Update `cctvPollingService.js`:

```javascript
if (device.vendor === 'hikvision') {
  return pollHikvisionDevice(device);
} else if (device.vendor === 'dahua') {
  return pollDahuaDevice(device);
}
```

## Monitoring & Alerts

### Log Severity Levels

- `critical` - Device offline, storage full
- `high` - Channel offline, storage error
- `medium` - Channel video loss
- `low` - Minor issues
- `info` - Status changes

### Alert Triggers

- Device status change (online → offline)
- Storage usage > 95% (critical)
- Storage usage > 80% (warning)
- Channel video loss
- HDD error

## Performance

### Database Indexing

Indexes sudah dibuat untuk:
- `CCTVDevices(status, is_active)`
- `CCTVDevices(location_id)`
- `CCTVChannels(device_id, status)`
- `CCTVStorage(device_id)`
- `CCTVMonitoringLogs(device_id, created_at)`

### Concurrent Polling

Default: 10 devices concurrent

Untuk adjust:

```javascript
const maxConcurrent = 20; // Edit in cctvPollingService.js
```

## Troubleshooting

### Device tidak bisa diakses

1. Check koneksi network
2. Verify IP address dan port
3. Check credentials
4. Test manual via browser: `http://ip:port/ISAPI/System/deviceInfo`

### Polling tidak berjalan

1. Check cron job: `console.log` di `startCCTVPollingJob()`
2. Verify devices di database
3. Check logs: `SELECT * FROM CCTVMonitoringLogs ORDER BY created_at DESC`

### High CPU Usage

1. Reduce concurrent polling
2. Increase poll interval
3. Disable inactive devices

## Testing

### Test Device Connection

```bash
curl -u admin:password http://192.168.1.64/ISAPI/System/deviceInfo
```

### Test API

```bash
# Get all devices
curl http://localhost:3005/api/cctv/devices

# Get dashboard
curl http://localhost:3005/api/cctv/dashboard
```

## Production Deployment

### Environment Variables

```env
# No additional env vars needed, uses existing Centaur DB config
DB_SERVER=your_sql_server
DB_USER=your_username
DB_PASS=your_password
DB_NAME=CentaurDeploy
```

### PM2 Configuration

Sudah include dalam PM2 config yang existing.

## Next Steps

1. ✅ Setup database tables
2. ✅ Test API endpoints
3. ✅ Add frontend route
4. ⏳ Configure devices
5. ⏳ Setup notifications
6. ⏳ Monitor logs

## Support

Untuk bantuan lebih lanjut, hubungi tim development.