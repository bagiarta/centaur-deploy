const dotenv = require('dotenv');
dotenv.config();
const sql = require('mssql');

(async () => {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
  };

  const pool = await sql.connect(config);
  const query = `
    IF EXISTS (SELECT 1 FROM SystemConfigs WHERE [key] = 'LATEST_AGENT_VERSION')
      UPDATE SystemConfigs
      SET [value] = '2.7.5', updated_at = GETDATE()
      WHERE [key] = 'LATEST_AGENT_VERSION'
    ELSE
      INSERT INTO SystemConfigs ([key], [value], created_at, updated_at)
      VALUES ('LATEST_AGENT_VERSION', '2.7.5', GETDATE(), GETDATE())
  `;

  await pool.request().query(query);
  const res = await pool.request().query("SELECT [value] FROM SystemConfigs WHERE [key] = 'LATEST_AGENT_VERSION'");
  console.log(JSON.stringify(res.recordset[0], null, 2));
  await pool.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
