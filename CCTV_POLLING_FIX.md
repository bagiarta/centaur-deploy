# 🔧 Fix: Semua Device Tiba-Tiba Offline

## ❌ Masalah
Device CCTV sering tiba-tiba menjadi offline semua secara bersamaan.

## 🔍 Penyebab

### 1. **Concurrent Polling**
- Polling dari cron job (setiap 5 menit)
- Manual polling dari UI (ketika user klik "Check Status")
- Jika keduanya berjalan bersamaan → **Race condition**

### 2. **Network Congestion**
- 84 device di-poll bersamaan
- Sebelumnya: 10 device concurrent = terlalu banyak traffic
- Network switch/router kewalahan
- Device timeout karena terlalu banyak request

### 3. **Timeout Issues**
- Auto-discover memakan waktu lama (channels + storage)
- Jika satu device lambat, semua batch ikut delay
- Akhirnya banyak device timeout → marked as offline

## ✅ Solusi yang Diterapkan

### 1. **Polling Lock Mechanism**
```javascript
let isPolling = false;
let lastPollingTime = null;

// Prevent concurrent polling
if (isPolling) {
  return { skipped: true };
}

// Prevent too frequent polling (min 30 seconds apart)
if (lastPollingTime && (Date.now() - lastPollingTime) < 30000) {
  return { skipped: true };
}
```

**Benefit:**
- ✅ Hanya 1 polling berjalan pada satu waktu
- ✅ Minimum jeda 30 detik antar polling
- ✅ Mencegah race condition

### 2. **Reduced Concurrent Devices**
```javascript
const maxConcurrent = 5; // Reduced from 10
```

**Before:**
```
Batch 1: 10 devices → Heavy network load
Batch 2: 10 devices → Some timeout
...
```

**After:**
```
Batch 1: 5 devices → Lighter load
Delay 1 second
Batch 2: 5 devices → More stable
Delay 1 second
...
```

**Benefit:**
- ✅ Network tidak overload
- ✅ Lebih sedikit timeout
- ✅ Device punya waktu respond

### 3. **Batch Delay**
```javascript
// Add 1 second delay between batches
await new Promise(resolve => setTimeout(resolve, 1000));
```

**Benefit:**
- ✅ Network recovery time antar batch
- ✅ Switch/router tidak overwhelmed
- ✅ Lebih stabil

### 4. **Better Logging**
```javascript
console.log('Batch 1/17: Processing 5 devices');
console.log('[CCTV Polling] WARNING: Polling already in progress, skipping');
console.log('[CCTV Polling] Last polling was 15s ago, skipping to prevent overload');
```

**Benefit:**
- ✅ Mudah diagnosa masalah
- ✅ Tau kapan polling di-skip
- ✅ Monitor progress per batch

## 📊 Timeline Baru

### Before (Masalah):
```
00:00 - Cron job mulai (10 concurrent)
00:05 - User klik "Check Status" → COLLISION!
00:10 - Many timeouts
00:15 - Devices marked offline
```

### After (Fixed):
```
00:00 - Cron job mulai (5 concurrent + delays)
00:05 - User klik "Check Status"
        → Polling lock active, SKIP ✅
00:45 - Cron job selesai
00:50 - User klik lagi → OK (>30s sejak terakhir)
```

## 🧪 Testing

### Test 1: Rapid Manual Poll
```bash
# Try multiple rapid polls
node trigger_manual_poll.mjs
node trigger_manual_poll.mjs  # Should skip
node trigger_manual_poll.mjs  # Should skip
```

**Expected:** 
- First poll: Success
- Second/third: Skipped (too frequent)

### Test 2: Monitor Batch Processing
```bash
pm2 logs Centaur-bacend --lines 100 | grep "Batch"
```

**Expected:**
```
Batch 1/17: Processing 5 devices
Batch 2/17: Processing 5 devices
...
```

### Test 3: Check Lock Status
```bash
pm2 logs Centaur-bacend | grep "WARNING"
```

**Expected (if collision):**
```
WARNING: Polling already in progress, skipping
WARNING: Last polling was 15s ago, skipping
```

## 📈 Monitoring

### Check Polling Performance
```bash
pm2 logs Centaur-bacend --lines 200 | grep "Completed"
```

**Healthy Output:**
```
[CCTV Polling] Completed: 83 success, 1 failed
[CCTV Polling] Completed: 84 success, 0 failed
```

**Problem Output:**
```
[CCTV Polling] Completed: 10 success, 74 failed  ← BAD!
```

### Check Network Load
Monitor device response time in logs:
```bash
pm2 logs Centaur-bacend | grep "Auto-discover complete"
```

Jika banyak timeout atau error, consider:
- Increase batch delay
- Reduce concurrent further (from 5 to 3)

## 🔄 Rekomendasi Lanjutan

### Option 1: Smart Polling
Poll device berdasarkan priority:
- Critical devices (Back Office, etc.) → Poll first
- Stable devices → Poll less frequently
- Problem devices → Skip temporarily

### Option 2: Distributed Polling
Split device list ke beberapa worker:
- Worker 1: Device 1-30
- Worker 2: Device 31-60
- Worker 3: Device 61-84

### Option 3: Async Queue
Gunakan queue system (Bull, Bee-Queue):
- Add all devices to queue
- Process with rate limiting
- Retry failed devices

## ✅ Checklist Fixes

- [x] Polling lock mechanism
- [x] Prevent concurrent polling
- [x] Minimum 30s interval
- [x] Reduced concurrent (10 → 5)
- [x] Add batch delays (1s)
- [x] Better error logging
- [x] Skip message when locked
- [x] Documentation

## 🎯 Expected Results

**Before Fix:**
- ❌ Random mass offline events
- ❌ Network congestion
- ❌ Race conditions

**After Fix:**
- ✅ Stable polling
- ✅ Consistent results  
- ✅ No mass offline events
- ✅ Better network utilization

---

**Last Updated:** 2026-07-03  
**Status:** ✅ Fixed & Deployed
