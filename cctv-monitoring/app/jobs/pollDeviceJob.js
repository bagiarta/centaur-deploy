import { poolPromise } from '../config/db.js';
import * as deviceService from '../app/services/deviceService.js';

export class PollDeviceJob {
  constructor(deviceId) {
    this.deviceId = deviceId;
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  async execute() {
    console.log(`[PollDeviceJob] Starting poll for device ${this.deviceId}`);
    
    try {
      const result = await deviceService.pollDeviceStatus(this.deviceId);
      
      if (result.success) {
        console.log(`[PollDeviceJob] Poll completed for device ${this.deviceId}`);
        return { success: true, ...result };
      } else {
        return this.handleFailure(result.error);
      }
    } catch (err) {
      return this.handleFailure(err.message);
    }
  }

  handleFailure(error) {
    this.retryCount++;
    
    console.log(`[PollDeviceJob] Poll failed for device ${this.deviceId} (attempt ${this.retryCount}/${this.maxRetries}): ${error}`);
    
    if (this.retryCount < this.maxRetries) {
      // Schedule retry
      return {
        success: false,
        shouldRetry: true,
        retryCount: this.retryCount,
        error: error,
        retryIn: 30000 * this.retryCount // Exponential backoff
      };
    }
    
    // Max retries reached, mark device as error
    console.log(`[PollDeviceJob] Max retries reached for device ${this.deviceId}, marking as error`);
    
    return {
      success: false,
      shouldRetry: false,
      error: error,
      maxRetriesReached: true
    };
  }

  async rollback() {
    console.log(`[PollDeviceJob] Rollback for device ${this.deviceId}`);
    
    try {
      const pool = await poolPromise;
      
      // Update device status to error
      await pool.request()
        .input('id', sql.NVarChar, this.deviceId)
        .query(`
          UPDATE Devices 
          SET status = 'error',
              updated_at = GETDATE()
          WHERE id = @id
        `);
      
      // Log error
      await pool.request()
        .input('id', sql.NVarChar, `log-${Date.now()}`)
        .input('deviceId', sql.NVarChar, this.deviceId)
        .input('logType', sql.NVarChar, 'poll_error')
        .input('eventType', sql.NVarChar, 'job_failed')
        .input('message', sql.NVarChar, 'Device polling job failed after max retries')
        .input('severity', sql.NVarChar, 'high')
        .query(`
          INSERT INTO MonitoringLogs (id, device_id, log_type, event_type, message, severity)
          VALUES (@id, @deviceId, @logType, @eventType, @message, @severity)
        `);
    } catch (err) {
      console.error(`[PollDeviceJob] Rollback error for device ${this.deviceId}:`, err.message);
    }
  }
}