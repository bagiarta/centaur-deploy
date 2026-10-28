import sql from 'mssql';
import { initDb, poolPromise } from '../config/db.js';

async function createTables() {
  try {
    await initDb();
    const crmPool = await poolPromise;
    console.log("Connected to DBWH_8529 for CRM ticket tables");

    const query = `
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

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CRM_TICKETS') AND name = 'customer_name')
          ALTER TABLE CRM_TICKETS ADD customer_name VARCHAR(150);
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CRM_TICKETS') AND name = 'mobile_no')
          ALTER TABLE CRM_TICKETS ADD mobile_no VARCHAR(50);
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CRM_TICKETS') AND name = 'snapshot_data')
          ALTER TABLE CRM_TICKETS ADD snapshot_data NVARCHAR(MAX);

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

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CRM_TICKET_QUEUE_TEMP' and xtype='U')
      CREATE TABLE CRM_TICKET_QUEUE_TEMP (
          ticket_id VARCHAR(50) NOT NULL PRIMARY KEY,
          rl_itq_integ_code VARCHAR(3) NOT NULL DEFAULT '110',
          rl_itq_txn_type VARCHAR(3) NOT NULL DEFAULT '45',
          rl_itq_org_cd VARCHAR(3) NOT NULL,
          rl_itq_bill_no VARCHAR(13) NOT NULL,
          processed_flag INT NULL DEFAULT 0,
          txn_timestamp DATETIME NULL DEFAULT GETDATE(),
          transmition_type VARCHAR(1) NULL DEFAULT 'O',
          rl_itq_card_no VARCHAR(20) NOT NULL,
          rl_itq_opening_points NUMERIC(18,2) NULL,
          extra_info_1 VARCHAR(500) NULL DEFAULT '',
          exchange_rate DECIMAL(18,6) NULL DEFAULT 1,
          sync_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          sync_error VARCHAR(1000) NULL,
          synced_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT GETDATE(),
          updated_at DATETIME NOT NULL DEFAULT GETDATE()
      );
    `;

    await crmPool.request().query(query);
    console.log("DBWH_8529 CRM ticket tables verified successfully.");

  } catch (err) {
    console.error("Error creating tables in DBWH_8529:", err);
  } finally {
    process.exit(0);
  }
}

createTables();
