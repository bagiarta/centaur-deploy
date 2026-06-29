import sql from 'mssql';
import { poolPromise } from '../../config/db.js';
import { sendTelegramNotification, sendEmailNotification, sendWebhookNotification } from '../services/notificationService.js';

export const getAllNotificationChannels = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { isActive = true, type } = req.query;
    
    let query = `SELECT * FROM NotificationChannels WHERE is_active = @isActive`;
    const params = { isActive: Boolean(isActive) };
    
    if (type) {
      query += ` AND type = @type`;
      params.type = type;
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await pool.request()
      .input('isActive', sql.Bit, params.isActive)
      .query(query);
    
    res.json({
      success: true,
      data: result.recordset.map(channel => ({
        ...channel,
        settings: channel.settings ? JSON.parse(channel.settings) : null
      }))
    });
  } catch (err) {
    console.error('[NotificationController] getAllNotificationChannels error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createNotificationChannel = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { name, type, settings, isActive = true } = req.body;
    
    const id = `notif-${Date.now()}`;
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('type', sql.NVarChar, type)
      .input('settings', sql.NVarChar, JSON.stringify(settings))
      .input('is_active', sql.Bit, isActive)
      .query(`
        INSERT INTO NotificationChannels (id, name, type, settings, is_active)
        VALUES (@id, @name, @type, @settings, @is_active)
      `);
    
    res.status(201).json({
      success: true,
      message: 'Notification channel created successfully',
      data: { id, name, type }
    });
  } catch (err) {
    console.error('[NotificationController] createNotificationChannel error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateNotificationChannel = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    const { name, type, settings, isActive } = req.body;
    
    const updates = [];
    const params = [];
    
    if (name !== undefined) { updates.push('name = @name'); params.push({ name, type: sql.NVarChar }); }
    if (type !== undefined) { updates.push('type = @type'); params.push({ name: 'type', value: type, type: sql.NVarChar }); }
    if (settings !== undefined) { updates.push('settings = @settings'); params.push({ name: 'settings', value: JSON.stringify(settings), type: sql.NVarChar }); }
    if (isActive !== undefined) { updates.push('is_active = @is_active'); params.push({ name: 'is_active', value: isActive, type: sql.Bit }); }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query(`
        UPDATE NotificationChannels SET ${updates.join(', ')} WHERE id = @id
      `, ...params);
    
    res.json({
      success: true,
      message: 'Notification channel updated successfully'
    });
  } catch (err) {
    console.error('[NotificationController] updateNotificationChannel error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteNotificationChannel = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query('DELETE FROM NotificationChannels WHERE id = @id');
    
    res.json({
      success: true,
      message: 'Notification channel deleted successfully'
    });
  } catch (err) {
    console.error('[NotificationController] deleteNotificationChannel error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getAllNotificationRules = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { isActive = true } = req.query;
    
    const result = await pool.request()
      .input('isActive', sql.Bit, Boolean(isActive))
      .query(`
        SELECT nr.*, 
               (SELECT nc.name FROM NotificationChannels nc WHERE nr.channels LIKE '%' + nc.id + '%') as channel_names
        FROM NotificationRules nr
        WHERE nr.is_active = @isActive
        ORDER BY created_at DESC
      `);
    
    res.json({
      success: true,
      data: result.recordset.map(rule => ({
        ...rule,
        conditions: rule.conditions ? JSON.parse(rule.conditions) : null,
        channels: rule.channels ? JSON.parse(rule.channels) : null,
        created_at: rule.created_at ? rule.created_at.toISOString() : null
      }))
    });
  } catch (err) {
    console.error('[NotificationController] getAllNotificationRules error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const testNotification = async (req, res) => {
  try {
    const { channelType, settings, message } = req.body;
    
    let result = { success: false, error: 'Unknown channel type' };
    
    switch (channelType) {
      case 'telegram':
        result = await sendTelegramNotification(settings, message);
        break;
      case 'email':
        result = await sendEmailNotification(settings, message);
        break;
      case 'webhook':
        result = await sendWebhookNotification(settings, message);
        break;
      default:
        result = { success: false, error: `Unsupported channel type: ${channelType}` };
    }
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Test notification sent successfully',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to send test notification'
      });
    }
  } catch (err) {
    console.error('[NotificationController] testNotification error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const sendTestMessage = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { channelId, message } = req.body;
    
    const channelResult = await pool.request()
      .input('id', sql.NVarChar, channelId)
      .query('SELECT * FROM NotificationChannels WHERE id = @id');
    
    if (channelResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }
    
    const channel = channelResult.recordset[0];
    const settings = channel.settings ? JSON.parse(channel.settings) : {};
    
    let result = { success: false, error: 'Unknown channel type' };
    
    switch (channel.type) {
      case 'telegram':
        result = await sendTelegramNotification(settings, message);
        break;
      case 'email':
        result = await sendEmailNotification(settings, message);
        break;
      case 'webhook':
        result = await sendWebhookNotification(settings, message);
        break;
    }
    
    if (result.success) {
      // Log successful test
      await pool.request()
        .input('id', sql.NVarChar, `notif-log-${Date.now()}`)
        .input('channel_type', sql.NVarChar, channel.type)
        .input('recipient', sql.NVarChar, JSON.stringify(settings))
        .input('message', sql.NVarChar, message)
        .input('status', sql.NVarChar, 'sent')
        .query(`
          INSERT INTO NotificationLogs (id, channel_type, recipient, message, status)
          VALUES (@id, @channel_type, @recipient, @message, @status)
        `);
      
      res.json({
        success: true,
        message: 'Test message sent successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (err) {
    console.error('[NotificationController] sendTestMessage error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};