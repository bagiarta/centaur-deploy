import { poolPromise } from './config/db.js';

async function run() {
  try {
    const pool = await poolPromise;
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ChatConversations' AND xtype='U')
      BEGIN
          CREATE TABLE ChatConversations (
              id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
              type VARCHAR(20) NOT NULL,
              name NVARCHAR(100) NULL,
              created_at DATETIME DEFAULT GETDATE()
          )
      END

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ChatParticipants' AND xtype='U')
      BEGIN
          CREATE TABLE ChatParticipants (
              conversation_id UNIQUEIDENTIFIER FOREIGN KEY REFERENCES ChatConversations(id) ON DELETE CASCADE,
              user_id NVARCHAR(255) NOT NULL,
              joined_at DATETIME DEFAULT GETDATE(),
              PRIMARY KEY (conversation_id, user_id)
          )
      END

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ChatMessages' AND xtype='U')
      BEGIN
          CREATE TABLE ChatMessages (
              id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
              conversation_id UNIQUEIDENTIFIER FOREIGN KEY REFERENCES ChatConversations(id) ON DELETE CASCADE,
              sender_id NVARCHAR(255) NOT NULL,
              content NVARCHAR(MAX) NOT NULL,
              is_read BIT DEFAULT 0,
              created_at DATETIME DEFAULT GETDATE()
          )
      END
    `);
    console.log('Chat tables created successfully.');
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

run();
