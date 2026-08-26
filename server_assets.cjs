const express = require('express');

module.exports = function(sql, dbConfig) {
  const router = express.Router();

  // Helper function to execute queries safely
  async function executeQuery(query, params = []) {
    try {
      const pool = await sql.connect(dbConfig);
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

  // ==========================================
  // LOCATIONS
  // ==========================================
  router.get('/locations', async (req, res) => {
    try {
      const data = await executeQuery(`SELECT * FROM AM_Locations ORDER BY location_name ASC`);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  router.post('/locations', async (req, res) => {
    try {
      const { code, name, type, parent_location, status } = req.body;
      const query = `
        INSERT INTO AM_Locations (location_code, location_name, type, parent_location, status) 
        OUTPUT INSERTED.*
        VALUES (@code, @name, @type, @parent_location, @status)
      `;
      const pool = await sql.connect(dbConfig);
      const result = await pool.request()
        .input('code', sql.VarChar, code)
        .input('name', sql.VarChar, name)
        .input('type', sql.VarChar, type)
        .input('parent_location', sql.VarChar, parent_location || null)
        .input('status', sql.VarChar, status || 'ACTIVE')
        .query(query);
      
      res.status(201).json(result.recordset[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create location' });
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
      const { code, name, manager, employee_count } = req.body;
      const query = `
        INSERT INTO AM_Departments (code, name, manager, employee_count) 
        OUTPUT INSERTED.*
        VALUES (@code, @name, @manager, @employee_count)
      `;
      const pool = await sql.connect(dbConfig);
      const result = await pool.request()
        .input('code', sql.VarChar, code)
        .input('name', sql.VarChar, name)
        .input('manager', sql.VarChar, manager || null)
        .input('employee_count', sql.Int, employee_count || 0)
        .query(query);
      
      res.status(201).json(result.recordset[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create department' });
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

  // ==========================================
  // ASSIGNMENTS
  // ==========================================
  router.get('/assignments', async (req, res) => {
    try {
      const data = await executeQuery(`SELECT * FROM AM_Assignments ORDER BY assigned_date DESC`);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch assignments' });
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

  return router;
};
