import express from 'express';
import sql from 'mssql';
import { poolPromise } from '../config/db.js';

const router = express.Router();

// Helper function to execute queries safely
async function executeQuery(query, params = []) {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    
    params.forEach(param => {
      request.input(param.name, param.type, param.value);
    });

    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('Database Error:', err);
    throw err;
  }
}

// CRM Pool for DimStore access
let crmPoolPromise = null;
async function getCrmPool() {
  if (crmPoolPromise) return crmPoolPromise;
  try {
    const config = {
      user: process.env.CRM_DB_USER || 'sa',
      password: process.env.CRM_DB_PASS || process.env.DB_PASS,
      server: process.env.CRM_DB_SERVER || '192.168.85.55',
      database: process.env.CRM_DB_NAME || 'DBWH_8555',
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 15000,
      requestTimeout: 30000
    };
    const crmPool = new sql.ConnectionPool(config);
    crmPoolPromise = crmPool.connect();
    return crmPoolPromise;
  } catch (err) {
    console.error('Failed to connect to CRM Pool:', err.message);
    crmPoolPromise = null;
    throw err;
  }
}

// ==========================================
// LOCATIONS
// ==========================================
router.get('/locations', async (req, res) => {
  try {
    const data = await executeQuery(`
      SELECT l.*, 
        (SELECT COUNT(*) FROM AM_Assets a WHERE a.location_code = l.location_code) +
        (SELECT COUNT(*) FROM Devices d WHERE d.location = l.location_name) as asset_count
      FROM AM_Locations l 
      ORDER BY l.location_name ASC
    `);

    try {
      const crmPool = await getCrmPool();
      const storeResult = await crmPool.request().query(`
        SELECT ORG_CD as location_code, ORG_NAME as location_name 
        FROM DimStore 
        WHERE ORG_STATUS='O'
      `);
      
      const stores = storeResult.recordset.map(store => ({
        ...store,
        type: 'STORE',
        status: 'ACTIVE',
        asset_count: 0 // Optional: Could calculate this if needed
      }));
      
      data.push(...stores);
    } catch (storeErr) {
      console.error('Failed to fetch stores for locations:', storeErr.message);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

router.post('/locations', async (req, res) => {
  try {
    const { code, name, type, parent_location, status, latitude, longitude } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('code', sql.VarChar, code)
      .input('name', sql.VarChar, name)
      .input('type', sql.VarChar, type)
      .input('parent_location', sql.VarChar, parent_location || null)
      .input('status', sql.VarChar, status || 'ACTIVE')
      .input('latitude', sql.Decimal(10,8), latitude || null)
      .input('longitude', sql.Decimal(11,8), longitude || null)
      .query(`
        INSERT INTO AM_Locations (location_code, location_name, type, parent_location, status, latitude, longitude) 
        OUTPUT INSERTED.*
        VALUES (@code, @name, @type, @parent_location, @status, @latitude, @longitude)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

router.put('/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, type, parent_location, status, latitude, longitude } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('code', sql.VarChar, code)
      .input('name', sql.VarChar, name)
      .input('type', sql.VarChar, type)
      .input('parent_location', sql.VarChar, parent_location || null)
      .input('status', sql.VarChar, status || 'ACTIVE')
      .input('latitude', sql.Decimal(10,8), latitude || null)
      .input('longitude', sql.Decimal(11,8), longitude || null)
      .query(`
        UPDATE AM_Locations 
        SET location_code = @code, location_name = @name, type = @type, parent_location = @parent_location, status = @status, latitude = @latitude, longitude = @longitude
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

router.delete('/locations/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM AM_Locations WHERE id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// ==========================================
// DEPARTMENTS
// ==========================================
router.get('/departments', async (req, res) => {
  try {
    const data = await executeQuery(`SELECT * FROM AM_Departments ORDER BY name ASC`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

router.post('/departments', async (req, res) => {
  try {
    const { name, manager, employee_count } = req.body;
    const pool = await poolPromise;
    
    // Auto-generate Department Code (e.g. DEPT0001)
    const lastDept = await pool.request().query(`
      SELECT TOP 1 code FROM AM_Departments 
      WHERE code LIKE 'DEPT%' 
      ORDER BY code DESC
    `);
    
    let newCode = 'DEPT0001';
    if (lastDept.recordset.length > 0) {
      const lastCode = lastDept.recordset[0].code;
      const num = parseInt(lastCode.replace('DEPT', ''), 10);
      if (!isNaN(num)) {
        newCode = 'DEPT' + String(num + 1).padStart(4, '0');
      }
    }

    const result = await pool.request()
      .input('code', sql.VarChar, newCode)
      .input('name', sql.VarChar, name)
      .input('manager', sql.VarChar, manager || null)
      .input('employee_count', sql.Int, employee_count || 0)
      .query(`
        INSERT INTO AM_Departments (code, name, manager, employee_count) 
        OUTPUT INSERTED.*
        VALUES (@code, @name, @manager, @employee_count)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, manager, employee_count } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('code', sql.VarChar, code)
      .input('name', sql.VarChar, name)
      .input('manager', sql.VarChar, manager || null)
      .input('employee_count', sql.Int, employee_count || 0)
      .query(`
        UPDATE AM_Departments 
        SET code = @code, name = @name, manager = @manager, employee_count = @employee_count
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update department' });
  }
});

router.delete('/departments/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM AM_Departments WHERE id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

// ==========================================
// CATEGORIES
// ==========================================
router.get('/categories', async (req, res) => {
  try {
    const data = await executeQuery(`SELECT * FROM AM_Categories ORDER BY name ASC`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, description } = req.body;
    const pool = await poolPromise;
    
    // Auto-generate Category Code (e.g. CAT0001)
    const lastCat = await pool.request().query(`
      SELECT TOP 1 code FROM AM_Categories 
      WHERE code LIKE 'CAT%' 
      ORDER BY code DESC
    `);
    
    let newCode = 'CAT0001';
    if (lastCat.recordset.length > 0) {
      const lastCode = lastCat.recordset[0].code;
      const num = parseInt(lastCode.replace('CAT', ''), 10);
      if (!isNaN(num)) {
        newCode = 'CAT' + String(num + 1).padStart(4, '0');
      }
    }

    const result = await pool.request()
      .input('code', sql.VarChar, newCode)
      .input('name', sql.VarChar, name)
      .input('description', sql.VarChar, description || null)
      .query(`
        INSERT INTO AM_Categories (code, name, description) 
        OUTPUT INSERTED.*
        VALUES (@code, @name, @description)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, description } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('code', sql.VarChar, code)
      .input('name', sql.VarChar, name)
      .input('description', sql.VarChar, description || null)
      .input('useful_life_years', sql.Int || null)
      .query(`
        UPDATE AM_Categories 
        SET code = @code, name = @name, description = @description = @useful_life_years
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM AM_Categories WHERE id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ==========================================
// VENDORS
// ==========================================
router.get('/vendors', async (req, res) => {
  try {
    const data = await executeQuery(`SELECT * FROM AM_Vendors ORDER BY name ASC`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

router.post('/vendors', async (req, res) => {
  try {
    const { name, contact_person, phone, email, address, status } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('name', sql.VarChar, name)
      .input('contact_person', sql.VarChar, contact_person || null)
      .input('phone', sql.VarChar, phone || null)
      .input('email', sql.VarChar, email || null)
      .input('address', sql.VarChar, address || null)
      .input('status', sql.VarChar, status || 'ACTIVE')
      .query(`
        INSERT INTO AM_Vendors (name, contact_person, phone, email, address, status) 
        OUTPUT INSERTED.*
        VALUES (@name, @contact_person, @phone, @email, @address, @status)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

router.put('/vendors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact_person, phone, email, address, status } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.VarChar, name)
      .input('contact_person', sql.VarChar, contact_person || null)
      .input('phone', sql.VarChar, phone || null)
      .input('email', sql.VarChar, email || null)
      .input('address', sql.VarChar, address || null)
      .input('status', sql.VarChar, status || 'ACTIVE')
      .query(`
        UPDATE AM_Vendors 
        SET name = @name, contact_person = @contact_person, phone = @phone, email = @email, address = @address, status = @status
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

router.delete('/vendors/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM AM_Vendors WHERE id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

// ==========================================
// ASSETS
// ==========================================
router.get('/assets', async (req, res) => {
  try {
    const data = await executeQuery(`SELECT * FROM AM_Assets ORDER BY created_at DESC`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

router.post('/assets', async (req, res) => {
  try {
    const { 
      asset_name, category_code, location_code, vendor_id, status, condition, 
      pic, purchase_date, price, po_number, serial_number, activa_code, physical_address 
    } = req.body;
    let { asset_code } = req.body;
    if (!asset_code) {
      asset_code = `AST-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const pool = await poolPromise;
    const result = await pool.request()
      .input('asset_code', sql.VarChar, asset_code)
      .input('asset_name', sql.VarChar, asset_name)
      .input('category_code', sql.VarChar, category_code)
      .input('location_code', sql.VarChar, location_code)
      .input('vendor_id', sql.Int, vendor_id || null)
      .input('status', sql.VarChar, status || 'IN_USE')
      .input('condition', sql.VarChar, condition || 'NEW')
      .input('pic', sql.VarChar, pic || null)
      .input('purchase_date', sql.Date, purchase_date || null)
      .input('price', sql.Decimal, price || 0)
      .input('po_number', sql.VarChar, po_number || null)
      .input('serial_number', sql.VarChar, serial_number || null)
      .input('activa_code', sql.VarChar, activa_code || null)
      .input('physical_address', sql.VarChar, physical_address || null)
      .query(`
        INSERT INTO AM_Assets (
          asset_code, asset_name, category_code, location_code, vendor_id, 
          status, condition, pic, purchase_date, price,
          po_number, serial_number, activa_code, physical_address
        ) 
        OUTPUT INSERTED.*
        VALUES (
          @asset_code, @asset_name, @category_code, @location_code, @vendor_id, 
          @status, @condition, @pic, @purchase_date, @price,
          @po_number, @serial_number, @activa_code, @physical_address
        )
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

router.put('/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      asset_code, asset_name, category_code, location_code, vendor_id, status, condition, 
      pic, purchase_date, price, po_number, serial_number, activa_code, physical_address 
    } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('asset_code', sql.VarChar, asset_code)
      .input('asset_name', sql.VarChar, asset_name)
      .input('category_code', sql.VarChar, category_code)
      .input('location_code', sql.VarChar, location_code)
      .input('vendor_id', sql.Int, vendor_id || null)
      .input('status', sql.VarChar, status || 'ACTIVE')
      .input('condition', sql.VarChar, condition || 'NEW')
      .input('pic', sql.VarChar, pic || null)
      .input('purchase_date', sql.Date, purchase_date || null)
      .input('price', sql.Decimal, price || 0)
      .input('po_number', sql.VarChar, po_number || null)
      .input('serial_number', sql.VarChar, serial_number || null)
      .input('activa_code', sql.VarChar, activa_code || null)
      .input('physical_address', sql.VarChar, physical_address || null)
      .query(`
        UPDATE AM_Assets 
        SET asset_code = @asset_code, asset_name = @asset_name, category_code = @category_code, 
            location_code = @location_code, vendor_id = @vendor_id, status = @status, 
            condition = @condition, pic = @pic, purchase_date = @purchase_date, price = @price,
            po_number = @po_number, serial_number = @serial_number, activa_code = @activa_code, physical_address = @physical_address
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

router.delete('/assets/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM AM_Assets WHERE id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// ==========================================
// ASSIGNMENTS
// ==========================================
router.get('/assignments', async (req, res) => {
  try {
    const data = await executeQuery(`
      SELECT 
        asg.*, 
        asg.assignee as assigned_to,
        ast.asset_name,
        ast.serial_number,
        ast.activa_code,
        ast.physical_address,
        d.name as department_name 
      FROM AM_Assignments asg 
      JOIN AM_Assets ast ON asg.asset_code = ast.asset_code 
      LEFT JOIN AM_Departments d ON asg.department_code = d.code 
      ORDER BY asg.assigned_date DESC
    `);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

  router.get('/assignments/bast/:bast_number', async (req, res) => {
      try {
          const { bast_number } = req.params;
          const isNumeric = !isNaN(bast_number);
          const whereClause = isNumeric ? `asg.id = ${bast_number}` : `asg.bast_number = '${bast_number}'`;

          const data = await executeQuery(`
            SELECT 
              asg.id as assignment_id,
              asg.bast_number,
              asg.return_bast_number,
              asg.assigned_date,
              asg.assignee as assigned_to,
              asg.status as assignment_status,
              ast.asset_code,
              ast.asset_name,
              ast.category_code,
              c.name as category_name,
              ISNULL(asg.asset_condition, ast.condition) as condition,
              ast.status as asset_status,
              d.name as department_name
            FROM AM_Assignments asg
            JOIN AM_Assets ast ON asg.asset_code = ast.asset_code
            LEFT JOIN AM_Departments d ON asg.department_code = d.code
            LEFT JOIN AM_Categories c ON ast.category_code = c.code
            WHERE ${whereClause}
          `);
        if (data.length === 0) return res.status(404).json({ error: 'Assignment not found' });
        res.json(data);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch BAST data' });
      }
    });

router.post('/assignments', async (req, res) => {
        try {
          const { asset_code, asset_codes, assigned_to, department_code, location_code, notes } = req.body;
          const pool = await poolPromise;
          
          let codesToAssign = [];
          if (asset_codes && Array.isArray(asset_codes) && asset_codes.length > 0) {
            codesToAssign = asset_codes;
          } else if (asset_code) {
            codesToAssign = [asset_code];
          } else {
            return res.status(400).json({ error: 'No assets selected' });
          }

          const transaction = new sql.Transaction(pool);
          await transaction.begin();
  
          try {
            // Generate a unique bast_number
            const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8); // YYYYMMDD
            const randStr = Math.floor(1000 + Math.random() * 9000); // 4 digit random
            const bast_number = `BAST-${dateStr}-${randStr}`;

            const assignedRecords = [];

            for (const code of codesToAssign) {
              // Validate asset before assigning
              const checkRes = await transaction.request()
                .input('codeCheck', sql.VarChar, code)
                .query(`SELECT status, condition FROM AM_Assets WHERE asset_code = @codeCheck`);
              
              if (checkRes.recordset.length === 0) {
                throw new Error(`Asset ${code} not found`);
              }
              
              const asset = checkRes.recordset[0];
              if (asset.status === 'IN_USE') {
                throw new Error(`Asset ${code} is currently in use and cannot be assigned`);
              }
              if (asset.condition === 'DAMAGED') {
                throw new Error(`Asset ${code} is damaged and cannot be assigned`);
              }
    
              const result = await transaction.request()
                .input('asset_code', sql.VarChar, code)
                .input('assignee', sql.VarChar, assigned_to)
                .input('department_code', sql.VarChar, department_code || null)
                .input('location_code', sql.VarChar, location_code || null)
                .input('notes', sql.VarChar, notes || null)
                .input('bast_number', sql.VarChar, bast_number)
                .input('asset_condition', sql.VarChar, asset.condition)
                .query(`
                  INSERT INTO AM_Assignments (asset_code, assignee, department_code, location_code, assigned_date, bast_number, asset_condition) 
                  OUTPUT INSERTED.*
                  VALUES (@asset_code, @assignee, @department_code, @location_code, GETDATE(), @bast_number, @asset_condition)
                `);
    
              assignedRecords.push(result.recordset[0]);
    
              // Update Asset status and location
              await transaction.request()
                .input('asset_code_update', sql.VarChar, code)
                .input('location_code_update', sql.VarChar, location_code || null)
                .query(`
                  UPDATE AM_Assets 
                  SET status = 'IN_USE', condition = 'USED'
                      ${location_code ? ", location_code = @location_code_update" : ""}
                  WHERE asset_code = @asset_code_update
                `);
            }
  
            await transaction.commit();
            res.status(201).json({ records: assignedRecords, bast_number });
          } catch (err) {
            await transaction.rollback();
            throw err;
          }
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: err.message || 'Failed to create assignment' });
        }
    });

router.put('/assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { asset_code, assigned_to, department_code, status } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('asset_code', sql.VarChar, asset_code)
      .input('assignee', sql.VarChar, assigned_to)
      .input('department_code', sql.VarChar, department_code || null)
      .input('status', sql.VarChar, status || 'ACTIVE')
      .query(`
        UPDATE AM_Assignments 
        SET asset_code = @asset_code, assignee = @assignee, department_code = @department_code, status = @status
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

router.delete('/assignments/:id', async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('id', sql.Int, req.params.id)
        .query('DELETE FROM AM_Assignments WHERE id = @id');
      if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
  });

  router.put('/assignments/:id/return', async (req, res) => {
    try {
      const { id } = req.params;
      const { return_condition, return_notes } = req.body;
      const pool = await poolPromise;
      
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        const asgRes = await transaction.request()
          .input('id', sql.Int, id)
          .query('SELECT asset_code FROM AM_Assignments WHERE id = @id');
        
        if (asgRes.recordset.length === 0) {
          throw new Error('Assignment not found');
        }
        const asset_code = asgRes.recordset[0].asset_code;

        // Generate return BAST number
        const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8); // YYYYMMDD
        const randStr = Math.floor(1000 + Math.random() * 9000); // 4 digit random
        const return_bast_number = `BAST-RET-${dateStr}-${randStr}`;

        await transaction.request()
          .input('id', sql.Int, id)
          .input('return_bast_number', sql.VarChar, return_bast_number)
          .query(`UPDATE AM_Assignments SET status = 'RETURNED', return_bast_number = @return_bast_number WHERE id = @id`);

        await transaction.request()
          .input('asset_code', sql.VarChar, asset_code)
          .input('condition', sql.VarChar, return_condition || 'USED')
          .query(`
            UPDATE AM_Assets 
            SET status = 'IN_STORAGE', 
                condition = @condition
            WHERE asset_code = @asset_code
          `);

        await transaction.commit();
        res.json({ message: 'Asset returned successfully', return_bast_number });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to return asset' });
    }
  });

// ==========================================
// MOVEMENTS
// ==========================================
router.get('/movements', async (req, res) => {
  try {
    const data = await executeQuery(`SELECT * FROM AM_Movements ORDER BY request_date DESC`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch movements' });
  }
});

// ==========================================
// COMPONENTS
// ==========================================
router.get('/assets/:code/components', async (req, res) => {
  try {
    const { code } = req.params;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('parent_asset_code', sql.VarChar, code)
      .query('SELECT * FROM AM_Components WHERE parent_asset_code = @parent_asset_code ORDER BY created_at DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch components' });
  }
});

router.post('/assets/:code/components', async (req, res) => {
  try {
    const { code } = req.params;
    const { name, serial_number, status } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('parent_asset_code', sql.VarChar, code)
      .input('name', sql.VarChar, name)
      .input('serial_number', sql.VarChar, serial_number || null)
      .input('status', sql.VarChar, status || 'ACTIVE')
      .query(`
        INSERT INTO AM_Components (parent_asset_code, name, serial_number, status)
        OUTPUT INSERTED.*
        VALUES (@parent_asset_code, @name, @serial_number, @status)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create component' });
  }
});

router.delete('/components/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM AM_Components WHERE id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete component' });
  }
});

// ==========================================
// MOVEMENTS
// ==========================================
router.get('/movements', async (req, res) => {
  try {
    const data = await executeQuery(`SELECT * FROM AM_Movements ORDER BY request_date DESC`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch movements' });
  }
});

router.post('/movements', async (req, res) => {
  try {
    const { asset_code, request_type, from_location, to_location, reason, requested_by } = req.body;
    const pool = await poolPromise;
    const movement_id = 'MOV-' + Date.now();
    
    await pool.request()
      .input('movement_id', sql.VarChar, movement_id)
      .input('asset_code', sql.VarChar, asset_code)
      .input('request_type', sql.VarChar, request_type)
      .input('from_location', sql.VarChar, from_location || null)
      .input('to_location', sql.VarChar, to_location || null)
      .input('reason', sql.VarChar, reason || null)
      .input('requested_by', sql.VarChar, requested_by)
      .input('status', sql.VarChar, 'PENDING')
      .query(`
        INSERT INTO AM_Movements (movement_id, asset_code, request_type, from_location, to_location, reason, requested_by, status, request_date, created_at)
        VALUES (@movement_id, @asset_code, @request_type, @from_location, @to_location, @reason, @requested_by, @status, GETDATE(), GETDATE())
      `);
      
    res.status(201).json({ message: 'Movement created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create movement' });
  }
});

router.put('/movements/:id', async (req, res) => {
  try {
    const { status, approved_by } = req.body;
    const pool = await poolPromise;
    
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('status', sql.VarChar, status)
      .input('approved_by', sql.VarChar, approved_by || 'Admin')
      .query(`
        UPDATE AM_Movements 
        SET status = @status, 
            approved_by = @approved_by,
            completion_date = CASE WHEN @status = 'APPROVED' THEN GETDATE() ELSE completion_date END
        OUTPUT INSERTED.asset_code, INSERTED.to_location, INSERTED.request_type
        WHERE id = @id
      `);
      
    if (status === 'APPROVED' && result.recordset.length > 0) {
      const { asset_code, to_location, request_type } = result.recordset[0];
      
      let updates = [];
      const updateReq = pool.request();
      updateReq.input('asset_code', sql.VarChar, asset_code);

      if (to_location) {
        updates.push('location_code = @location_code');
        updateReq.input('location_code', sql.VarChar, to_location);
      }

      if (request_type === 'TRANSFER') {
        updates.push("status = 'IN_USE'");
      } else if (request_type === 'RETURN') {
        updates.push("status = 'IN_STORAGE'");
      } else if (request_type === 'DISPOSAL') {
        updates.push("status = 'RETIRED'");
        updates.push("condition = 'DAMAGED'");
      }

      if (updates.length > 0) {
        await updateReq.query(`
          UPDATE AM_Assets
          SET ${updates.join(', ')}
          WHERE asset_code = @asset_code
        `);
      }
    }
      
    res.json({ message: 'Movement updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update movement' });
  }
});

router.delete('/movements/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM AM_Movements WHERE id = @id');
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete movement' });
  }
});

// ==========================================
// DASHBOARD STATS
// ==========================================
router.get('/dashboard-stats', async (req, res) => {
  try {
    const pool = await poolPromise;
    const assetsCountRes = await pool.request().query('SELECT COUNT(*) as count FROM AM_Assets');
    
    const amAssetsCount = assetsCountRes.recordset[0].count;
    const totalCount = amAssetsCount; // Only count from AM_Assets now

    // Status distributions
    const activeAssetsRes = await pool.request().query("SELECT COUNT(*) as count FROM AM_Assets WHERE status = 'IN_USE' OR condition = 'GOOD'");
    const activeAssets = activeAssetsRes.recordset[0].count;
    const totalActive = activeAssets;

    res.json({
      totalAssets: totalCount,
      amAssetsCount,
      devicesCount: 0, // Legacy field, kept for UI compatibility if needed
      cctvCount: 0,    // Legacy field, kept for UI compatibility if needed
      totalActive
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});


router.get('/locations/:code/assets', async (req, res) => {
  try {
    const { code } = req.params;
    const { name } = req.query; // pass location_name as query param
    const pool = await poolPromise;
    
    // Get from AM_Assets
    const amAssets = await pool.request()
      .input('code', sql.VarChar, code)
      .query('SELECT asset_code as id, asset_name as name, category_code as category, status FROM AM_Assets WHERE location_code = @code');
      
    // Get from Devices
    const devices = await pool.request()
      .input('name', sql.VarChar, name || '')
      .query('SELECT id, hostname as name, device_type as category, status FROM Devices WHERE location = @name');
      
    const combined = [
      ...amAssets.recordset.map(a => ({ ...a, source: 'AM_Asset' })),
      ...devices.recordset.map(d => ({ ...d, source: 'Device' }))
    ];
    
    res.json(combined);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch location assets' });
  }
});
export default router;




