import cron from 'node-cron';
import { poolPromise } from '../config/db.js';
import * as deviceService from '../app/services/deviceService.js';
import { getIO } from '../config/socket.js';

// Polling job - runs every 5 minutes by default
export const startPollingJob = () => {
  const pollInterval = parseInt(process.env.POLL_INTERVAL || 300); // Default 300 seconds (5 minutes)
  
  console.log(`[CCTV] Starting device polling job (interval: ${pollInterval}s)`);
  
  // Schedule polling job
  cron.schedule(`*/${pollInterval} * * * *`, async () => {
    console.log(`[CCTV] Starting scheduled polling at ${new Date().toISOString()}`);
    
    try {
      const result = await deviceService.pollAllDevices();
      
      if (result.success) {
        console.log(`[CCTV] Polling job completed: ${result.total} devices checked`);
        
        // Broadcast polling status to admin
        const io = getIO();
        io.emit('polling_status', {
          timestamp: new Date().toISOString(),
          total: result.total,
          success: result.success,
          failed: result.failed
        });
      }
    } catch (err) {
      console.error('[CCTV] Polling job error:', err.message);
    }
  });
  
  console.log(`[CCTV] Polling job scheduled every ${pollInterval} seconds`);
};

// Manual trigger for testing
export const triggerManualPoll = async () => {
  console.log('[CCTV] Manual polling triggered');
  
  try {
    const result = await deviceService.pollAllDevices();
    
    return {
      success: true,
      data: result
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
};

// Start polling immediately on server startup (optional)
export const startInitialPoll = async () => {
  console.log('[CCTV] Starting initial polling on server startup');
  
  try {
    const result = await deviceService.pollAllDevices();
    return result;
  } catch (err) {
    console.error('[CCTV] Initial polling error:', err.message);
    return null;
  }
};