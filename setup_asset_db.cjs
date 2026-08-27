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

async function setupAssetDB() {
  try {
    console.log('Connecting to database:', dbConfig.database, 'on', dbConfig.server);
    await sql.connect(dbConfig);
    console.log('Connected successfully. Creating Asset Management tables...');

    const tables = [
      `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AM_Locations' and xtype='U')
      CREATE TABLE AM_Locations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        location_code VARCHAR(50) NOT NULL UNIQUE,
        location_name VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL, -- HO, STORE, WAREHOUSE
        parent_location VARCHAR(50) NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT GETDATE()
      )
      `,
      `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AM_Departments' and xtype='U')
      CREATE TABLE AM_Departments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        manager VARCHAR(100) NULL,
        employee_count INT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE()
      )
      `,
      `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AM_Categories' and xtype='U')
      CREATE TABLE AM_Categories (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(255) NULL,
        created_at DATETIME DEFAULT GETDATE()
      )
      `,
      `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AM_Vendors' and xtype='U')
      CREATE TABLE AM_Vendors (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        contact_person VARCHAR(100) NULL,
        email VARCHAR(100) NULL,
        phone VARCHAR(50) NULL,
        address VARCHAR(255) NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        rating INT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE()
      )
      `,
      `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AM_Assets' and xtype='U')
      CREATE TABLE AM_Assets (
        id INT IDENTITY(1,1) PRIMARY KEY,
        asset_code VARCHAR(50) NOT NULL UNIQUE,
        asset_name VARCHAR(150) NOT NULL,
        category_code VARCHAR(50) NOT NULL,
        location_code VARCHAR(50) NOT NULL,
        vendor_id INT NULL,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        condition VARCHAR(50) DEFAULT 'NEW',
        pic VARCHAR(100) NULL,
        purchase_date DATE NULL,
        warranty_end DATE NULL,
        price DECIMAL(18,2) DEFAULT 0,
        book_value DECIMAL(18,2) DEFAULT 0,
        depreciation_rate DECIMAL(5,2) DEFAULT 0,
        ip_address VARCHAR(50) NULL,
        mac_address VARCHAR(50) NULL,
        serial_number VARCHAR(100) NULL,
        firmware VARCHAR(100) NULL,
        created_at DATETIME DEFAULT GETDATE()
      )
      `,
      `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AM_Assignments' and xtype='U')
      CREATE TABLE AM_Assignments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        asset_code VARCHAR(50) NOT NULL,
        assignee VARCHAR(100) NOT NULL,
        department_code VARCHAR(50) NULL,
        location_code VARCHAR(50) NULL,
        assigned_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        bast_number VARCHAR(50) NULL,
        return_bast_number VARCHAR(50) NULL,
        asset_condition VARCHAR(50) NULL,
        created_at DATETIME DEFAULT GETDATE()
      )
      `,
      `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AM_Movements' and xtype='U')
      CREATE TABLE AM_Movements (
        id INT IDENTITY(1,1) PRIMARY KEY,
        movement_id VARCHAR(50) NOT NULL UNIQUE,
        asset_code VARCHAR(50) NOT NULL,
        from_location VARCHAR(50) NOT NULL,
        to_location VARCHAR(50) NOT NULL,
        request_date DATE NOT NULL,
        completion_date DATE NULL,
        status VARCHAR(20) DEFAULT 'PENDING',
        requester VARCHAR(100) NOT NULL,
        reason VARCHAR(255) NULL,
        created_at DATETIME DEFAULT GETDATE()
      )
      `,
      `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AM_Components' and xtype='U')
      CREATE TABLE AM_Components (
        id INT IDENTITY(1,1) PRIMARY KEY,
        parent_asset_code VARCHAR(50) NOT NULL,
        name VARCHAR(150) NOT NULL,
        serial_number VARCHAR(100) NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT GETDATE()
      )
      `
    ];

    for (let query of tables) {
      await sql.query(query);
      console.log('Executed table script successfully.');
    }

    console.log('All Asset Management tables created successfully!');
    process.exit(0);

  } catch (err) {
    console.error('Error creating database tables:', err);
    process.exit(1);
  }
}

setupAssetDB();
