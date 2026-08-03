const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

async function createIndex() {
  try {
    const pool = await sql.connect(config);
    await pool.request().query('CREATE INDEX IX_ITEM_SALES_MEMBER_card_no ON ITEM_SALES_MEMBER(card_no)');
    console.log("Index created on card_no");
    process.exit(0);
  } catch (err) {
    console.error("Index creation failed:", err.message);
    process.exit(1);
  }
}
createIndex();
