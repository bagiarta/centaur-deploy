import fetch from 'node-fetch';
import crypto from 'crypto';

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

// Build alert message
export const buildAlertMessage = (log) => {
  const { log_type, event_type, old_value, new_value, message, severity, device_name, channel_number } = log;
  
  let title = '';
  let body = '';
  
  switch (severity) {
    case 'critical':
      title = '🔴 CRITICAL ALERT';
      break;
    case 'high':
      title = '⚠️ HIGH SEVERITY ALERT';
      break;
    case 'medium':
      title = '🟡 MEDIUM SEVERITY ALERT';
      break;
    default:
      title = 'ℹ️ INFORMATIONAL ALERT';
  }
  
  switch (log_type) {
    case 'device_status':
      body = `Device: ${device_name}\nStatus: ${old_value} → ${new_value}\n${message}`;
      break;
    case 'channel_status':
      body = `Device: ${device_name}\nChannel: ${channel_number}\nStatus: ${new_value}\n${message}`;
      break;
    case 'storage_status':
      body = `Device: ${device_name}\nStorage: ${message}\n${new_value}`;
      break;
    default:
      body = `${message}\nDevice: ${device_name}`;
  }
  
  return `${title}\n\n${body}`;
};