const sql = require('mssql');
require('dotenv').config();

async function testQuery() {
  const poolPromise = sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
  });

  try {
    const pool = await poolPromise;
    const deviceRes = await pool.request()
      .input('name', sql.NVarChar, 'DBWH SERVER')
      .input('ip', sql.NVarChar, '192.168.85.55')
      .query(`
        SELECT TOP 1 d.*, c.db_user, c.db_password, c.db_name 
        FROM Devices d
        LEFT JOIN DeviceDbConnections c ON d.id = c.device_id
        WHERE d.hostname = @name OR d.ip = @ip
      `);

    const device = deviceRes.recordset[0];
    let config;
    if (device && device.db_user && device.db_password) {
      config = {
        user: device.db_user,
        password: device.db_password,
        server: device.ip,
        database: device.db_name,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
      };
    } else {
      config = {
        user: process.env.CRM_DB_USER || 'sa',
        password: process.env.CRM_DB_PASS || 'default_pass',
        server: process.env.CRM_DB_SERVER || '192.168.85.55',
        database: process.env.CRM_DB_NAME || 'DBWH_8555',
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
      };
    }

    const crmPool = await sql.connect(config);
    const query = `
        WITH RankedTxn AS (
            SELECT
                MEMBER_ID,
                STORE_NAME,
                CUST_NAME,
                PHONE_NUMBER,
                BILL_VALUE,
                POINTS_REDEEM,
                TRANS_DATE,
                ROW_NUMBER() OVER (PARTITION BY MEMBER_ID ORDER BY TRANS_DATE DESC) as rn
            FROM RXL_LOYALID_TRANSACTIONS (NOLOCK)
            WHERE TRANS_DATE BETWEEN '2020-01-01' AND '2030-01-01' AND BILL_NO NOT LIKE '%mig%'
        ),
        AggregatedTxn AS (
            SELECT
                MEMBER_ID,
                MAX(CUST_NAME) AS cust_name,
                MAX(PHONE_NUMBER) AS phone_no,
                SUM(ISNULL(BILL_VALUE, 0)) AS total_expense,
                SUM(ISNULL(POINTS_REDEEM, 0)) AS redeem_points,
                CAST(MAX(TRANS_DATE) AS DATE) AS last_txn_date,
                MAX(CASE WHEN rn = 1 THEN STORE_NAME END) AS last_store_trx
            FROM RankedTxn
            GROUP BY MEMBER_ID
        )
        SELECT TOP 5
            a.MEMBER_ID AS card_no,
            a.phone_no,
            c.RLICM_NAME AS cust_name,
            c.CUST_EMAIL AS email,
            c.RLICM_CARD_NO AS card_id,
            c.CARD_TIER_NAME AS tier,
            c.GENDER AS gender,
            c.MARRIED_STATUS AS marital_status,
            e.JOIN_DATE AS registered_at,
            e.REGISTRATION_TYPE AS channel,
            c.RELIGION AS religion,
            c.NATIONALITY AS nationality,
            CASE WHEN c.MOBILE_APP_ACTIVATED = 1 THEN 'Yes' ELSE 'No' END AS activated_app,
            a.redeem_points,
            a.total_expense,
            a.last_txn_date,
            a.last_store_trx
        FROM AggregatedTxn a
        LEFT JOIN RXL_LOYALID_ENROLLMENT e WITH (NOLOCK) ON a.MEMBER_ID = e.MEMBER_ID
        LEFT JOIN RXL_LOYALID_CUSTOMER_MST c WITH (NOLOCK) ON a.MEMBER_ID = c.RLICM_CARD_NO
        ORDER BY a.last_txn_date DESC
    `;
    
    const result = await crmPool.request().query(query);
    console.log("Success! Returned rows: " + result.recordset.length);
    console.log(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error("SQL ERROR: " + err.message);
    process.exit(1);
  }
}

testQuery();
