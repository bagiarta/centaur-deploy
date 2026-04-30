require('dotenv').config();
const sql = require('mssql');
const https = require('https');

const mainConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true }
};

async function sendWhatsapp(pool, message) {
    try {
        console.log("Preparing to send WhatsApp notification...");
        const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
        const settings = settingsRes.recordset[0];
        if (!settings || !settings.whatsapp_token) {
            console.log("Error: WhatsApp token not configured in NotificationSettings.");
            return;
        }

        const targets = [settings.whatsapp_target, settings.whatsapp_group].filter(Boolean).join(',');
        if (!targets) {
             console.log("Error: No WhatsApp targets configured.");
             return;
        }

        const payload = JSON.stringify({ token: settings.whatsapp_token, target: targets, message, countryCode: '62' });
        const options = {
            hostname: 'api.fonnte.com', path: '/send', method: 'POST',
            headers: { 'Authorization': settings.whatsapp_token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };
        
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    console.log("WhatsApp API Response:", data);
                    resolve();
                });
            });
            req.on('error', (err) => {
                console.error('[WHATSAPP] Error:', err.message);
                reject(err);
            });
            req.write(payload);
            req.end();
        });
    } catch (err) {
        console.error('[WHATSAPP] Exception:', err.message);
    }
}

async function runTrial() {
    try {
        console.log("Connecting to Main DB...");
        const mainPool = await sql.connect(mainConfig);
        
        console.log("Fetching HOSERVER credentials...");
        const targetRes = await mainPool.request()
            .input('hostname', sql.NVarChar, 'HOSERVER')
            .query("SELECT id, ip FROM Devices WHERE hostname = @hostname");
            
        if (targetRes.recordset.length === 0) {
            console.log("Error: Device HOSERVER not found.");
            await mainPool.close();
            return;
        }
        
        const deviceId = targetRes.recordset[0].id;
        const deviceIp = targetRes.recordset[0].ip;
        
        const connRes = await mainPool.request()
            .input('did', sql.NVarChar, deviceId)
            .query("SELECT * FROM DeviceDbConnections WHERE device_id = @did");
            
        if (connRes.recordset.length === 0) {
            console.log("Error: DB Connection for HOSERVER not found.");
            await mainPool.close();
            return;
        }
        
        const hoConn = connRes.recordset[0];
        
        const hoConfig = {
            user: hoConn.db_user,
            password: hoConn.db_password,
            server: deviceIp,
            database: hoConn.db_name,
            options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true },
            // Removed port to let SQL Browser handle it, exactly like Remote SQL logic
            connectionTimeout: 10000,
            requestTimeout: 15000
        };
        
        console.log(`Connecting to HOSERVER (${deviceIp} / ${hoConn.db_name}) using ConnectionPool...`);
        const hoPool = new sql.ConnectionPool(hoConfig);
        await hoPool.connect();
        
        // Diagnostic: Check current DB and User
        const diagRes = await hoPool.request().query("SELECT DB_NAME() as db, SUSER_NAME() as user_name");
        console.log(`Connected to: ${diagRes.recordset[0].db} as ${diagRes.recordset[0].user_name}`);

        const dateColumn = 'last_timestamp';
        
        // Build Query with explicit dbo schema
        const query = `
            SELECT 
                COUNT(*) as total_items,
                SUM(CASE WHEN is_sync = '1' THEN 1 ELSE 0 END) as synced_count,
                SUM(CASE WHEN ISNULL(is_sync, '0') <> '1' THEN 1 ELSE 0 END) as pending_count,
                MAX(CASE WHEN ISNULL(is_sync, '0') <> '1' AND ISNULL(response_msg, '') <> '' THEN response_msg ELSE NULL END) as sample_error
            FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
            WHERE CONVERT(date, ${dateColumn}) = CONVERT(date, GETDATE())
        `;
        
        console.log("Executing Query on dbo.LOYAL_CRM_ITEM_MST...");
        const result = await hoPool.request().query(query);
        const data = result.recordset[0];
        await hoPool.close();
        
        console.log("\n--- RESULT DATA ---");
        console.log(data);
        
        console.log("\n--- GENERATING NOTIFICATION ---");
        let notif = `[TRIAL SCRIPT] 🔄 *LOYAL CRM ITEM SYNC STATUS*\n`;
        notif += `Total Data Hari Ini: ${data.total_items}\n`;
        notif += `✅ Berhasil Sync: ${data.synced_count || 0}\n`;
        notif += `⏳ Pending/Gagal: ${data.pending_count || 0}\n`;
        
        if (data.sample_error) {
            notif += `⚠️ Error Contoh: ${data.sample_error}\n`;
        }
        
        console.log(notif);
        console.log("\n(Sending notification to WhatsApp...)");
        
        await sendWhatsapp(mainPool, notif);
        
        await mainPool.close();
        console.log("Trial script finished successfully.");
        process.exit(0);
        
    } catch (e) {
        console.error("\n[ERROR DETAILS]");
        console.error("Message:", e.message);
        if (e.originalError) console.error("Original Error:", e.originalError.message);
        process.exit(1);
    }
}

runTrial();
