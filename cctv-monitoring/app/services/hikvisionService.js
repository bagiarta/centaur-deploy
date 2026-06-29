import fetch from 'node-fetch';
import crypto from 'crypto';

// Hikvision ISAPI service
export const getDeviceInfo = async (device) => {
  try {
    const url = `${device.is_https ? 'https' : 'http'}://${device.ip_address}:${device.port}/ISAPI/System/status`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${device.username}:${device.password}`).toString('base64')}`,
        'Content-Type': 'application/xml'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Hikvision API error: ${response.status}`);
    }
    
    const xmlText = await response.text();
    const xml = parseXml(xmlText);
    
    // Extract device info from XML
    const deviceInfo = {
      isOnline: true,
      model: xml.SystemStatus?.Model?.[0] || device.model || 'Unknown',
      firmwareVersion: xml.SystemStatus?.FirmwareVersion?.[0] || device.firmwareVersion || 'Unknown',
      serialNumber: xml.SystemStatus?.SerialNumber?.[0] || device.serialNumber || 'Unknown',
      channelsCount: parseInt(xml.SystemStatus?.ChannelCount?.[0] || 0),
      storageCount: parseInt(xml.SystemStatus?.Storage?.[0]?.DiskCount?.[0] || 0),
      capabilities: {
        supportsISAPI: true,
        supportsEventNotification: true,
        supportsRemotePlayback: true
      }
    };
    
    return deviceInfo;
  } catch (err) {
    console.error(`[HikvisionService] getDeviceInfo error for ${device.ip_address}:`, err.message);
    return {
      isOnline: false,
      error: err.message
    };
  }
};

export const getChannelStatus = async (device) => {
  try {
    const url = `${device.is_https ? 'https' : 'http'}://${device.ip_address}:${device.port}/ISAPI/ContentMgmt/channelPreview`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${device.username}:${device.password}`).toString('base64')}`,
        'Content-Type': 'application/xml'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Hikvision API error: ${response.status}`);
    }
    
    const xmlText = await response.text();
    const xml = parseXml(xmlText);
    
    // Extract channel status from XML
    const channels = [];
    const channelList = xml.ChannelPreview?.Channel || [];
    
    for (const channel of channelList) {
      const channelNumber = parseInt(channel.ChannelID?.[0] || 0);
      
      channels.push({
        channelNumber,
        channelName: channel.Name?.[0] || `Channel ${channelNumber}`,
        channelType: channel.ChannelType?.[0] || 'ip',
        status: channel.StreamStatus?.[0]?.State?.[0] || 'offline',
        isRecording: channel.RecordStatus?.[0]?.State?.[0] === 'active',
        resolution: channel.VideoResolution?.[0] || 'Unknown',
        fps: parseFloat(channel.VideoFPS?.[0] || 0),
        bitrate: parseInt(channel.VideoBitrate?.[0] || 0)
      });
    }
    
    return channels;
  } catch (err) {
    console.error(`[HikvisionService] getChannelStatus error for ${device.ip_address}:`, err.message);
    return [];
  }
};

export const getStorageStatus = async (device) => {
  try {
    const url = `${device.is_https ? 'https' : 'http'}://${device.ip_address}:${device.port}/ISAPI/System/Storage`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${device.username}:${device.password}`).toString('base64')}`,
        'Content-Type': 'application/xml'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Hikvision API error: ${response.status}`);
    }
    
    const xmlText = await response.text();
    const xml = parseXml(xmlText);
    
    // Extract storage status from XML
    const disks = [];
    const storageList = xml.Storage?.Disk || [];
    
    for (const disk of storageList) {
      const diskNumber = parseInt(disk.DiskID?.[0] || 0);
      const totalSpace = parseInt(disk.TotalCapacity?.[0] || 0);
      const usedSpace = parseInt(disk.UsedCapacity?.[0] || 0);
      const usagePercentage = totalSpace > 0 ? Math.round((usedSpace / totalSpace) * 100) : 0;
      
      disks.push({
        diskNumber,
        diskName: disk.DiskName?.[0] || `Disk ${diskNumber}`,
        status: disk.Status?.[0] || 'normal',
        totalSpace,
        usedSpace,
        freeSpace: totalSpace - usedSpace,
        usagePercentage,
        diskType: disk.DiskType?.[0] || 'HDD'
      });
    }
    
    return disks;
  } catch (err) {
    console.error(`[HikvisionService] getStorageStatus error for ${device.ip_address}:`, err.message);
    return [];
  }
};

export const testDeviceConnection = async (device) => {
  try {
    const url = `${device.is_https ? 'https' : 'http'}://${device.ip_address}:${device.port}/ISAPI/System/status`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${device.username}:${device.password}`).toString('base64')}`,
        'Content-Type': 'application/xml'
      }
    });
    
    return response.ok;
  } catch (err) {
    return false;
  }
};

// XML parser (simple implementation)
export const parseXml = (xmlText) => {
  try {
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    return parser.parseStringPromise(xmlText);
  } catch (err) {
    console.error('[HikvisionService] parseXml error:', err.message);
    return {};
  }
};

// Hikvision ISAPI endpoints reference
export const hikvisionEndpoints = {
  systemStatus: '/ISAPI/System/status',
  systemCapabilities: '/ISAPI/System/capabilities',
  channelPreview: '/ISAPI/ContentMgmt/channelPreview',
  storage: '/ISAPI/System/Storage',
  recording: '/ISAPI/ContentMgmt/recording',
  eventNotifications: '/ISAPI/Event/notification/httpHosts',
  ptzControl: '/ISAPI/PTZCtrl/devices',
  remotePlayback: '/ISAPI/ContentMgmt/recordplan'
};

// Error codes
export const hikvisionErrorCodes = {
  401: 'Unauthorized - Invalid credentials',
  403: 'Forbidden - Insufficient permissions',
  404: 'Not Found - Endpoint not supported',
  500: 'Internal Server Error',
  501: 'Not Implemented - Feature not supported',
  503: 'Service Unavailable'
};

export const getHikvisionError = (statusCode) => {
  return hikvisionErrorCodes[statusCode] || `Unknown error: ${statusCode}`;
};