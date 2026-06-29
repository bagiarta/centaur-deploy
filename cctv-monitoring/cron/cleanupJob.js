import cron from 'node-cron';
import { poolPromise } from '../config/db.js';

// Cleanup job - runs daily to clean old logs
export const startCleanupJob = () => {
  // Run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log(`[CCTV] Starting cleanup job at ${new Date().toISOString()}`);
    
    try {
      const pool = await poolPromise;
      
      // Get retention settings
      const settingsResult = await pool.request()
        .query('SELECT * FROM SystemSettings WHERE [key] IN (\'log_retention_days\', \'alert_retention_days\')');
      
      const settings = {};
      settingsResult.recordset.forEach(s => {
        settings[s.key] = parseInt(s.value) || 30;
      });
      
      const logRetentionDays = settings.log_retention_days || 30;
      const alertRetentionDays = settings.alert_retention_days || 90;
      
      // Delete old monitoring logs
      const deletedLogs = await pool.request()
        .query(`
          DELETE FROM MonitoringLogs 
          WHERE created_at < DATEADD(DAY, -${logRetentionDays}, GETDATE())
          SELECT @@ROWCOUNT as deleted_count
        `);
      
      // Delete old notification logs
      const deletedNotifications = await pool.request()
        .query(`
          DELETE FROM NotificationLogs 
          WHERE created_at < DATEADD(DAY, -${alertRetentionDays}, GETDATE())
          SELECT @@ROWCOUNT as deleted_count
        `);
      
      console.log(`[CCTV] Cleanup completed: ${deletedLogs.recordset[0].deleted_count} logs, ${deletedNotifications.recordset[0].deleted_count} notifications deleted`);
    } catch (err) {
      console.error('[CCTV] Cleanup job error:', err.message);
    }
  });
  
  console.log('[CCTV] Cleanup job scheduled daily at 2:00 AM');
};

// Archive job - runs weekly to archive old data
export const startArchiveJob = () => {
  // Run weekly on Sunday at 3:00 AM
  cron.schedule('0 3 * * 0', async () => {
    console.log(`[CCTV] Starting archive job at ${new Date().toISOString()}`);
    
    try {
      const pool = await poolPromise;
      
      // Archive old monitoring logs
      const archivedLogs = await pool.request()
        .query(`
          INSERT INTO MonitoringLogs_Archive (id, device_id, log_type, event_type, old_value, new_value, message, severity, created_at)
          SELECT id, device_id, log_type, event_type, old_value, new_value, message, severity, created_at
          FROM MonitoringLogs 
          WHERE created_at < DATEADD(WEEK, -4, GETDATE())
          
          DELETE FROM MonitoringLogs 
          WHERE created_at < DATEADD(WEEK, -4, GETDATE())
          
          SELECT @@ROWCOUNT as archived_count
        `);
      
      console.log(`[CCTV] Archive completed: ${archivedLogs.recordset[0].archived_count} logs archived`);
    } catch (err) {
      console.error('[CCTV] Archive job error:', err.message);
    }
  });
  
  console.log('[CCTV] Archive job scheduled weekly on Sunday at 3:00 AM');
};