const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

function generateAssetCode() {
  return `AST-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function runMigration() {
  let pool;
  try {
    console.log('Connecting to DB...');
    pool = await sql.connect(dbConfig);
    console.log('Connected.');

    // 1. Alter Tables if needed
    console.log("Altering tables to add asset_code if they don't exist...");
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Devices]') AND name = 'asset_code')
        BEGIN
            ALTER TABLE Devices ADD asset_code NVARCHAR(100) NULL;
        END
      `);
      console.log('Devices altered.');
    } catch(e) {
      console.log('Error altering Devices:', e.message);
    }
    
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CCTVDevices]') AND name = 'asset_code')
        BEGIN
            ALTER TABLE CCTVDevices ADD asset_code NVARCHAR(100) NULL;
        END
      `);
      console.log('CCTVDevices altered.');
    } catch(e) {
      console.log('Error altering CCTVDevices:', e.message);
    }

    // 2. Ensure Categories Exist
    console.log('Checking categories...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM AM_Categories WHERE code = 'CAT-NET')
      BEGIN
          INSERT INTO AM_Categories (code, name) VALUES ('CAT-NET', 'Network & IT Devices');
      END
      IF NOT EXISTS (SELECT * FROM AM_Categories WHERE code = 'CAT-CCTV')
      BEGIN
          INSERT INTO AM_Categories (code, name) VALUES ('CAT-CCTV', 'CCTV & Security');
      END
    `);

    // 3. Migrate Devices
    console.log('Migrating Devices...');
    const devicesRes = await pool.request().query(`SELECT id, hostname, ip, location FROM Devices WHERE asset_code IS NULL`);
    const devices = devicesRes.recordset;
    console.log(`Found ${devices.length} devices without asset_code.`);
    
    for (let i = 0; i < devices.length; i++) {
      const dev = devices[i];
      const assetCode = generateAssetCode();
      const assetName = dev.hostname || `Device ${dev.ip}`;
      const loc = dev.location || 'HQ'; // Assuming HQ if null
      
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        await tx.request()
          .input('asset_code', sql.NVarChar, assetCode)
          .input('asset_name', sql.NVarChar, assetName)
          .input('category_code', sql.NVarChar, 'CAT-NET')
          .input('status', sql.NVarChar, 'IN_USE')
          .input('condition', sql.NVarChar, 'GOOD')
          .input('location_code', sql.NVarChar, loc)
          .query(`
            INSERT INTO AM_Assets (asset_code, asset_name, category_code, status, condition, location_code)
            VALUES (@asset_code, @asset_name, @category_code, @status, @condition, @location_code)
          `);
          
        await tx.request()
          .input('asset_code', sql.NVarChar, assetCode)
          .input('id', sql.NVarChar, String(dev.id)) // Convert ID to string just in case it is uniqueidentifier
          .query(`UPDATE Devices SET asset_code = @asset_code WHERE id = @id`);
          
        await tx.commit();
        console.log(`Migrated device ${dev.id} -> ${assetCode}`);
      } catch (e) {
        await tx.rollback();
        console.error(`Failed to migrate device ${dev.id}:`, e.message);
      }
    }

    // 4. Migrate CCTVDevices
    console.log('Migrating CCTVDevices...');
    const cctvRes = await pool.request().query(`SELECT id, name, ip_address, location_id FROM CCTVDevices WHERE asset_code IS NULL`);
    const cctvs = cctvRes.recordset;
    console.log(`Found ${cctvs.length} CCTV devices without asset_code.`);
    
    for (let i = 0; i < cctvs.length; i++) {
      const cctv = cctvs[i];
      const assetCode = generateAssetCode();
      const assetName = cctv.name || `CCTV ${cctv.ip_address}`;
      let loc = 'HQ';
      if (cctv.location_id) loc = cctv.location_id.toString();
      
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        await tx.request()
          .input('asset_code', sql.NVarChar, assetCode)
          .input('asset_name', sql.NVarChar, assetName)
          .input('category_code', sql.NVarChar, 'CAT-CCTV')
          .input('status', sql.NVarChar, 'IN_USE')
          .input('condition', sql.NVarChar, 'GOOD')
          .input('location_code', sql.NVarChar, loc)
          .query(`
            INSERT INTO AM_Assets (asset_code, asset_name, category_code, status, condition, location_code)
            VALUES (@asset_code, @asset_name, @category_code, @status, @condition, @location_code)
          `);
          
        await tx.request()
          .input('asset_code', sql.NVarChar, assetCode)
          .input('id', sql.NVarChar, String(cctv.id))
          .query(`UPDATE CCTVDevices SET asset_code = @asset_code WHERE id = @id`);
          
        await tx.commit();
        console.log(`Migrated CCTV ${cctv.id} -> ${assetCode}`);
      } catch (e) {
        await tx.rollback();
        console.error(`Failed to migrate CCTV ${cctv.id}:`, e.message);
      }
    }

    console.log('Migration completed.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    if (pool) await pool.close();
    process.exit(0);
  }
}

runMigration();
