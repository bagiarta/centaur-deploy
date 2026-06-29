import { Server as SocketIOServer } from 'socket.io';

let io = null;

export const initSocket = (httpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket) => {
    console.log(`[CCTV] Client connected: ${socket.id}`);

    // Join user-specific room
    const userId = socket.handshake.query.userId;
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`[CCTV] User ${userId} joined room`);
    }

    // Join device room for real-time updates
    const deviceId = socket.handshake.query.deviceId;
    if (deviceId) {
      socket.join(`device:${deviceId}`);
      console.log(`[CCTV] Device ${deviceId} room joined`);
    }

    socket.on('disconnect', () => {
      console.log(`[CCTV] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

// Broadcast device status update
export const broadcastDeviceStatus = (device, status) => {
  try {
    const io = getIO();
    io.to(`device:${device.id}`).emit('device_status_update', {
      deviceId: device.id,
      deviceName: device.name,
      status: status,
      timestamp: new Date().toISOString()
    });
    
    io.to(`user:${device.id}`).emit('device_alert', {
      type: 'device_status',
      deviceId: device.id,
      message: `Device ${device.name} is now ${status}`,
      severity: status === 'online' ? 'info' : 'critical',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[CCTV] Error broadcasting device status:', err.message);
  }
};

// Broadcast channel status change
export const broadcastChannelStatus = (channel, deviceName) => {
  try {
    const io = getIO();
    io.to(`device:${channel.device_id}`).emit('channel_status_update', {
      channelId: channel.id,
      deviceName: deviceName,
      channelNumber: channel.channel_number,
      channelName: channel.channel_name,
      status: channel.status,
      isRecording: channel.is_recording,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[CCTV] Error broadcasting channel status:', err.message);
  }
};

// Broadcast storage alert
export const broadcastStorageAlert = (storage, deviceName) => {
  try {
    const io = getIO();
    const usage = storage.usage_percentage || 0;
    const severity = usage >= 95 ? 'critical' : usage >= 80 ? 'warning' : 'info';
    
    io.to(`device:${storage.device_id}`).emit('storage_alert', {
      storageId: storage.id,
      deviceName: deviceName,
      diskNumber: storage.disk_number,
      usagePercentage: usage,
      status: storage.status,
      severity: severity,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[CCTV] Error broadcasting storage alert:', err.message);
  }
};

// Broadcast monitoring log
export const broadcastMonitoringLog = (log, deviceName) => {
  try {
    const io = getIO();
    io.to(`device:${log.device_id}`).emit('monitoring_log', {
      logId: log.id,
      deviceName: deviceName,
      logType: log.log_type,
      eventType: log.event_type,
      message: log.message,
      severity: log.severity,
      timestamp: log.created_at || new Date().toISOString()
    });
    
    // Also broadcast to all connected clients
    io.emit('new_monitoring_log', {
      logId: log.id,
      deviceName: deviceName,
      logType: log.log_type,
      eventType: log.event_type,
      message: log.message,
      severity: log.severity,
      timestamp: log.created_at || new Date().toISOString()
    });
  } catch (err) {
    console.error('[CCTV] Error broadcasting monitoring log:', err.message);
  }
};