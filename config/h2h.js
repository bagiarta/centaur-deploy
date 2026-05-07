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

  const response = await fetch(`${h2hConfig.baseUrl}/oauth/token`, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('H2H Token Error:', response.status, errorText);
    throw new Error(`H2H Token Error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('H2H Token Error: access_token not found in response');
  }

  h2hTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in - 300) * 1000 // 5 min buffer
  };

  return h2hTokenCache.token;
}

