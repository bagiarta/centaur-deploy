const fs = require('fs');
const path = require('path');

const controllerPath = path.join(__dirname, 'controllers', 'cctvController.js');
let content = fs.readFileSync(controllerPath, 'utf8');

// 1. Refactor createCCTVDevice's channel saving into a helper
// Actually, it's easier to just insert `syncCCTVDevice` which directly does it, because writing a regex to extract 100 lines might be error-prone.
// Let's just insert syncCCTVDevice before discoverDevice

const syncFunc = `
export const syncCCTVDevice = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    
    // Get device
    const deviceResult = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT * FROM CCTVDevices WHERE id = @id AND is_active = 1');
      
    if (deviceResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    
    const device = deviceResult.recordset[0];
    const password = Buffer.from(device.password_hash, 'base64').toString('utf-8');
    
    // Auto-discover
    const result = await hikvisionService.autoDiscoverDevice(
      device.ip_address, device.port, device.username, password, device.is_https
    );
    
    if (!result.success && (!result.data || (!result.data.channels.length && !result.data.storage.length))) {
      return res.status(400).json({ success: false, error: 'Failed to discover device data' });
    }
    
    const discoveredData = result.data;
    const now = new Date();
    let channelsAdded = 0;
    let storageAdded = 0;
    
    // Save channels
    if (discoveredData && discoveredData.channels && discoveredData.channels.length > 0) {
      await pool.request()
        .input('device_id', sql.NVarChar, id)
        .query('UPDATE CCTVChannels SET is_enabled = 0 WHERE device_id = @device_id');
        
      for (const channel of discoveredData.channels) {
        const channelId = \`\${id}-ch\${channel.id}\`;
        const channelNumber = parseInt(channel.id) || 1;
        const channelName = \`Channel \${channelNumber}\`;
        const channelStatus = (channel.online === 'true' || channel.status === 'online') ? 'online' : 'offline';
        const isEnabled = true;
        const cameraIP = channel.ipAddress || null;
        const channelSettings = cameraIP ? JSON.stringify({ camera_ip: cameraIP, protocol: channel.proxyProtocol }) : null;
        
        try {
          await pool.request()
            .input('id', sql.NVarChar, channelId)
            .input('device_id', sql.NVarChar, id)
            .input('channel_number', sql.Int, channelNumber)
            .input('channel_name', sql.NVarChar, channelName)
            .input('status', sql.NVarChar, channelStatus)
            .input('is_enabled', sql.Bit, isEnabled)
            .input('channel_settings', sql.NVarChar, channelSettings)
            .input('created_at', sql.DateTime, now)
            .input('updated_at', sql.DateTime, now)
            .query(\`
              INSERT INTO CCTVChannels (id, device_id, channel_number, channel_name, status, is_enabled, channel_settings, created_at, updated_at)
              VALUES (@id, @device_id, @channel_number, @channel_name, @status, @is_enabled, @channel_settings, @created_at, @updated_at)
            \`);
          channelsAdded++;
        } catch (chErr) {
          if (chErr.message.includes('duplicate') || chErr.message.includes('unique') || chErr.message.includes('Violation of PRIMARY KEY constraint')) {
            await pool.request()
              .input('device_id', sql.NVarChar, id)
              .input('channel_number', sql.Int, channelNumber)
              .input('status', sql.NVarChar, channelStatus)
              .input('is_enabled', sql.Bit, isEnabled)
              .input('channel_settings', sql.NVarChar, channelSettings)
              .input('updated_at', sql.DateTime, now)
              .query(\`
                UPDATE CCTVChannels 
                SET status = @status, is_enabled = @is_enabled, 
                    channel_settings = @channel_settings, updated_at = @updated_at
                WHERE device_id = @device_id AND channel_number = @channel_number
              \`);
            channelsAdded++;
          } else {
            console.error('[CCTV] Channel save error:', chErr.message);
          }
        }
      }
    }
    
    // Save storage
    if (discoveredData && discoveredData.storage && discoveredData.storage.length > 0) {
      await pool.request()
        .input('device_id', sql.NVarChar, id)
        .query('DELETE FROM CCTVStorage WHERE device_id = @device_id');
        
      for (const storage of discoveredData.storage) {
        const storageId = \`\${id}-hdd\${storage.id}\`;
        const diskNumber = parseInt(storage.id) || 1;
        const capacity = Math.round(parseFloat(storage.capacity) / 1024 / 1024) || 0; // MB to GB or KB to GB? Usually KB in ISAPI, wait, in ISAPI it's MB. Let's just use what we have in create.
        
        let capGB = 0;
        if (storage.capacity) {
            // Hikvision returns MB in ContentMgmt/Storage
            capGB = Math.round(parseFloat(storage.capacity) / 1024);
        }
        
        const freeSpace = storage.freeSpace ? Math.round(parseFloat(storage.freeSpace) / 1024) : 0;
        const usedSpace = capGB > 0 ? (capGB - freeSpace) : 0;
        const usagePercentage = capGB > 0 ? Math.round((usedSpace / capGB) * 100) : 0;
        const diskStatus = (storage.status === 'ok' || storage.status === 'normal') ? 'normal' : 'error';
        const diskType = storage.type || storage.hddType || 'HDD';
        
        try {
          await pool.request()
            .input('id', sql.NVarChar, storageId)
            .input('device_id', sql.NVarChar, id)
            .input('disk_number', sql.Int, diskNumber)
            .input('capacity_gb', sql.Int, capGB)
            .input('used_gb', sql.Int, usedSpace)
            .input('usage_percentage', sql.Int, usagePercentage)
            .input('status', sql.NVarChar, diskStatus)
            .input('disk_type', sql.NVarChar, diskType)
            .input('created_at', sql.DateTime, now)
            .input('updated_at', sql.DateTime, now)
            .query(\`
              INSERT INTO CCTVStorage (id, device_id, disk_number, capacity_gb, used_gb, usage_percentage, status, disk_type, created_at, updated_at)
              VALUES (@id, @device_id, @disk_number, @capacity_gb, @used_gb, @usage_percentage, @status, @disk_type, @created_at, @updated_at)
            \`);
          storageAdded++;
        } catch (stErr) {
          console.error('[CCTV] Storage save error:', stErr.message);
        }
      }
    }
    
    res.json({
      success: true,
      message: \`Synced \${channelsAdded} channels and \${storageAdded} storage devices.\`,
      data: { channels: channelsAdded, storage: storageAdded }
    });
  } catch (err) {
    console.error('[CCTV] syncCCTVDevice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

`;

content = content.replace('export const discoverDevice = async (req, res) => {', syncFunc + 'export const discoverDevice = async (req, res) => {');

fs.writeFileSync(controllerPath, content);

const routesPath = path.join(__dirname, 'routes', 'cctvRoutes.js');
let routesContent = fs.readFileSync(routesPath, 'utf8');
if (!routesContent.includes('/devices/:id/sync')) {
  routesContent = routesContent.replace(
    "router.put('/devices/:id', cctvController.updateCCTVDevice);",
    "router.put('/devices/:id', cctvController.updateCCTVDevice);\nrouter.post('/devices/:id/sync', cctvController.syncCCTVDevice);"
  );
  fs.writeFileSync(routesPath, routesContent);
}

console.log('Backend sync modified');
