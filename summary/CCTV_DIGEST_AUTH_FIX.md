# 🔧 CCTV Monitoring - Digest Authentication Fix

## Issue: 401 Unauthorized

**Problem:**
- Test connection selalu failed dengan error 401 Unauthorized
- Endpoint bisa diakses via browser tapi tidak dari aplikasi
- Semua ISAPI endpoint return "Access Error: 401 -- Unauthorized"

**Root Cause:**
Hikvision menggunakan **Digest Authentication**, bukan Basic Authentication!

---

## ✅ Solution Applied

### Changed Files:

#### 1. `services/hikvisionService.js`
**Before:** Using `node-fetch` with Basic Auth
```javascript
import fetch from 'node-fetch';

function createAuthHeader(username, password) {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

const response = await fetch(url, {
  headers: {
    'Authorization': createAuthHeader(username, password)
  }
});
```

**After:** Using `digest-fetch` with Digest Auth
```javascript
import DigestFetch from 'digest-fetch';

const client = new DigestFetch(username, password, {
  algorithm: 'MD5'
});

const response = await client.fetch(url, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/xml',
    'Accept': '*/*'
  }
});
```

### Installed Package:
```bash
npm install --save digest-fetch
```

---

## 🧪 Test Results

### Device Info:
✅ **IP:** 172.16.13.68  
✅ **Device:** NVR 1  
✅ **Model:** DS-7616NI-Q2/16P  
✅ **Serial:** DS-7616NI-Q2/16P1620250807CCRRGD9595185WCVU  
✅ **Firmware:** V4.83.100  
✅ **MAC:** 08:cc:81:2e:1a:b8  

### Endpoints Tested:

| Endpoint | Status | Note |
|----------|--------|------|
| `/ISAPI/System/status` | ✅ 200 OK | CPU, Memory info |
| `/ISAPI/System/deviceInfo` | ✅ 200 OK | Device details |
| `/ISAPI/ContentMgmt/InputProxy/channels/status` | ✅ 200 OK | 16 channels |
| `/ISAPI/ContentMgmt/InputProxy/channels` | ✅ 200 OK | Channel details |
| `/ISAPI/Smart/storageDetection` | ❌ 403 Forbidden | Not supported |
| `/ISAPI/ContentMgmt/Storage` | ✅ 200 OK | 2 HDDs (3.8TB each) |

### Discovered Data:

**Channels:** 16 channels found
- Channel 1: Camera IP 10.10.30.2 (online)
- Channel 2-16: Various IPs
- All using HIKVISION protocol

**Storage:** 2 HDDs
- HDD 1: 3.8TB SATA, status: ok
- HDD 2: 3.8TB SATA, status: ok
- Both 100% full (freeSpace: 0)

---

## 🔄 How to Use

### 1. Start Server
```bash
node server.js
```

### 2. Test via UI
```
http://localhost:3001/cctv
→ Add Device
→ IP: 172.16.13.68
→ Port: 80
→ Username: admin
→ Password: Ppt@8899
→ Test Connection ✅ (sekarang berhasil!)
→ Auto-Discover ✅ (berhasil fetch 16 channels, 2 storage)
```

### 3. Test via API
```bash
# Test Connection
curl -X POST http://localhost:3001/api/cctv/test-connection \
  -H "Content-Type: application/json" \
  -d '{
    "ipAddress": "172.16.13.68",
    "port": 80,
    "username": "admin",
    "password": "Ppt@8899",
    "isHttps": false
  }'

# Auto-Discover
curl -X POST http://localhost:3001/api/cctv/discover \
  -H "Content-Type: application/json" \
  -d '{
    "ipAddress": "172.16.13.68",
    "port": 80,
    "username": "admin",
    "password": "Ppt@8899",
    "isHttps": false
  }'
```

---

## 📝 Technical Notes

### Why Digest Auth?

**Digest Authentication** is more secure than Basic Auth:
- Password never sent in plain text
- Uses MD5 hash challenge-response
- Prevents replay attacks
- Standard for Hikvision ISAPI

### Digest Auth Flow:
```
1. Client → Server: GET /ISAPI/System/status
2. Server → Client: 401 + WWW-Authenticate header with challenge
3. Client → Server: GET with Authorization header (hashed response)
4. Server → Client: 200 OK with data
```

The `digest-fetch` library handles this flow automatically.

### Storage Note:
- `/ISAPI/Smart/storageDetection` not supported on this NVR model
- Use `/ISAPI/ContentMgmt/Storage` instead (works perfectly)
- Service automatically falls back to working endpoint

---

## ✅ Status

**Fixed:** ✅  
**Tested:** ✅  
**Working:** ✅  

**Next Steps:**
1. ✅ Test connection - WORKING
2. ✅ Auto-discover - WORKING
3. ⏳ Add device via UI
4. ⏳ Verify database save
5. ⏳ Test polling (5 minutes)

---

**Date:** 25 Juni 2026  
**Issue:** Digest Auth required  
**Solution:** Replaced node-fetch with digest-fetch  
**Status:** RESOLVED ✅
