const fs = require('fs');
const path = require('path');

const filePath = 'f:/PepiUpdater/centaur-deploy/server.cjs';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Roles and Users tables to the tables array
const tableCode = `      \`IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Roles' AND xtype='U')
        CREATE TABLE Roles (
            id NVARCHAR(50) PRIMARY KEY,
            name NVARCHAR(100) NOT NULL,
            menu_permissions NVARCHAR(MAX),
            is_admin BIT DEFAULT 0
        )\`,
       \`IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
        CREATE TABLE Users (
            id NVARCHAR(50) PRIMARY KEY,
            username NVARCHAR(100) UNIQUE NOT NULL,
            password_hash NVARCHAR(MAX) NOT NULL,
            full_name NVARCHAR(200),
            role_id NVARCHAR(50),
            created_at DATETIME DEFAULT GETDATE()
        )\`,`;

content = content.replace(/(DeviceDbConnections' AND xtype='U'\)\s+CREATE TABLE DeviceDbConnections \([\s\S]+?updated_at DATETIME DEFAULT GETDATE\(\)\s+\)\`)\s*(\];)/, `$1,\n${tableCode}\n      $2`);

// 2. Add Seeding logic at the end of initDb
const seedingCode = `
    // Seed default roles and user
    const rolesCount = await pool.request().query('SELECT COUNT(*) as count FROM Roles');
    if (rolesCount.recordset[0].count === 0) {
      console.log('Seeding default roles...');
      await pool.request().query("INSERT INTO Roles (id, name, menu_permissions, is_admin) VALUES ('role-admin', 'Administrator', '*', 1)");
    }

    const usersCount = await pool.request().query('SELECT COUNT(*) as count FROM Users');
    if (usersCount.recordset[0].count === 0) {
      console.log('Seeding default admin user...');
      await pool.request().query("INSERT INTO Users (id, username, password_hash, full_name, role_id) VALUES ('user-admin', 'admin', 'admin123', 'Default Admin', 'role-admin')");
    }
  `;

content = content.replace(/(WHERE device_id NOT IN \(SELECT id FROM Devices\)\s+\);\s+})(?=\s+catch)/, `$1\n${seedingCode}`);

fs.writeFileSync(filePath, content);
console.log('Successfully updated server.cjs');
