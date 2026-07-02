import DigestFetch from 'digest-fetch';
import https from 'https';

// ═══════════════════════════════════════════════════════════════
// HIKVISION ISAPI SERVICE
// Auto-discover device info, channels, and storage from Hikvision NVR/DVR
// Uses Digest Authentication (required by Hikvision)
// ═══════════════════════════════════════════════════════════════

/**
 * Make ISAPI request to Hikvision device using Digest Auth
 */
async function makeISAPIRequest(ip, port, username, password, endpoint, isHttps = false) {
  const protocol = isHttps ? 'https' : 'http';
  const url = `${protocol}://${ip}:${port}${endpoint}`;
  
  console.log(`[HIKVISION] Fetching: ${url}`);
  
  try {
    // Create Digest Auth client
    const client = new DigestFetch(username, password, {
      algorithm: 'MD5'
    });

    const response = await client.fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    return { success: true, data: text };
  } catch (error) {
    console.error(`[HIKVISION] Error fetching ${endpoint}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Parse XML response (improved parser)
 */
function parseXMLValue(xml, tagName) {
  // Try with different case variations
  const variations = [tagName, tagName.toLowerCase(), tagName.charAt(0).toUpperCase() + tagName.slice(1)];
  
  for (const tag of variations) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
    const match = xml.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Parse XML array (for channels)
 */
function parseXMLArray(xml, containerTag, itemTag) {
  const items = [];
  const containerRegex = new RegExp(`<${containerTag}>([\\s\\S]*?)<\/${containerTag}>`, 'gi');
  const containerMatches = xml.match(containerRegex);
  
  if (!containerMatches) return items;
  
  containerMatches.forEach(container => {
    const item = {};
    const itemRegex = new RegExp(`<${itemTag}>([\\s\\S]*?)<\/${itemTag}>`, 'gi');
    const itemMatches = container.match(itemRegex);
    
    if (itemMatches) {
      itemMatches.forEach(field => {
        const fieldName = field.match(/<([^>\/\s]+)/)[1];
        const fieldValue = field.match(/>([^<]*)</)?.[1] || '';
        item[fieldName] = fieldValue.trim();
      });
    }
    
    if (Object.keys(item).length > 0) {
      items.push(item);
    }
  });
  
  return items;
}

/**
 * Get Device System Status
 * Endpoint: /ISAPI/System/status
 */
export async function getDeviceStatus(ip, port, username, password, isHttps) {
  const result = await makeISAPIRequest(ip, port, username, password, '/ISAPI/System/status', isHttps);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const xml = result.data;
  console.log('[HIKVISION] Device Status XML (first 500 chars):', xml.substring(0, 500));
  
  // Parse device info - try multiple tag variations
  const deviceInfo = {
    deviceName: parseXMLValue(xml, 'deviceName'),
    deviceModel: parseXMLValue(xml, 'model'),
    serialNumber: parseXMLValue(xml, 'serialNumber'),
    firmwareVersion: parseXMLValue(xml, 'firmwareVersion'),
    deviceType: parseXMLValue(xml, 'deviceType'),
    macAddress: parseXMLValue(xml, 'macAddress'),
    upTime: parseXMLValue(xml, 'upTime') || parseXMLValue(xml, 'deviceUpTime'),
    currentTime: parseXMLValue(xml, 'currentTime') || parseXMLValue(xml, 'currentDeviceTime')
  };

  console.log('[HIKVISION] Device Status:', deviceInfo);
  
  return { success: true, data: deviceInfo };
}

/**
 * Get Device Info (alternative endpoint)
 * Endpoint: /ISAPI/System/deviceInfo
 */
export async function getDeviceInfo(ip, port, username, password, isHttps) {
  const result = await makeISAPIRequest(ip, port, username, password, '/ISAPI/System/deviceInfo', isHttps);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const xml = result.data;
  console.log('[HIKVISION] Device Info XML (first 500 chars):', xml.substring(0, 500));
  
  const deviceInfo = {
    deviceName: parseXMLValue(xml, 'deviceName'),
    deviceModel: parseXMLValue(xml, 'model'),
    serialNumber: parseXMLValue(xml, 'serialNumber'),
    firmwareVersion: parseXMLValue(xml, 'firmwareVersion'),
    deviceType: parseXMLValue(xml, 'deviceType'),
    macAddress: parseXMLValue(xml, 'macAddress'),
    manufacturer: parseXMLValue(xml, 'manufacturer') || 'Hikvision'
  };

  console.log('[HIKVISION] Device Info:', deviceInfo);
  
  return {
    success: true,
    data: deviceInfo,
    raw: xml
  };
}

/**
 * Get System Time
 * Endpoint: /ISAPI/System/time
 */
export async function getSystemTime(ip, port, username, password, isHttps) {
  const result = await makeISAPIRequest(ip, port, username, password, '/ISAPI/System/time', isHttps);
  
  if (!result.success) {
    return result;
  }
  
  const xml = result.data;
  
  const timeInfo = {
    localTime: parseXMLValue(xml, 'localTime'),
    timeZone: parseXMLValue(xml, 'timeZone')
  };

  console.log('[HIKVISION] Device Time:', timeInfo);
  
  return {
    success: true,
    data: timeInfo,
    raw: xml
  };
}

/**
 * Get Channel Status
 * Endpoint: /ISAPI/ContentMgmt/InputProxy/channels/status
 */
export async function getChannelStatus(ip, port, username, password, isHttps) {
  const result = await makeISAPIRequest(ip, port, username, password, '/ISAPI/ContentMgmt/InputProxy/channels/status', isHttps);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const xml = result.data;
  console.log('[HIKVISION] Channel Status XML (first 1000 chars):', xml.substring(0, 1000));
  
  // Parse channels - manual extraction
  const channels = [];
  const channelRegex = /<InputProxyChannelStatus[^>]*>([\s\S]*?)<\/InputProxyChannelStatus>/gi;
  const channelMatches = xml.match(channelRegex);
  
  console.log(`[HIKVISION] Found ${channelMatches ? channelMatches.length : 0} channel matches`);
  
  if (channelMatches) {
    channelMatches.forEach((channelXml, index) => {
      const channelData = {
        id: parseXMLValue(channelXml, 'id'),
        online: parseXMLValue(channelXml, 'online'),
        status: parseXMLValue(channelXml, 'online') === 'true' ? 'online' : 'offline',
        ipAddress: parseXMLValue(channelXml, 'ipAddress'),
        proxyProtocol: parseXMLValue(channelXml, 'proxyProtocol')
      };
      
      if (channelData.id) {
        channels.push(channelData);
      }
    });
  }

  console.log(`[HIKVISION] Parsed ${channels.length} channels`);
  
  return { success: true, data: channels };
}

/**
 * Get DVR Analog Channel Info
 * Endpoint: /ISAPI/System/Video/inputs/channels
 * Used for DVR devices (analog cameras) instead of NVR IP cameras
 */
export async function getDVRChannels(ip, port, username, password, isHttps) {
  const result = await makeISAPIRequest(ip, port, username, password, '/ISAPI/System/Video/inputs/channels', isHttps);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const xml = result.data;
  console.log('[HIKVISION] DVR Channel XML (first 1000 chars):', xml.substring(0, 1000));

  const channels = [];
  const channelRegex = /<VideoInputChannel[^>]*>([\s\S]*?)<\/VideoInputChannel>/gi;
  const channelMatches = xml.match(channelRegex);

  console.log(`[HIKVISION] Found ${channelMatches ? channelMatches.length : 0} DVR channel matches`);

  if (channelMatches) {
    channelMatches.forEach((channelXml, index) => {
      const id = parseXMLValue(channelXml, 'id') || String(index + 1);
      const name = parseXMLValue(channelXml, 'name') || `Channel ${id}`;
      const resolutionWidth = parseXMLValue(channelXml, 'resolutionWidth');
      const resolutionHeight = parseXMLValue(channelXml, 'resolutionHeight');
      channels.push({
        id,
        channel_number: parseInt(id),
        channel_name: name,
        status: 'online',
        is_enabled: true,
        resolution: resolutionWidth && resolutionHeight ? `${resolutionWidth}x${resolutionHeight}` : null
      });
    });
  }

  console.log(`[HIKVISION] Parsed ${channels.length} DVR channels`);
  return { success: channels.length > 0, data: channels };
}


/**
 * Get Channel Details
 * Endpoint: /ISAPI/ContentMgmt/InputProxy/channels
 */
export async function getChannelDetails(ip, port, username, password, isHttps) {
  const result = await makeISAPIRequest(ip, port, username, password, '/ISAPI/ContentMgmt/InputProxy/channels', isHttps);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const xml = result.data;
  
  // Parse channel list
  const channelRegex = /<InputProxyChannel>([\s\S]*?)<\/InputProxyChannel>/gi;
  const channelMatches = xml.match(channelRegex);
  
  const channels = [];
  if (channelMatches) {
    channelMatches.forEach(channelXml => {
      channels.push({
        id: parseXMLValue(channelXml, 'id'),
        name: parseXMLValue(channelXml, 'name'),
        enabled: parseXMLValue(channelXml, 'enabled'),
        ipAddress: parseXMLValue(channelXml, 'ipAddress'),
        protocol: parseXMLValue(channelXml, 'proxyProtocol'),
        port: parseXMLValue(channelXml, 'managePortNo')
      });
    });
  }

  console.log(`[HIKVISION] Channel details: ${channels.length} channels`);
  
  return { success: true, data: channels };
}

/**
 * Get Storage Detection
 * Endpoint: /ISAPI/Smart/storageDetection
 */
export async function getStorageDetection(ip, port, username, password, isHttps) {
  const result = await makeISAPIRequest(ip, port, username, password, '/ISAPI/Smart/storageDetection', isHttps);
  
  if (!result.success) {
    // Try alternative endpoint
    const altResult = await makeISAPIRequest(ip, port, username, password, '/ISAPI/ContentMgmt/Storage', isHttps);
    if (!altResult.success) {
      return { success: false, error: result.error };
    }
    return parseStorageInfo(altResult.data, 'ContentMgmt');
  }

  return parseStorageInfo(result.data, 'Smart');
}

/**
 * Parse storage info from XML
 */
function parseStorageInfo(xml, source) {
  const storageList = [];
  
  console.log(`[HIKVISION] Parsing storage XML (source: ${source}), first 1000 chars:`, xml.substring(0, 1000));
  
  // Parse from /ISAPI/ContentMgmt/Storage
  const hddRegex = /<hdd[^>]*>([\s\S]*?)<\/hdd>/gi;
  const hddMatches = xml.match(hddRegex);
  
  console.log(`[HIKVISION] Found ${hddMatches ? hddMatches.length : 0} HDD matches`);
  
  if (hddMatches) {
    hddMatches.forEach((hddXml, index) => {
      const capacity = parseInt(parseXMLValue(hddXml, 'capacity')) || 0;
      const freeSpace = parseInt(parseXMLValue(hddXml, 'freeSpace')) || 0;
      const usedSpace = capacity - freeSpace;
      const usagePercentage = capacity > 0 ? Math.round((usedSpace / capacity) * 100) : 0;
      
      const storageData = {
        id: parseInt(parseXMLValue(hddXml, 'id')) || index + 1,
        name: parseXMLValue(hddXml, 'hddName') || `HDD ${index + 1}`,
        type: parseXMLValue(hddXml, 'hddType') || 'HDD',
        status: parseXMLValue(hddXml, 'status') || 'ok',
        capacity: capacity,
        freeSpace: freeSpace,
        usedSpace: usedSpace,
        usagePercentage: usagePercentage,
        property: parseXMLValue(hddXml, 'property')
      };
      
      storageList.push(storageData);
    });
  }

  console.log(`[HIKVISION] Parsed ${storageList.length} storage devices`);
  
  return { success: true, data: storageList };
}

/**
 * Get HDD Info (alternative)
 * Endpoint: /ISAPI/ContentMgmt/Storage
 */
export async function getHDDInfo(ip, port, username, password, isHttps) {
  const result = await makeISAPIRequest(ip, port, username, password, '/ISAPI/ContentMgmt/Storage', isHttps);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return parseStorageInfo(result.data, 'ContentMgmt');
}

/**
 * Test connection to Hikvision device
 */
export async function testConnection(ip, port, username, password, isHttps) {
  console.log(`[HIKVISION] Testing connection to ${ip}:${port}`);
  
  // Try to get device info
  const deviceResult = await getDeviceStatus(ip, port, username, password, isHttps);
  
  if (!deviceResult.success) {
    // Try alternative endpoint
    const altResult = await getDeviceInfo(ip, port, username, password, isHttps);
    if (!altResult.success) {
      return { 
        success: false, 
        error: 'Cannot connect to device. Check IP, credentials, and network connectivity.' 
      };
    }
    return { success: true, message: 'Connection successful!', data: altResult.data };
  }

  return { success: true, message: 'Connection successful!', data: deviceResult.data };
}

/**
 * Auto-discover all device information
 * This is the main function to fetch all data from Hikvision device
 */
export async function autoDiscoverDevice(ip, port, username, password, isHttps) {
  console.log(`[HIKVISION] Auto-discovering device: ${ip}:${port}`);
  
  const results = {
    device: null,
    channels: [],
    storage: [],
    errors: []
  };

  // 1. Get device info - try deviceInfo first (more complete)
  let deviceResult = await getDeviceInfo(ip, port, username, password, isHttps);
  if (!deviceResult.success) {
    // Fallback to status endpoint
    deviceResult = await getDeviceStatus(ip, port, username, password, isHttps);
  }
  
  // Also get the system time
  let timeResult = await getSystemTime(ip, port, username, password, isHttps);
  
  if (deviceResult.success) {
    results.device = deviceResult.data;
    if (timeResult.success) {
      results.device.localTime = timeResult.data.localTime;
      results.device.timeZone = timeResult.data.timeZone;
    }
  } else {
    results.errors.push(`Device info: ${deviceResult.error}`);
  }

  // 2. Get channel info - use DVR endpoint for DVR, NVR endpoint for NVR
  const deviceType = (results.device?.deviceType || '').toUpperCase();
  const deviceName = (results.device?.deviceName || '').toLowerCase();
  const isDVR = deviceType.includes('DVR') || deviceName.includes('embedded net dvr');

  if (isDVR) {
    console.log('[HIKVISION] Device is DVR - using analog channel endpoint /ISAPI/System/Video/inputs/channels');
    const dvrChannelResult = await getDVRChannels(ip, port, username, password, isHttps);
    if (dvrChannelResult.success) {
      results.channels = dvrChannelResult.data;
    } else {
      results.errors.push(`DVR channel info: ${dvrChannelResult.error}`);
    }
  } else {
    // NVR (or unknown): use InputProxy endpoint for IP cameras
    console.log('[HIKVISION] Device is NVR (or unknown) - using InputProxy channel endpoint');
    const channelResult = await getChannelStatus(ip, port, username, password, isHttps);
    if (channelResult.success) {
      results.channels = channelResult.data;
    } else {
      results.errors.push(`Channel status: ${channelResult.error}`);
      // Try alternative NVR endpoint
      const channelDetailsResult = await getChannelDetails(ip, port, username, password, isHttps);
      if (channelDetailsResult.success) {
        results.channels = channelDetailsResult.data;
      }
    }
  }

  // 3. Get storage info
  const storageResult = await getStorageDetection(ip, port, username, password, isHttps);
  if (storageResult.success) {
    results.storage = storageResult.data;
  } else {
    results.errors.push(`Storage info: ${storageResult.error}`);
    
    // Try alternative endpoint
    const hddResult = await getHDDInfo(ip, port, username, password, isHttps);
    if (hddResult.success) {
      results.storage = hddResult.data;
    }
  }

  const success = results.device !== null || results.channels.length > 0 || results.storage.length > 0;
  
  console.log(`[HIKVISION] Auto-discover complete:`, {
    device: results.device ? 'OK' : 'FAIL',
    channels: results.channels.length,
    storage: results.storage.length,
    errors: results.errors.length
  });

  return {
    success,
    data: results
  };
}

export default {
  testConnection,
  autoDiscoverDevice,
  getDeviceStatus,
  getDeviceInfo,
  getSystemTime,
  getChannelStatus,
  getChannelDetails,
  getDVRChannels,
  getStorageDetection,
  getHDDInfo
};

