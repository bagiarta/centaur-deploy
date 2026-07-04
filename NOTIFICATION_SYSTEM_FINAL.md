# 📬 Sistem Notifikasi CCTV - Dokumentasi Final

## ✅ Status: SELESAI & BERFUNGSI

Sistem notifikasi gabungan untuk CCTV monitoring telah berhasil diimplementasi dan diuji.

---

## 🎯 Fitur Utama

### 1. **Notifikasi Gabungan (Consolidated Notifications)**
- Semua perubahan status dikumpulkan dalam **1 pesan Discord**
- Tidak ada spam notifikasi
- Format yang rapi dan mudah dibaca

### 2. **Deteksi Perubahan Status**
Sistem mendeteksi dan memberi notifikasi untuk:
- 🚨 **Device Offline/Online** - DVR/NVR tidak dapat dijangkau atau kembali online
- ⚠️ **Channel Offline/Online** - Camera channel kehilangan sinyal atau pulih
- 💿 **Storage Error/Normal** - Hard disk bermasalah atau kembali normal

### 3. **Color-Coded Alerts**
- 🔴 **Red (Critical)**: Device offline atau storage error
- 🟠 **Amber (Warning)**: Channel offline atau video loss
- 🟢 **Green (Recovery)**: Semua device/channel pulih

---

## ⏰ Jadwal Eksekusi

### Automatic Polling (Cron Job)
```
┌─────────────────────────────────────────────┐
│  Setiap 5 menit:                            │
│  1. Poll semua device (update database)    │
│  2. Tunggu 1 menit                          │
│  3. Cek perubahan status                    │
│  4. Kirim notifikasi (jika ada perubahan)  │
└─────────────────────────────────────────────┘

Cron: */5 * * * *
```

**Timeline:**
- **00:00** - Polling dimulai (~30 detik)
- **00:30** - Polling selesai, database ter-update
- **01:30** - Notifikasi dikirim (jika ada perubahan)
- **05:00** - Polling berikutnya dimulai

### Manual Poll dari UI
```
┌─────────────────────────────────────────────┐
│  User klik "Check Status":                  │
│  1. Poll semua device                       │
│  2. Update database                         │
│  3. Response ke UI (success/failed count)   │
│  ✗ TIDAK kirim notifikasi                   │
└─────────────────────────────────────────────┘
```

> **Catatan:** Manual poll hanya update status, tidak mengirim notifikasi Discord untuk menghindari spam saat user testing.

---

## 📁 File yang Dimodifikasi

### 1. `utils/cctvPollingService.js`
**Fungsi Utama:**
- `checkAndSendNotifications()` - Membaca database, deteksi perubahan, kirim notifikasi gabungan
- `pollAllCCTVDevices()` - Polling semua device, update ke database
- `startCCTVPollingJob()` - Cron scheduler setiap 5 menit + delay 1 menit untuk notifikasi

**State Tracker:**
```javascript
const lastKnownState = new Map();
// Format: { deviceId: { lastDeviceStatus, lastOfflineChannelCount, lastErrorDiskCount } }
```

### 2. `utils/discordWebhook.js`
**Fungsi:**
- `sendDiscordAlert(title, description, color)` - Kirim notifikasi ke Discord
- Membaca webhook URL dari tabel `NotificationSettings`

### 3. `controllers/cctvController.js`
**Fungsi:**
- `triggerPollNow()` - Manual poll dari UI (TIDAK kirim notifikasi)

### 4. `config/db.js`
**Perbaikan:**
- Fixed SQL syntax error di query `ORDER BY`

---

## 🧪 Testing

### Test 1: Notifikasi Gabungan
```bash
node test_notification_consolidated.mjs
```
**Result:** ✅ Mengirim sample notifikasi dengan 5 perubahan status

### Test 2: Full Flow (Initialize → Change → Notify)
```bash
node test_notification_full_flow.mjs
```
**Result:** ✅ Mendeteksi perubahan status dan mengirim notifikasi Discord

### Test 3: Simulasi Perubahan Status
```bash
node simulate_status_change.mjs
```
**Result:** ✅ Mengubah status device dan channel di database

### Test 4: Manual Poll
```bash
node trigger_manual_poll.mjs
```
**Result:** ✅ Polling berhasil, TIDAK mengirim notifikasi

---

## 📊 Format Notifikasi Discord

### Contoh Notifikasi:

```
📊 CCTV Monitoring Alert - 5 Change(s) Detected

Time: 3/7/2026, 14.30.15

🚨 Device Offline: DVRFMLK001 (172.16.104.67) - Hikvision

⚠️ Channel Offline: NVR 3 Nusa Dua (172.16.9.46) - 2 channel(s) went offline (Total: 5)

💿 Storage Alert: NVR 2 GOURMET ECHO BEACH (172.16.10.27) - 1 disk(s) reporting errors (Total: 1)

✅ Device Recovered: DVRFMLK001 (172.16.104.67) is back online

✅ Channel Recovered: NVR 3 Nusa Dua (172.16.9.46) - 2 channel(s) recovered
```

---

## 🔧 Konfigurasi

### Discord Webhook
Webhook URL disimpan di database:
```sql
SELECT webhook_url FROM NotificationSettings WHERE id = 'global'
```

### Polling Interval
Diatur di `startCCTVPollingJob()`:
```javascript
cron.schedule('*/5 * * * *', ...); // Setiap 5 menit
```

### Notification Delay
Delay 1 menit setelah polling:
```javascript
setTimeout(async () => {
  await checkAndSendNotifications();
}, 60000); // 60 seconds
```

---

## ✅ Checklist Implementasi

- [x] Fungsi `checkAndSendNotifications()` bekerja
- [x] Deteksi perubahan device status
- [x] Deteksi perubahan channel status  
- [x] Deteksi perubahan storage status
- [x] Notifikasi gabungan (1 pesan untuk semua perubahan)
- [x] Color-coded alerts (Red/Amber/Green)
- [x] In-memory state tracker (prevent spam)
- [x] Cron job setiap 5 menit
- [x] Delay 1 menit setelah polling
- [x] Manual poll TIDAK kirim notifikasi
- [x] Fix duplicate key error di `CCTVMonitoringLogs`
- [x] Testing & validasi
- [x] Dokumentasi

---

## 🚀 Status Production

**Server:** Centaur-bacend (PM2)  
**Database:** DBWH_8529 @ 192.168.85.29  
**Discord Webhook:** Configured ✅  
**Cron Job:** Running ✅  

### Monitoring
```bash
# Cek log PM2
pm2 logs Centaur-bacend --lines 100

# Cek status cron
pm2 list

# Test manual
node test_notification_full_flow.mjs
```

---

## 📞 Support

Jika ada masalah:
1. Cek webhook URL di database `NotificationSettings`
2. Cek log PM2 untuk error
3. Test manual dengan `test_notification_full_flow.mjs`
4. Pastikan Discord channel menerima webhook

---

**Last Updated:** 2026-07-03  
**Status:** ✅ Production Ready
