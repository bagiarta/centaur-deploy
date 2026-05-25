import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import webpush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

// Initialize web-push with VAPID keys from .env
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@centaurdeploy.local',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[PUSH] VAPID keys not found in .env. Web push will not work.');
}

// POST /api/push/subscribe
export const subscribe = async (req, res) => {
  const userId = req.headers['x-user-id'];
  const subscription = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  try {
    const pool = await poolPromise;
    const subId = uuidv4();
    
    // Upsert subscription based on endpoint to avoid duplicates
    // We check if the endpoint already exists. If yes, update it. If no, insert.
    const existing = await pool.request()
      .input('endpoint', sql.NVarChar, subscription.endpoint)
      .query('SELECT id FROM PushSubscriptions WHERE endpoint = @endpoint');
      
    if (existing.recordset.length > 0) {
      // Update existing
      await pool.request()
        .input('id', sql.NVarChar, existing.recordset[0].id)
        .input('uid', sql.NVarChar, userId)
        .input('p256dh', sql.NVarChar, subscription.keys.p256dh)
        .input('auth', sql.NVarChar, subscription.keys.auth)
        .query('UPDATE PushSubscriptions SET user_id = @uid, p256dh = @p256dh, auth = @auth, created_at = GETDATE() WHERE id = @id');
    } else {
      // Insert new
      await pool.request()
        .input('id', sql.NVarChar, subId)
        .input('uid', sql.NVarChar, userId)
        .input('endpoint', sql.NVarChar, subscription.endpoint)
        .input('p256dh', sql.NVarChar, subscription.keys.p256dh)
        .input('auth', sql.NVarChar, subscription.keys.auth)
        .query('INSERT INTO PushSubscriptions (id, user_id, endpoint, p256dh, auth) VALUES (@id, @uid, @endpoint, @p256dh, @auth)');
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[PUSH] Subscribe Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// Helper function to send push to a specific user
export const sendWebPush = async (userId, payload) => {
  try {
    const pool = await poolPromise;
    const subs = await pool.request()
      .input('uid', sql.NVarChar, userId)
      .query('SELECT endpoint, p256dh, auth FROM PushSubscriptions WHERE user_id = @uid');

    const notifications = subs.recordset.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      return webpush.sendNotification(pushSubscription, JSON.stringify(payload))
        .catch(err => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log('[PUSH] Subscription expired. Deleting endpoint:', sub.endpoint);
            // Delete expired subscription
            pool.request()
              .input('ep', sql.NVarChar, sub.endpoint)
              .query('DELETE FROM PushSubscriptions WHERE endpoint = @ep').catch(()=>{});
          } else {
            console.error('[PUSH] Send notification error:', err.message);
          }
        });
    });

    await Promise.all(notifications);
  } catch (err) {
    console.error('[PUSH] sendWebPush Error:', err.message);
  }
};
