require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

async function runTrial() {
  try {
    const pool = await sql.connect(dbConfig);
    console.log('✅ Connected to database.');

    // 1. Check if columns exist
    const checkCols = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Devices' 
      AND COLUMN_NAME IN ('location', 'latitude', 'longitude')
    `);

    const existingCols = checkCols.recordset.map(r => r.COLUMN_NAME);
    console.log('Existing columns:', existingCols);

    // 2. Add columns if they don't exist
    if (!existingCols.includes('location')) {
      console.log('Adding location column...');
      await pool.request().query('ALTER TABLE Devices ADD location NVARCHAR(200)');
    }
    if (!existingCols.includes('latitude')) {
      console.log('Adding latitude column...');
      await pool.request().query('ALTER TABLE Devices ADD latitude FLOAT');
    }
    if (!existingCols.includes('longitude')) {
      console.log('Adding longitude column...');
      await pool.request().query('ALTER TABLE Devices ADD longitude FLOAT');
    }

    // 3. Update one device for trial
    const devices = await pool.request().query('SELECT TOP 1 id, hostname FROM Devices');
    if (devices.recordset.length > 0) {
      const dev = devices.recordset[0];
      console.log(`Updating device ${dev.hostname} (${dev.id}) with trial data...`);
      await pool.request()
        .input('id', sql.NVarChar, dev.id)
        .input('loc', sql.NVarChar, 'Store Trial A')
        .input('lat', sql.Float, -8.65)
        .input('lon', sql.Float, 115.22)
        .query('UPDATE Devices SET location = @loc, latitude = @lat, longitude = @lon WHERE id = @id');
      console.log('✅ Trial update complete.');
    } else {
      console.log('⚠️ No devices found to update.');
    }

    await pool.close();
  } catch (err) {
    console.error('❌ Error during trial:', err);
  }
}

runTrial();
