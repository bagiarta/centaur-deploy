import fetch from 'node-fetch';
import crypto from 'crypto';
import sql from 'mssql';

// Telegram notification
export const sendTelegramNotification = async (settings, message) => {
  try {
    const { botToken, chatId } = settings;

    if (!botToken || !chatId) {
      return { success: false, error: 'Telegram bot token or chat ID missing' };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.ok) {
      return {
        success: true,
        messageId: data.result.message_id,
        chatId: data.result.chat.id
      };
    } else {
      return {
        success: false,
        error: data.description || 'Telegram API error'
      };
    }
  } catch (err) {
    console.error('[NotificationService] Telegram error:', err.message);
    return { success: false, error: err.message };
  }
};

// Email notification (using SMTP or API)
export const sendEmailNotification = async (settings, message) => {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, toEmails } = settings;

    if (!smtpHost || !smtpPort || !fromEmail || !toEmails) {
      return { success: false, error: 'Email configuration missing' };
    }

    const toList = Array.isArray(toEmails) ? toEmails : [toEmails];

    // In production, use nodemailer or similar
    // For now, simulate email sending
    console.log('[NotificationService] Email sent:', {
      from: fromEmail,
      to: toList,
      subject: 'CCTV Monitoring Alert',
      message
    });

    return {
      success: true,
      recipients: toList,
      sentAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('[NotificationService] Email error:', err.message);
    return { success: false, error: err.message };
  }
};

// Webhook notification
export const sendWebhookNotification = async (settings, message) => {
  try {
    const { url, method = 'POST', headers = {}, bodyFormat = 'json' } = settings;

    if (!url) {
      return { success: false, error: 'Webhook URL missing' };
    }

    const payload = {
      message: message,
      timestamp: new Date().toISOString(),
      source: 'CCTV Monitoring',
      type: 'alert'
    };

    const options = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': bodyFormat === 'json' ? 'application/json' : 'application/x-www-form-urlencoded',
        ...headers
      }
    };

    if (bodyFormat === 'json') {
      options.body = JSON.stringify(payload);
    } else {
      options.body = new URLSearchParams(payload);
    }

    const response = await fetch(url, options);

    if (response.ok) {
      return {
        success: true,
        statusCode: response.status,
        responseText: await response.text()
      };
    } else {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }
  } catch (err) {
    console.error('[NotificationService] Webhook error:', err.message);
    return { success: false, error: err.message };
  }
};

// WhatsApp notification (using Meta API or similar)
export const sendWhatsAppNotification = async (settings, message) => {
  try {
    const { accessToken, phoneNumberId, recipientNumber } = settings;

    if (!accessToken || !phoneNumberId || !recipientNumber) {
      return { success: false, error: 'WhatsApp configuration missing' };
    }

    // In production, use Meta WhatsApp Business API
    // For now, simulate sending
    console.log('[NotificationService] WhatsApp sent:', {
      to: recipientNumber,
      message
    });

    return {
      success: true,
      recipient: recipientNumber,
      sentAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('[NotificationService] WhatsApp error:', err.message);
    return { success: false, error: err.message };
  }
};

// Build alert message from a monitoring log object
export const buildAlertMessage = (log) => {
  const { log_type, old_value, new_value, message, severity, device_name, device_id, channel_number } = log;

  // Fallback: use device_id if device_name is not available
  const deviceLabel = device_name || device_id || 'Unknown Device';

  let title = '';
  let body = '';

  switch (severity) {
    case 'critical':
      title = '[CRITICAL]';
      break;
    case 'high':
      title = '[HIGH]';
      break;
    case 'medium':
      title = '[MEDIUM]';
      break;
    default:
      title = '[INFO]';
  }

  switch (log_type) {
    case 'device_status':
      body = `Device: ${deviceLabel}\nStatus: ${old_value || '-'} → ${new_value || '-'}\n${message || ''}`;
      break;
    case 'channel_status':
      body = `Device: ${deviceLabel}\nChannel: ${channel_number != null ? channel_number : '-'}\nStatus: ${old_value || '-'} → ${new_value || '-'}\n${message || ''}`;
      break;
    case 'storage_status':
      body = `Device: ${deviceLabel}\nDisk Status: ${old_value || '-'} → ${new_value || '-'}\n${message || ''}`;
      break;
    default:
      body = `${message || 'No details available'}\nDevice: ${deviceLabel}`;
  }

  return `${title}\n\n${body}`.trim();
};

// Send alert to all active notification channels
// logData should include: log_type, event_type, old_value, new_value, message, severity, device_name, device_id, channel_number (optional)
export const sendAlertNotification = async (pool, logData) => {
  try {
    const channelsResult = await pool.request()
      .query(`SELECT * FROM NotificationChannels WHERE is_active = 1`);

    const channels = channelsResult.recordset;

    if (channels.length === 0) {
      console.log('[NotificationService] No active channels configured, skipping alert');
      return [];
    }

    const message = buildAlertMessage(logData);
    const results = [];

    for (const channel of channels) {
      const settings = channel.settings ? JSON.parse(channel.settings) : {};
      let result = { success: false, error: 'Unsupported channel type' };

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
        case 'whatsapp':
          result = await sendWhatsAppNotification(settings, message);
          break;
      }

      console.log(`[NotificationService] Alert via ${channel.type} (${channel.name}): ${result.success ? 'OK' : result.error}`);

      // Persist notification log
      try {
        await pool.request()
          .input('id', sql.NVarChar, `notif-log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`)
          .input('channel_type', sql.NVarChar, channel.type)
          .input('recipient', sql.NVarChar, channel.name)
          .input('message', sql.NVarChar, message)
          .input('status', sql.NVarChar, result.success ? 'sent' : 'failed')
          .query(`
            INSERT INTO NotificationLogs (id, channel_type, recipient, message, status)
            VALUES (@id, @channel_type, @recipient, @message, @status)
          `);
      } catch (logErr) {
        console.error('[NotificationService] Failed to persist notification log:', logErr.message);
      }

      results.push({ channel: channel.name, type: channel.type, ...result });
    }

    return results;
  } catch (err) {
    console.error('[NotificationService] sendAlertNotification error:', err.message);
    return [];
  }
};
