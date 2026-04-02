const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const cfg = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

(async () => {
  try {
    await sql.connect(cfg);
    console.log('Connected to DB:', cfg.server);

    // Create PendingCommands table
    await sql.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PendingCommands' AND xtype='U')
      CREATE TABLE PendingCommands (
        id NVARCHAR(50) PRIMARY KEY,
        exec_id NVARCHAR(50) NOT NULL,
        device_id NVARCHAR(50) NOT NULL,
        hostname NVARCHAR(100),
        ip NVARCHAR(50),
        command NVARCHAR(MAX) NOT NULL,
        status NVARCHAR(20) DEFAULT 'pending',
        result_log NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        executed_at DATETIME NULL
      )
    `);
    console.log('✅ PendingCommands table created (or already exists).');

    // Update LATEST_AGENT_VERSION to 2.6.0
    await sql.query(`
      MERGE INTO SystemConfigs WITH (HOLDLOCK) AS target
      USING (SELECT 'LATEST_AGENT_VERSION' AS [key]) AS source
      ON target.[key] = source.[key]
      WHEN MATCHED THEN UPDATE SET [value] = '2.6.0', updated_at = GETDATE()
      WHEN NOT MATCHED THEN INSERT ([key],[value]) VALUES ('LATEST_AGENT_VERSION','2.6.0');
    `);
    console.log('✅ LATEST_AGENT_VERSION set to 2.6.0');

    console.log('\n🎉 Migration complete! Restart the server to apply all changes.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
})();
