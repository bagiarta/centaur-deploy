import sql from 'mssql';
import { dbConfig } from './config/db.js';

async function migrate() {
  try {
    const pool = await sql.connect(dbConfig);
    
    // Add columns if not exist
    try {
      await pool.request().query('ALTER TABLE AM_Locations ADD latitude DECIMAL(10,8) NULL, longitude DECIMAL(11,8) NULL');
      console.log('Added latitude and longitude to AM_Locations');
    } catch(e) {
      if(e.message.includes('already exists')) {
        console.log('Columns already exist.');
      } else {
        console.error('Alter table warning:', e.message);
      }
    }

    // Get unique locations from Devices
    const result = await pool.request().query('SELECT DISTINCT location, latitude, longitude FROM Devices WHERE location IS NOT NULL');
    const locations = result.recordset;

    let inserted = 0;
    for (let loc of locations) {
      if(!loc.location || loc.latitude == 0) continue;
      
      const code = loc.location.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15).toUpperCase();
      
      const check = await pool.request().input('code', sql.VarChar, code).query('SELECT id FROM AM_Locations WHERE location_code = @code');
      if (check.recordset.length === 0) {
        await pool.request()
          .input('code', sql.VarChar, code)
          .input('name', sql.VarChar, loc.location)
          .input('lat', sql.Decimal(10,8), loc.latitude)
          .input('lng', sql.Decimal(11,8), loc.longitude)
          .query(`
            INSERT INTO AM_Locations (location_code, location_name, type, status, latitude, longitude)
            VALUES (@code, @name, 'STORE', 'ACTIVE', @lat, @lng)
          `);
        inserted++;
      }
    }
    console.log(`Migration complete. Inserted ${inserted} new locations.`);
    process.exit(0);
  } catch(e) {
    console.error('Migration error:', e);
    process.exit(1);
  }
}
migrate();
