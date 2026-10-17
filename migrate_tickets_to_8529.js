import sql from 'mssql';
import { initDb, poolPromise } from './config/db.js';

async function migrate() {
  console.log('--- Starting Migration from DBWH_8555 to DBWH_8529 ---');
  
  await initDb();
  const pool29 = await poolPromise;
  console.log('Connected to DBWH_8529');

  // 1. Create tables in DBWH_8529
  console.log('Ensuring CRM ticket tables exist in DBWH_8529...');
  await pool29.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CRM_TICKETS' and xtype='U')
    CREATE TABLE CRM_TICKETS (
        ticket_id VARCHAR(50) PRIMARY KEY,
        requester_id VARCHAR(100),
        requester_name VARCHAR(100),
        unit_branch VARCHAR(100),
        request_type VARCHAR(50),
        priority VARCHAR(20),
        customer_id VARCHAR(100),
        customer_name VARCHAR(150),
        mobile_no VARCHAR(50),
        status VARCHAR(50),
        current_approval_level INT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        closed_at DATETIME NULL
    );

    -- Ensure customer_name and mobile_no columns exist if table was already created
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CRM_TICKETS') AND name = 'customer_name')
        ALTER TABLE CRM_TICKETS ADD customer_name VARCHAR(150);
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CRM_TICKETS') AND name = 'mobile_no')
        ALTER TABLE CRM_TICKETS ADD mobile_no VARCHAR(50);

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CRM_TICKET_DETAILS' and xtype='U')
    CREATE TABLE CRM_TICKET_DETAILS (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ticket_id VARCHAR(50) FOREIGN KEY REFERENCES CRM_TICKETS(ticket_id),
        field_name VARCHAR(100),
        old_value VARCHAR(MAX),
        new_value VARCHAR(MAX),
        reason VARCHAR(MAX),
        transaction_ref VARCHAR(100),
        attachment_url VARCHAR(MAX)
    );

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CRM_TICKET_APPROVALS' and xtype='U')
    CREATE TABLE CRM_TICKET_APPROVALS (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ticket_id VARCHAR(50) FOREIGN KEY REFERENCES CRM_TICKETS(ticket_id),
        approver_id VARCHAR(100),
        approver_name VARCHAR(100),
        approver_role VARCHAR(50),
        status VARCHAR(50),
        comments NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE()
    );

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CRM_TICKET_AUDIT_LOGS' and xtype='U')
    CREATE TABLE CRM_TICKET_AUDIT_LOGS (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ticket_id VARCHAR(50) FOREIGN KEY REFERENCES CRM_TICKETS(ticket_id),
        action VARCHAR(100),
        actor_id VARCHAR(100),
        actor_name VARCHAR(100),
        details NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE()
    );
  `);
  console.log('✅ Tables created / verified in DBWH_8529');

  // 2. Connect to DBWH_8555
  console.log('Connecting to DBWH_8555...');
  const pool55 = new sql.ConnectionPool({
    user: 'DBWH_8555',
    password: 'DBWH_8555',
    server: '192.168.85.55',
    database: 'DBWH_8555',
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  });
  await pool55.connect();
  console.log('Connected to DBWH_8555');

  // 3. Fetch tickets from 8555 with customer details
  const ticketsRes = await pool55.request().query(`
    SELECT t.*, 
           c.RLICM_NAME as customer_name, 
           c.RLICM_MOBILE_NO as mobile_no
    FROM CRM_TICKETS t
    LEFT JOIN RXL_LOYALID_CUSTOMER_MST c 
      ON t.customer_id = c.RLICM_CARD_NO OR t.customer_id = c.RLICM_MOBILE_NO
  `);
  console.log(`Found ${ticketsRes.recordset.length} tickets in DBWH_8555`);

  // Insert into DBWH_8529
  for (const t of ticketsRes.recordset) {
    const check = await pool29.request()
      .input('id', sql.VarChar, t.ticket_id)
      .query('SELECT ticket_id FROM CRM_TICKETS WHERE ticket_id = @id');
    
    if (check.recordset.length === 0) {
      await pool29.request()
        .input('ticket_id', sql.VarChar, t.ticket_id)
        .input('requester_id', sql.VarChar, t.requester_id)
        .input('requester_name', sql.VarChar, t.requester_name)
        .input('unit_branch', sql.VarChar, t.unit_branch)
        .input('request_type', sql.VarChar, t.request_type)
        .input('priority', sql.VarChar, t.priority)
        .input('customer_id', sql.VarChar, t.customer_id)
        .input('customer_name', sql.VarChar, t.customer_name || null)
        .input('mobile_no', sql.VarChar, t.mobile_no || null)
        .input('status', sql.VarChar, t.status)
        .input('current_approval_level', sql.Int, t.current_approval_level)
        .input('created_at', sql.DateTime, t.created_at)
        .input('updated_at', sql.DateTime, t.updated_at)
        .input('closed_at', sql.DateTime, t.closed_at)
        .query(`
          INSERT INTO CRM_TICKETS (
            ticket_id, requester_id, requester_name, unit_branch, request_type,
            priority, customer_id, customer_name, mobile_no, status,
            current_approval_level, created_at, updated_at, closed_at
          ) VALUES (
            @ticket_id, @requester_id, @requester_name, @unit_branch, @request_type,
            @priority, @customer_id, @customer_name, @mobile_no, @status,
            @current_approval_level, @created_at, @updated_at, @closed_at
          )
        `);
      console.log(`Migrated ticket: ${t.ticket_id}`);
    } else {
      console.log(`Ticket ${t.ticket_id} already exists in DBWH_8529`);
    }
  }

  // 4. Fetch details
  const detailsRes = await pool55.request().query('SELECT * FROM CRM_TICKET_DETAILS');
  console.log(`Found ${detailsRes.recordset.length} details in DBWH_8555`);
  for (const d of detailsRes.recordset) {
    const check = await pool29.request()
      .input('ticket_id', sql.VarChar, d.ticket_id)
      .input('field_name', sql.VarChar, d.field_name)
      .input('transaction_ref', sql.VarChar, d.transaction_ref)
      .query('SELECT id FROM CRM_TICKET_DETAILS WHERE ticket_id = @ticket_id AND field_name = @field_name AND (transaction_ref = @transaction_ref OR (transaction_ref IS NULL AND @transaction_ref IS NULL))');
    
    if (check.recordset.length === 0) {
      await pool29.request()
        .input('ticket_id', sql.VarChar, d.ticket_id)
        .input('field_name', sql.VarChar, d.field_name)
        .input('old_value', sql.VarChar, d.old_value)
        .input('new_value', sql.VarChar, d.new_value)
        .input('reason', sql.VarChar, d.reason)
        .input('transaction_ref', sql.VarChar, d.transaction_ref)
        .input('attachment_url', sql.VarChar, d.attachment_url)
        .query(`
          INSERT INTO CRM_TICKET_DETAILS (
            ticket_id, field_name, old_value, new_value, reason, transaction_ref, attachment_url
          ) VALUES (
            @ticket_id, @field_name, @old_value, @new_value, @reason, @transaction_ref, @attachment_url
          )
        `);
    }
  }

  // 5. Fetch approvals
  const approvalsRes = await pool55.request().query('SELECT * FROM CRM_TICKET_APPROVALS ORDER BY id ASC');
  console.log(`Found ${approvalsRes.recordset.length} approvals in DBWH_8555`);
  for (const a of approvalsRes.recordset) {
    const check = await pool29.request()
      .input('ticket_id', sql.VarChar, a.ticket_id)
      .input('approver_id', sql.VarChar, a.approver_id)
      .input('status', sql.VarChar, a.status)
      .input('created_at', sql.DateTime, a.created_at)
      .query('SELECT id FROM CRM_TICKET_APPROVALS WHERE ticket_id = @ticket_id AND approver_id = @approver_id AND status = @status AND created_at = @created_at');
    
    if (check.recordset.length === 0) {
      await pool29.request()
        .input('ticket_id', sql.VarChar, a.ticket_id)
        .input('approver_id', sql.VarChar, a.approver_id)
        .input('approver_name', sql.VarChar, a.approver_name)
        .input('approver_role', sql.VarChar, a.approver_role)
        .input('status', sql.VarChar, a.status)
        .input('comments', sql.NVarChar, a.comments)
        .input('created_at', sql.DateTime, a.created_at)
        .query(`
          INSERT INTO CRM_TICKET_APPROVALS (
            ticket_id, approver_id, approver_name, approver_role, status, comments, created_at
          ) VALUES (
            @ticket_id, @approver_id, @approver_name, @approver_role, @status, @comments, @created_at
          )
        `);
    }
  }

  // 6. Fetch audit logs
  const logsRes = await pool55.request().query('SELECT * FROM CRM_TICKET_AUDIT_LOGS ORDER BY id ASC');
  console.log(`Found ${logsRes.recordset.length} audit logs in DBWH_8555`);
  for (const l of logsRes.recordset) {
    const check = await pool29.request()
      .input('ticket_id', sql.VarChar, l.ticket_id)
      .input('action', sql.VarChar, l.action)
      .input('created_at', sql.DateTime, l.created_at)
      .query('SELECT id FROM CRM_TICKET_AUDIT_LOGS WHERE ticket_id = @ticket_id AND action = @action AND created_at = @created_at');
    
    if (check.recordset.length === 0) {
      await pool29.request()
        .input('ticket_id', sql.VarChar, l.ticket_id)
        .input('action', sql.VarChar, l.action)
        .input('actor_id', sql.VarChar, l.actor_id)
        .input('actor_name', sql.VarChar, l.actor_name)
        .input('details', sql.NVarChar, l.details)
        .input('created_at', sql.DateTime, l.created_at)
        .query(`
          INSERT INTO CRM_TICKET_AUDIT_LOGS (
            ticket_id, action, actor_id, actor_name, details, created_at
          ) VALUES (
            @ticket_id, @action, @actor_id, @actor_name, @details, @created_at
          )
        `);
    }
  }

  // 7. Verify counts in DBWH_8529
  console.log('\n--- Verification in DBWH_8529 ---');
  const countT = await pool29.request().query('SELECT COUNT(*) as c FROM CRM_TICKETS');
  const countD = await pool29.request().query('SELECT COUNT(*) as c FROM CRM_TICKET_DETAILS');
  const countA = await pool29.request().query('SELECT COUNT(*) as c FROM CRM_TICKET_APPROVALS');
  const countL = await pool29.request().query('SELECT COUNT(*) as c FROM CRM_TICKET_AUDIT_LOGS');
  console.log(`DBWH_8529 CRM_TICKETS: ${countT.recordset[0].c}`);
  console.log(`DBWH_8529 CRM_TICKET_DETAILS: ${countD.recordset[0].c}`);
  console.log(`DBWH_8529 CRM_TICKET_APPROVALS: ${countA.recordset[0].c}`);
  console.log(`DBWH_8529 CRM_TICKET_AUDIT_LOGS: ${countL.recordset[0].c}`);

  console.log('✅ Migration to DBWH_8529 completed successfully!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
