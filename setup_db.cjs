const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const schemaSql = `
IF OBJECT_ID('DeviceSoftware', 'U') IS NULL
BEGIN
    CREATE TABLE DeviceSoftware (
        id INT IDENTITY(1,1) PRIMARY KEY,
        device_id NVARCHAR(250) NOT NULL,
        name NVARCHAR(500) NOT NULL,
        version NVARCHAR(100),
        publisher NVARCHAR(200),
        updated_at DATETIME
    );
    CREATE INDEX IX_DeviceSoftware_DeviceId ON DeviceSoftware(device_id);
    PRINT 'DeviceSoftware table created successfully';
END
ELSE
BEGIN
    PRINT 'DeviceSoftware table already exists';
END
`;

async function run() {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query(schemaSql);
        console.log("Success:", result);
        process.exit(0);
    } catch (err) {
        console.error("Setup Error:", err.message);
        process.exit(1);
    }
}

run();
