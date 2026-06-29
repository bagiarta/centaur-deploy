# 🧪 CCTV Monitoring - Testing Guide

## Quick Start Testing

### 1. Start Server
```bash
cd f:\PepiUpdater\centaur-deploy
node server.js
```

### 2. Open Browser
Navigate to: **http://localhost:3001/cctv**

---

## ✅ Test 1: Add Device Button Exists

**What to check:**
- [ ] Top right corner has "Add Device" button with Plus icon
- [ ] Button is green/primary colored
- [ ] Button is clickable

**Expected:** Button should be visible and clickable

---

## ✅ Test 2: Dialog Opens

**Steps:**
1. Click "Add Device" button

**Expected:**
- [ ] Modal dialog appears in center of screen
- [ ] Title: "Add New CCTV Device"
- [ ] Description: "Add a new DVR/NVR device to the monitoring system"
- [ ] Form with multiple fields is visible
- [ ] Two buttons at bottom: "Cancel" and "Add Device"

---

## ✅ Test 3: Form Fields Present

**Check all fields are visible:**
- [ ] Device Name (text input) *
- [ ] Device Type (dropdown) *
- [ ] Vendor (dropdown) *
- [ ] Model (text input)
- [ ] IP Address (text input) *
- [ ] Port (number input) *
- [ ] Username (text input) *
- [ ] Password (password input) *
- [ ] Location (dropdown)
- [ ] Poll Interval (number input) *
- [ ] Use HTTPS (checkbox)

*Required fields marked with asterisk

---

## ✅ Test 4: Default Values

**Check default values:**
- [ ] Device Type: "NVR"
- [ ] Vendor: "Hikvision"
- [ ] Port: 80
- [ ] Username: "admin"
- [ ] Poll Interval: 300
- [ ] HTTPS: unchecked

---

## ✅ Test 5: Dropdown Options

**Device Type dropdown should have:**
- [ ] NVR (Network Video Recorder)
- [ ] DVR (Digital Video Recorder)
- [ ] XVR (Extended Video Recorder)
- [ ] Hybrid DVR

**Vendor dropdown should have:**
- [ ] Hikvision
- [ ] Dahua
- [ ] Uniview
- [ ] Other

**Location dropdown should have:**
- [ ] Kantor Pusat
- [ ] Cabang Jakarta
- [ ] Cabang Surabaya

---

## ✅ Test 6: Form Validation

**Test required fields:**
1. Click "Add Device" button without filling form
2. **Expected:** Browser shows validation messages for required fields

**Required fields:**
- Device Name
- Device Type (pre-filled)
- Vendor (pre-filled)
- IP Address
- Port (pre-filled)
- Username (pre-filled)
- Password
- Poll Interval (pre-filled)

---

## ✅ Test 7: Add Real Device

**Fill in test data:**
```
Device Name: Test NVR Kantor
Device Type: NVR
Vendor: Hikvision
Model: DS-7616NI-K2
IP Address: 192.168.1.100
Port: 80
Username: admin
Password: admin123
Location: Kantor Pusat
Poll Interval: 300
HTTPS: No
```

**Steps:**
1. Fill all required fields
2. Click "Add Device" button

**Expected:**
- [ ] Button changes to "Adding..." with spinner
- [ ] After 1-2 seconds:
  - [ ] Success toast: "Device added successfully!"
  - [ ] Dialog closes automatically
  - [ ] New device appears in device list
  - [ ] Dashboard "Total Devices" count increases

---

## ✅ Test 8: Cancel Button

**Steps:**
1. Open Add Device dialog
2. Fill some fields
3. Click "Cancel" button

**Expected:**
- [ ] Dialog closes
- [ ] No device is added
- [ ] Form data is not saved

---

## ✅ Test 9: Multiple Devices

**Steps:**
1. Add device "NVR 1" with IP 192.168.1.100
2. Add device "NVR 2" with IP 192.168.1.101
3. Add device "DVR 1" with IP 192.168.1.102

**Expected:**
- [ ] All 3 devices appear in list
- [ ] Dashboard shows "Total Devices: 3"
- [ ] Each device card shows correct info

---

## ✅ Test 10: Add First Device (Empty State)

**If no devices exist:**
1. **Expected:** Empty state message appears:
   - Video icon
   - "No CCTV devices found"
   - "Add First Device" button

2. Click "Add First Device" button
3. **Expected:** Same dialog opens as "Add Device"

---

## ✅ Test 11: Verify in Database

**After adding device, check database:**
```bash
node check_db.cjs
```

**Expected output:**
```
CCTVDevices found: X devices
Device: Test NVR Kantor
  - IP: 192.168.1.100
  - Status: offline (will be online after first poll)
  - Vendor: Hikvision
```

---

## ✅ Test 12: Error Handling

**Test API error:**
1. Stop the server (Ctrl+C)
2. Try to add device
3. **Expected:**
   - Error toast: "Failed to add device"
   - Dialog stays open
   - User can retry

---

## 🎯 Success Criteria

All tests should pass with these results:
- ✅ Add Device button is functional
- ✅ Dialog opens and closes properly
- ✅ All form fields work correctly
- ✅ Validation prevents empty submission
- ✅ Device is created in database
- ✅ UI updates automatically after add
- ✅ Toast notifications appear
- ✅ Loading states work
- ✅ Cancel button works
- ✅ Form resets after successful add

---

## 📊 Visual Verification

### Button Location
```
┌─────────────────────────────────────────┐
│ CCTV Monitoring                         │
│ Real-time monitoring sistem CCTV        │
│                    [Refresh] [Add Device]│ ← HERE
└─────────────────────────────────────────┘
```

### Dialog Layout
```
┌───────────────────────────────────────────┐
│ Add New CCTV Device                    [X]│
│ Add a new DVR/NVR device to the...       │
├───────────────────────────────────────────┤
│ Device Name *      [                   ] │
│ Device Type *      [NVR ▼]  Vendor * [▼] │
│ Model              [                   ] │
│ IP Address *       [                   ] │
│ Port *             [80]                  │
│ Username *         [admin]               │
│ Password *         [••••]                │
│ Location           [Select... ▼]         │
│ Poll Interval *    [300]                 │
│ ☐ Use HTTPS                              │
├───────────────────────────────────────────┤
│                     [Cancel] [Add Device] │
└───────────────────────────────────────────┘
```

### Device Card (After Adding)
```
┌─────────────────────────────────────────┐
│ Test NVR Kantor              [Online]   │
│ Hikvision NVR                           │
│ 📍 Kantor Pusat                         │
│ ⚡ 192.168.1.100:80                     │
│ Last seen: 25/06/2026 14:30:00         │
│ [View Details]              [⚡]        │
└─────────────────────────────────────────┘
```

---

## 🐛 Common Issues & Solutions

### Issue: Button does nothing when clicked
**Solution:** Check browser console for errors, refresh page

### Issue: Form submits but device doesn't appear
**Solution:** Check network tab, verify server is running

### Issue: Location dropdown is empty
**Solution:** Run `node setup_cctv_db.cjs` to seed locations

### Issue: Port field shows error
**Solution:** Enter numeric value only (e.g., 80, 8000)

### Issue: Password not visible
**Solution:** This is normal - password field hides characters

---

## 📝 Test Results Template

Copy and fill in:

```
CCTV Add Device Testing - [Date]
Tested by: [Your Name]

✅ Test 1: Button visible and clickable
✅ Test 2: Dialog opens correctly
✅ Test 3: All form fields present
✅ Test 4: Default values correct
✅ Test 5: Dropdown options correct
✅ Test 6: Form validation works
✅ Test 7: Device added successfully
✅ Test 8: Cancel button works
✅ Test 9: Multiple devices work
✅ Test 10: Empty state works
✅ Test 11: Database entry created
✅ Test 12: Error handling works

Overall: PASS / FAIL
Notes: [Any observations]
```

---

**Ready to test!** 🚀
