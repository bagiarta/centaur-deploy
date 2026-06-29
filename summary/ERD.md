# CCTV Monitoring System - ERD

## Entity-Relationship Diagram

### Entities

```
┌─────────────────┐
│     Users       │
├─────────────────┤
│ - id (PK)       │
│ - username      │
│ - password_hash │
│ - full_name     │
│ - email         │
│ - phone         │
│ - is_active     │
│ - created_at    │
└────────┬────────┘
         │
         │ M:N
         │
┌────────▼────────┐
│   UserRoles     │
├─────────────────┤
│ - id (PK)       │
│ - user_id (FK)  │
│ - role_id (FK)  │
│ - created_at    │
└─────────────────┘
         ▲
         │
         │
┌────────┴────────┐
│     Roles       │
├─────────────────┤
│ - id (PK)       │
│ - name          │
│ - display_name  │
│ - description   │
│ - permissions   │
│ - created_at    │
└─────────────────┘

┌─────────────────┐
│   Locations     │
├─────────────────┤
│ - id (PK)       │
│ - name          │
│ - address       │
│ - latitude      │
│ - longitude     │
│ - description   │
│ - is_active     │
│ - created_at    │
└────────┬────────┘
         │ 1:N
         │
┌────────▼────────┐
│    Devices      │
├─────────────────┤
│ - id (PK)       │
│ - name          │
│ - device_type   │
│ - vendor        │
│ - model         │
│ - firmware_ver  │
│ - serial_number │
│ - ip_address    │
│ - port          │
│ - username      │
│ - password_hash │
│ - is_https      │
│ - location_id   │
│ - status        │
│ - last_seen     │
│ - last_poll     │
│ - device_info   │
│ - conn_settings │
│ - is_active     │
│ - poll_interval │
│ - created_at    │
└────────┬────────┘
         │ 1:N         1:N
         │             │
         ▼             ▼
┌─────────────────┐ ┌─────────────────┐
│DeviceChannels   │ │DeviceStorage    │
├─────────────────┤ ├─────────────────┤
│ - id (PK)       │ │ - id (PK)       │
│ - device_id (FK)│ │ - device_id (FK)│
│ - channel_num   │ │ - disk_number   │
│ - channel_name  │ │ - disk_name     │
│ - channel_type  │ │ - status        │
│ - status        │ │ - total_space   │
│ - is_recording  │ │ - used_space    │
│ - resolution    │ │ - free_space    │
│ - fps           │ │ - usage_pct     │
│ - bitrate       │ │ - disk_type     │
│ - last_seen     │ │ - last_checked  │
│ - is_enabled    │ │ - disk_info     │
└─────────────────┘ └─────────────────┘
                      ▲
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
┌─────────────────┐     ┌─────────────────┐
│MonitoringLogs   │     │NotificationLogs │
├─────────────────┤     ├─────────────────┤
│ - id (PK)       │     │ - id (PK)       │
│ - device_id (FK)│     │ - notif_log_id  │
│ - log_type      │     │ - rule_id (FK)  │
│ - event_type    │     │ - channel_type  │
│ - object_type   │     │ - recipient     │
│ - object_id     │     │ - message       │
│ - old_value     │     │ - status        │
│ - new_value     │     │ - error_msg     │
│ - message       │     │ - sent_at       │
│ - metadata      │     │ - response_data │
│ - severity      │     │ - created_at    │
│ - is_resolved   │     └─────────────────┘
│ - resolved_at   │
│ - created_at    │
└─────────────────┘
         ▲
         │
┌────────┴────────┐
│NotificationChans│
├─────────────────┤
│ - id (PK)       │
│ - name          │
│ - type          │
│ - settings      │
│ - is_active     │
│ - created_at    │
└────────┬────────┘
         │ 1:N
         │
┌────────┴────────┐
│NotificationRules│
├─────────────────┤
│ - id (PK)       │
│ - name          │
│ - conditions    │
│ - channels      │
│ - template      │
│ - cooldown      │
│ - is_active     │
│ - created_at    │
└─────────────────┘

┌─────────────────┐
│SystemSettings   │
├─────────────────┤
│ - id (PK)       │
│ - key           │
│ - value         │
│ - type          │
│ - category      │
│ - description   │
│ - created_at    │
└─────────────────┘
```

## Relationships

### 1. Users ↔ Roles (Many-to-Many)
- Users can have multiple roles
- Roles can be assigned to multiple users
- Junction table: UserRoles

### 2. Locations ↔ Devices (One-to-Many)
- One location can have multiple devices
- Each device belongs to one location

### 3. Devices ↔ DeviceChannels (One-to-Many)
- One device has multiple channels
- Each channel belongs to one device

### 4. Devices ↔ DeviceStorage (One-to-Many)
- One device has multiple storage disks
- Each disk belongs to one device

### 5. Devices ↔ MonitoringLogs (One-to-Many)
- One device generates multiple monitoring logs
- Each log belongs to one device

### 6. NotificationChannels ↔ NotificationLogs (One-to-Many)
- One notification channel generates multiple logs
- Each log belongs to one channel

### 7. NotificationRules ↔ NotificationLogs (One-to-Many)
- One notification rule generates multiple logs
- Each log belongs to one rule

## Database Statistics

| Entity | Rows (Est) | Description |
|--------|-----------|-------------|
| Users | 10-100 | Admin and operators |
| Roles | 3-10 | Admin, Operator, Viewer |
| Locations | 5-100 | Office, branches, warehouses |
| Devices | 100-500 | DVR/NVR per location |
| DeviceChannels | 3000-5000 | Camera channels |
| DeviceStorage | 500-2000 | Hard disks |
| MonitoringLogs | 1000-10000/day | Status change logs |
| NotificationLogs | 100-1000/day | Alert notifications |
| NotificationChannels | 10-50 | Telegram, Email, Webhook |
| NotificationRules | 10-50 | Alert rules |

## Indexes

### Critical Indexes (for performance)

1. **Devices**: (ip_address, port) - Device lookup
2. **Devices**: (status, is_active) - Status filtering
3. **Devices**: (location_id, is_active) - Location filtering
4. **Devices**: (vendor, device_type) - Vendor filtering
5. **Devices**: (last_poll) - Polling schedule
6. **DeviceChannels**: (device_id, status) - Channel status
7. **DeviceStorage**: (device_id, status) - Storage health
8. **MonitoringLogs**: (device_id, created_at) - Log retrieval
9. **MonitoringLogs**: (severity, is_resolved) - Alert queries
10. **NotificationChannels**: (type, is_active) - Channel lookup

## Data Types

| Column | Type | Size | Notes |
|--------|------|------|-------|
| id | NVARCHAR | 50 | UUID-like identifier |
| name | NVARCHAR | 200 | Device/channel name |
| ip_address | NVARCHAR | 50 | IP address |
| port | INT | 4 | Port number |
| status | NVARCHAR | 50 | online/offline/error |
| description | NVARCHAR | MAX | Long text fields |
| JSON fields | NVARCHAR | MAX | device_info, settings |
| Decimal | DECIMAL | (5,2) | Usage percentage |
| BigInt | BIGINT | 8 | Storage space in bytes |

## Query Patterns

### High-Frequency Queries

1. **Device Status Check** (every 5 min per device)
   ```sql
   SELECT id, status, last_poll FROM Devices WHERE id = @id
   UPDATE Devices SET status = @newStatus, last_poll = GETDATE() WHERE id = @id
   ```

2. **Dashboard Summary**
   ```sql
   SELECT COUNT(*) as total FROM Devices WHERE status = 'online'
   SELECT status, COUNT(*) as count FROM Devices GROUP BY status
   ```

3. **Real-time Updates** (via Socket.IO)
   - Subscribe to device room
   - Receive status updates

4. **Alert Queries**
   ```sql
   SELECT * FROM MonitoringLogs WHERE severity IN ('critical', 'high') AND is_resolved = 0
   ```

### Low-Frequency Queries

1. **Device Management**
   - CRUD operations for devices
   - Status checking

2. **Notification Management**
   - Create/edit notification channels
   - Test notifications

3. **Reporting**
   - Daily/weekly reports
   - Export data to Excel/PDF