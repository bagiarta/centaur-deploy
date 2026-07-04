# CCTV 3-Check Confirmation Notification System

## Overview

Sistem notifikasi CCTV telah diperbarui dengan mekanisme **3-check confirmation** untuk mengurangi false positive dan meningkatkan akurasi notifikasi.

## Problem Statement

**Masalah sebelumnya:**
- Notifikasi dikirim segera setelah status berubah (1x check)
- Sering terjadi false alarm karena gangguan jaringan sesaat
- Device bisa "flapping" antara online/offline dalam waktu singkat
- Menghasilkan terlalu banyak notifikasi yang tidak akurat

**Contoh masalah:**
```
10:00 - Device offline → Kirim notifikasi "Device Offline"
10:01 - Device online  → Kirim notifikasi "Device Recovered"
10:02 - Device offline → Kirim notifikasi "Device Offline"
10:03 - Device online  → Kirim notifikasi "Device Recovered"
```

## Solution: 3-Check Confirmation

**Logika baru:**
- Status device harus **konsisten selama 3 kali check berturut-turut** sebelum mengirim notifikasi
- Setiap device memiliki status history tracker (menyimpan 3 status terakhir)
- Notifikasi hanya dikirim jika:
  1. Ada 3 status history (minimal sudah 3x check)
  2. Semua 3 status sama/konsisten
  3. Status ini berbeda dari status yang terakhir di-notifikasi

**Timeline:**
```
Minute 0: Device goes offline
  └─ Check 1: offline → History: [offline] → No notification (need 3 checks)

Minute 1: Device still offline  
  └─ Check 2: offline → History: [offline, offline] → No notification (need 1 more)

Minute 2: Device still offline
  └─ Check 3: offline → History: [offline, offline, offline] → ✅ SEND NOTIFICATION

Minute 3: Device still offline
  └─ Check 4: offline → History: [offline, offline, offline] → No notification (already sent)
```

## Architecture

### 1. Status History Tracker

```javascript
// Format: { deviceId: { statusHistory: ['online', 'online', 'offline'], lastNotifiedStatus: 'online' } }
const statusHistory = new Map();
```

- **statusHistory**: Array yang menyimpan 3 status terakhir
- **lastNotifiedStatus**: Status terakhir yang sudah di-notifikasi (untuk prevent duplicate)

### 2. Quick Status Check (Every 1 Minute)

Fungsi `quickStatusCheckAll()` sekarang:
1. Melakukan simple connection test ke semua device
2. Update database dengan status terbaru
3. **Menyimpan status ke history** (rolling window, max 3 item)
4. Log history untuk debugging

### 3. Notification Check (After Full Discovery, Every 5 Minutes)

Fungsi `checkAndSendNotifications()` sekarang:
1. Membaca current status dari database
2. Membandingkan dengan state sebelumnya
3. **Validasi 3-check confirmation**:
   - Cek apakah sudah ada 3 history
   - Cek apakah semua 3 status sama
   - Cek apakah berbeda dari last notified status
4. Hanya kirim notifikasi jika semua kondisi terpenuhi

## Implementation Details

### Quick Status Check Flow

```javascript
export async function quickStatusCheckAll() {
  // 1. Get all active devices
  // 2. Do simple connection test
  
  for (const result of batchResults) {
    // 3. Track status history
    let history = statusHistory.get(result.deviceId);
    if (!history) {
      history = { statusHistory: [], lastNotifiedStatus: null };
      statusHistory.set(result.deviceId, history);
    }
    
    // 4. Add current status
    history.statusHistory.push(result.status);
    
    // 5. Keep only last 3 checks
    if (history.statusHistory.length > 3) {
      history.statusHistory.shift();
    }
    
    // 6. Update database
    await pool.request().query(`UPDATE CCTVDevices SET status = @status ...`);
  }
}
```

### Notification Check Flow

```javascript
export async function checkAndSendNotifications() {
  for (const device of devices) {
    // 1. Check if status changed
    if (prevState.lastDeviceStatus !== device.status) {
      
      // 2. Validate 3-check confirmation
      if (history && history.statusHistory.length === 3) {
        const allSame = history.statusHistory.every(s => s === device.status);
        const lastNotified = history.lastNotifiedStatus;
        
        // 3. Only send if consistent AND not yet notified
        if (allSame && lastNotified !== device.status) {
          alerts.push(`🚨 Device Offline (Confirmed): ${device.name}`);
          
          // 4. Mark as notified
          history.lastNotifiedStatus = device.status;
        }
      }
    }
  }
  
  // 5. Send consolidated notification
  if (alerts.length > 0) {
    await sendDiscordAlert(title, description, color);
  }
}
```

## Cron Schedule

### Quick Status Check: Every 1 Minute
```javascript
cron.schedule('*/1 * * * *', async () => {
  await quickStatusCheckAll();
});
```
- **Purpose**: Simple connection test, update device status
- **Output**: Status history untuk 3-check validation

### Full Discovery: Every 5 Minutes
```javascript
cron.schedule('*/5 * * * *', async () => {
  await pollAllCCTVDevices();
  
  // Wait 1 minute before checking notifications
  setTimeout(async () => {
    await checkAndSendNotifications();
  }, 60000);
});
```
- **Purpose**: Complete device discovery (channels, storage, device info)
- **Timeline**: Poll → Wait 1min → Check notifications with 3-check validation

## Benefits

### 1. Reduced False Positives
- Gangguan jaringan sesaat tidak langsung trigger notifikasi
- Device flapping tidak menghasilkan spam notifikasi

### 2. More Accurate Alerts
- Notifikasi hanya dikirim untuk masalah yang **benar-benar persisten**
- Lebih reliable untuk decision making

### 3. Better User Experience
- Tidak overwhelm user dengan terlalu banyak notifikasi
- Setiap notifikasi lebih meaningful

### 4. Monitoring Improvement
- Status history memberikan visibility untuk debugging
- Log menunjukkan progression: `[online → offline → offline]`

## Special Cases

### Case 1: Flapping Device
```
Check 1: online  → History: [online] → No notification
Check 2: offline → History: [online, offline] → No notification
Check 3: online  → History: [online, offline, online] → No notification (inconsistent!)
Check 4: online  → History: [offline, online, online] → No notification (inconsistent!)
Check 5: online  → History: [online, online, online] → ✅ SEND "Device Online"
```
✅ Notifikasi dikirim hanya setelah status stabil

### Case 2: Persistent Offline
```
Check 1: offline → History: [offline] → No notification
Check 2: offline → History: [offline, offline] → No notification
Check 3: offline → History: [offline, offline, offline] → ✅ SEND "Device Offline"
Check 4: offline → History: [offline, offline, offline] → No notification (already sent)
```
✅ Notifikasi dikirim sekali, tidak spam

### Case 3: Recovery
```
// Previously sent: "Device Offline"
Check 1: online → History: [offline, offline, online] → No notification (inconsistent)
Check 2: online → History: [offline, online, online] → No notification (inconsistent)
Check 3: online → History: [online, online, online] → ✅ SEND "Device Recovered"
```
✅ Recovery juga butuh 3-check confirmation

## Channels & Storage Notifications

**Important:** Channel dan Storage alerts **TIDAK** menggunakan 3-check confirmation:
- Channel offline/recovered: **Immediate notification**
- Storage error/recovered: **Immediate notification**

**Reasoning:**
- Channel dan storage changes lebih rare dan critical
- Tidak perlu menunggu 3 checks untuk alert storage/channel issues

## Testing

### Manual Testing

```bash
# Run 3-check confirmation test
node test_3check_confirmation.mjs
```

This will:
1. Trigger 3 manual polls with 5-second intervals
2. Show the status history progression
3. Demonstrate when notification is sent

### Expected Behavior

**Console Log Example:**
```
[CCTV Quick Check] Device-A history: [offline]
[CCTV Quick Check] Device-A history: [offline → offline]
[CCTV Quick Check] Device-A history: [offline → offline → offline]

[CCTV Notification] ✅ CONFIRMED: Device-A status is consistently offline for 3 checks
[CCTV Notification] Sending consolidated alert...
```

## Configuration

### Tuning Parameters

If you need to adjust the confirmation threshold:

```javascript
// Current: 3 checks required
const CONFIRMATION_THRESHOLD = 3;

// To change: Update these lines in cctvPollingService.js

// In quickStatusCheckAll():
if (history.statusHistory.length > CONFIRMATION_THRESHOLD) {
  history.statusHistory.shift();
}

// In checkAndSendNotifications():
if (history && history.statusHistory.length === CONFIRMATION_THRESHOLD) {
  const allSame = history.statusHistory.every(s => s === device.status);
  // ...
}
```

## Troubleshooting

### Issue: Notifikasi tidak pernah dikirim

**Debug steps:**
1. Check console log untuk status history:
   ```
   [CCTV Quick Check] Device-A history: [online → offline → online]
   ```
2. Pastikan status **konsisten** untuk 3 checks
3. Check `lastNotifiedStatus` - mungkin sudah di-notify sebelumnya

### Issue: Notifikasi terlambat

**Normal behavior:**
- Worst case delay: 3 minutes (3x quick check @ 1 min interval)
- Plus 1 minute wait before notification
- **Total max delay: 4 minutes**

### Issue: Status history tidak di-track

**Check:**
1. `quickStatusCheckAll()` berjalan setiap 1 menit?
2. Device ID konsisten?
3. `statusHistory.set()` dipanggil?

## Migration Notes

**No database migration required** - semua state disimpan in-memory.

**Restart behavior:**
- Status history akan reset saat server restart
- First 3 checks setelah restart akan rebuild history
- No notifications during first 3 checks (by design)

## Monitoring

### Key Metrics to Watch

1. **Status History Log**
   ```
   [CCTV Quick Check] Device-A history: [offline → offline → offline]
   ```

2. **Confirmation Log**
   ```
   [CCTV Notification] ✅ CONFIRMED: Device-A consistently offline for 3 checks
   ```

3. **Waiting Log**
   ```
   [CCTV Notification] ⏳ WAITING: Device-A - Need 2 more check(s) for confirmation
   ```

## Summary

| Feature | Before | After |
|---------|--------|-------|
| **Device Status Alert** | 1 check (immediate) | 3 checks (confirmed) |
| **Channel Alert** | Immediate | Immediate (unchanged) |
| **Storage Alert** | Immediate | Immediate (unchanged) |
| **False Positive** | High | Low |
| **Alert Delay** | 0 min | Max 4 min |
| **Notification Spam** | High risk | Low risk |

✅ **Result**: More reliable, accurate, and user-friendly notification system!
