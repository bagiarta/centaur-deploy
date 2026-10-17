import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';

// ── H2H CRM INTEGRATION ──────────────────────────────
export const h2hConfig = {
  baseUrl: (process.env.H2H_BASE_URL || '').replace(/\/$/, ''),
  clientId: process.env.H2H_CLIENT_ID,
  clientSecret: process.env.H2H_CLIENT_SECRET,
  username: process.env.H2H_USERNAME,
  password: process.env.H2H_PASSWORD,
  clientCode: process.env.H2H_CLIENT_CODE,
  verifySsl: process.env.H2H_VERIFY_SSL === 'true'
};

const h2hDnsFallback = new dns.Resolver();
h2hDnsFallback.setServers(
  (process.env.H2H_DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map(server => server.trim())
    .filter(Boolean)
);

function h2hLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (lookupError, address, family) => {
    if (!lookupError) {
      callback(null, address, family);
      return;
    }

    h2hDnsFallback.resolve4(hostname)
      .then(addresses => {
        if (!addresses[0]) throw lookupError;
        callback(null, addresses[0], 4);
      })
      .catch(() => callback(lookupError));
  });
}

export function requestH2hJson(url, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      reject(new Error(`H2H URL tidak valid: ${error.message}`));
      return;
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http;
    const requestHeaders = { Accept: 'application/json', ...headers };
    const requestBody = body === undefined || body === null ? null : String(body);
    if (requestBody !== null && !requestHeaders['Content-Length']) {
      requestHeaders['Content-Length'] = Buffer.byteLength(requestBody);
    }

    const request = transport.request(parsedUrl, {
      method,
      headers: requestHeaders,
      lookup: h2hLookup,
      ...(parsedUrl.protocol === 'https:' ? { rejectUnauthorized: h2hConfig.verifySsl } : {})
    }, response => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => {
        let data = {};
        try {
          data = responseBody ? JSON.parse(responseBody) : {};
        } catch {
          data = { raw: responseBody };
        }
        resolve({ status: response.statusCode || 0, data });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`H2H request timeout setelah ${timeoutMs} ms`));
    });
    request.on('error', error => {
      const reason = error.code ? `${error.code}: ${error.message}` : error.message;
      reject(new Error(`H2H request gagal (${reason})`));
    });
    if (requestBody !== null) request.write(requestBody);
    request.end();
  });
}

let h2hTokenCache = {
  token: null,
  expiresAt: 0
};

export async function getH2hToken() {
  const now = Date.now();
  if (h2hTokenCache.token && h2hTokenCache.expiresAt > now) {
    return h2hTokenCache.token;
  }

  console.log('🔄 Fetching new H2H CRM token...');

  // Custom agent to handle verifySsl if needed
  const fetchOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username: h2hConfig.username,
      password: h2hConfig.password,
      client_id: h2hConfig.clientId,
      client_secret: h2hConfig.clientSecret
    })
  };

  const response = await requestH2hJson(`${h2hConfig.baseUrl}/oauth/token`, fetchOptions);

  if (response.status < 200 || response.status >= 300) {
    console.error('H2H Token Error:', response.status, response.data);
    throw new Error(`H2H Token Error: ${response.status}`);
  }

  const data = response.data;
  if (!data.access_token) {
    throw new Error('H2H Token Error: access_token not found in response');
  }

  h2hTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in - 300) * 1000 // 5 min buffer
  };

  return h2hTokenCache.token;
}

