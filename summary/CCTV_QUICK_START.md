# CCTV MONITORING - QUICK START GUIDE 🚀

## 🎯 RINGKASAN SINGKAT

System monitoring CCTV Hikvision dengan fitur:
- ✅ Auto-discovery device info, channels, storage dari ISAPI
- ✅ CRUD lengkap (Create, Read, Update, Delete)
- ✅ Integrasi lokasi dari DimStore (DBWH_8555)
- ✅ Dashboard real-time statistics
- ✅ Digest Authentication (working dengan Hikvision)

---

## ⚡ QUICK START (3 MENIT)

### 1. Start Server
```bash
cd f:\PepiUpdater\centaur-deploy
npm start
```

### 2. Buka Browser
```
http://localhost:3001/cctv
```

### 3. Add Device (Test)
```
IP: 172.16.13.68
Port: 80
Username: admin
Password: Ppt@8899
```

**Hasil**: Auto-discover 16 channels + 2 storage (3.8TB each)

---

## 📋 MENU NAVIGATION

```
Centaur App
└── Tools & Utilities
    └── CCTV Monitoring  ← Klik ini
```

---

## 🎨 UI OVERVIEW

### Dashboard (Top)
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   Devices   │  Channels   │   Storage   │   Alerts    │
│   Total: 6  │  Total: 32  │  Total: 4   │   Active: 2 │
│   Online: 2 │  Online: 30 │  Normal: 3  │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### Tabs
- **All Devices**: Semua device
- **Online**: Hanya yang online
- **Offline**: Hanya yang offline

### Device Card (Setiap Device)
```
┌──────────────────────────────────────┐
│ NVR 1                    [✓ Online]  │
│ Hikvision NVR                        │
│ 📍 Toko Pusat                        │
│ 🌐 172.16.13.68:80                   │
│ Last seen: 25/06/2026 14:30:00      │
│                                      │
│ [👁 View] [✏️ Edit] [🗑️ Delete]      │
└──────────────────────────────────────┘
```

---

## 🔧 OPERATIONS

### ➕ Add New Device

1. Klik **"Add Device"**
2. Fill form:
   ```
   IP Address: 172.16.13.68
   Port: 80
   Username: admin
   Password: Ppt@8899
   [ ] Use HTTPS
   ```
3. (Optional) Klik **"Test Connection"** → verify
4. Klik **"Auto-Discover"** → get device info
5. (Optional) Pilih **Location** dari dropdown
6. Klik **"Add Device"** → DONE! ✅

**Result**: Device + 16 channels + 2 storage tersimpan otomatis

---

### 👁️ View Details

1. Klik tombol **"View"** pada device card
2. Dialog menampilkan:
   - Device info (Name, Model, IP, Status)
   - **Channels** (16 channels dengan status)
   - **Storage** (2 HDDs dengan capacity)

Example:
```
Device: NVR 1
Model: DS-7616NI-Q2/16P
Status: [✓ Online]

Channels (16):
  Ch 1: Online  - 172.16.13.101
  Ch 2: Online  - 172.16.13.102
  ...

Storage (2):
  HDD 1: 3.8 TB (Normal) - 85% used
  HDD 2: 3.8 TB (Normal) - 72% used
```

---

### ✏️ Edit Device

1. Klik tombol **Edit** (pencil icon)
2. Update fields (IP, Port, Username, Location, etc.)
3. (Optional) Update password
4. Klik **"Save Changes"** → DONE! ✅

---

### 🗑️ Delete Device

1. Klik tombol **Delete** (trash icon, red)
2. Confirm deletion
3. Device akan soft-deleted (`is_active = 0`)

**Note**: Data tidak dihapus permanent, hanya di-hide

---

## 🔌 TEST CONNECTION

### Manual Test (UI)
1. Di Add Device form
2. Isi IP, Username, Password
3. Klik **"Test Connection"**
4. Toast notification: ✅ Success atau ❌ Failed

### API Test (Terminal)
```bash
node test_cctv_api.cjs
```

Output:
```
✅ Test Connection: SUCCESS
✅ Auto-Discovery: 16 channels, 2 storage
✅ Get Devices: 6 devices found
✅ Dashboard: All stats working
```

---

## 📊 DASHBOARD STATISTICS

### Devices
- Total devices in system
- Online/Offline/Error count
- Device status distribution

### Channels
- Total channels across all devices
- Active channels (online)
- Recording channels

### Storage
- Total HDDs/disks
- Normal/Warning/Critical status
- Health monitoring

### Alerts
- Critical issues
- Storage full warnings
- Device offline alerts

---

## 🔍 AUTO-DISCOVERY DETAILS

### What Gets Auto-Discovered?

**Device Info** (`/ISAPI/System/deviceInfo`):
- Device Name: "NVR 1"
- Model: "DS-7616NI-Q2/16P"
- Serial Number
- Firmware Version
- MAC Address

**Channels** (`/ISAPI/ContentMgmt/InputProxy/channels/status`):
- Total: 16 channels
- Status: Online/Offline per channel
- Camera IP addresses
- Protocol (HIKVISION, RTSP, etc.)

**Storage** (`/ISAPI/ContentMgmt/Storage`):
- Total: 2 HDDs
- Capacity: 3.8TB each
- Usage percentage
- Free space

---

## 📡 API ENDPOINTS

### Devices
```
GET    /api/cctv/devices              List all devices
GET    /api/cctv/devices/:id          Get device + channels + storage
POST   /api/cctv/devices              Create with auto-discover
PUT    /api/cctv/devices/:id          Update device
DELETE /api/cctv/devices/:id          Soft delete
```

### Testing & Discovery
```
POST   /api/cctv/test-connection      Test credentials
POST   /api/cctv/discover             Auto-discover info
```

### Locations
```
GET    /api/cctv/locations            Get DimStore locations
```

### Dashboard
```
GET    /api/cctv/dashboard            Statistics summary
```

---

## 🗄️ DATABASE

### Main Tables:
1. **CCTVDevices** - Device master data
2. **CCTVChannels** - Channel details (16 per device)
3. **CCTVStorage** - Storage/HDD info (2 per device)
4. **CCTVMonitoringLogs** - System logs
5. **CCTVNotificationSettings** - Alert settings

### Cross-Database:
- **DimStore** (DBWH_8555) - Location data

---

## 🐛 TROUBLESHOOTING

### Issue: "Failed to test connection"
**Solution**:
- Verify IP address reachable: `ping 172.16.13.68`
- Check credentials (admin/Ppt@8899)
- Ensure port 80 accessible

### Issue: "Device not showing in list"
**Solution**:
- Check `is_active = 1` in database
- Refresh page (or wait for auto-refresh)
- Check browser console for errors

### Issue: "Channels = 0"
**Solution**:
- Auto-discovery may have failed
- Check device supports ISAPI endpoints
- Try manual re-discovery

### Issue: "Location dropdown empty"
**Solution**:
- Verify DimStore has data in DBWH_8555
- Check `ORG_STATUS = 'O'` condition
- Check cross-database permissions

---

## 🎯 FEATURE STATUS

| Feature | Status | Notes |
|---------|--------|-------|
| Add Device | ✅ | With auto-discovery |
| View Details | ✅ | Channels + Storage |
| Edit Device | ✅ | All fields editable |
| Delete Device | ✅ | Soft delete |
| Test Connection | ✅ | Digest Auth |
| Auto-Discovery | ✅ | 16ch + 2 storage |
| Location Integration | ✅ | From DimStore |
| Dashboard Stats | ✅ | Real-time |
| Auto-Polling | 🚧 | Next phase |
| Alerts/Notifications | 🚧 | Next phase |

---

## 📝 CREDENTIALS

### Test Device (Working)
```
IP: 172.16.13.68
Port: 80
Username: admin
Password: Ppt@8899
HTTPS: No

Expected Result:
- Model: DS-7616NI-Q2/16P
- Channels: 16
- Storage: 2 HDDs @ 3.8TB
```

---

## 🚀 NEXT STEPS

### Phase 2: Auto-Polling
- Cron job setiap 5 menit
- Update device status otomatis
- Update channel status
- Update storage usage

### Phase 3: Alerts
- Storage full notification
- Device offline alert
- Channel error detection
- Email/SMS notifications

### Phase 4: Advanced Features
- Live video preview
- Historical data/reports
- Multi-vendor support (Dahua, etc.)
- Bandwidth monitoring

---

## 📚 DOCUMENTATION FILES

```
CCTV_STATUS_FINAL.md      ← Ringkasan lengkap (baca ini!)
CCTV_QUICK_START.md       ← Guide ini
test_cctv_api.cjs         ← Test script
check_cctv_db.cjs         ← Check database
check_cctv_schema.cjs     ← Verify schema
```

---

## ✅ READY TO USE!

System sudah **production-ready** untuk:
- ✅ Monitoring device status
- ✅ Tracking channels
- ✅ Storage management
- ✅ Location-based organization

**Start using**: `http://localhost:3001/cctv` 🎉
