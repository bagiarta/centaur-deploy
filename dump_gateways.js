import sql from 'mssql';
import { dbConfig } from './config/db.js';

async function dumpGateways() {
  const pool = await sql.connect(dbConfig);
  const result = await pool.request().query("SELECT * FROM ESL_GATEWAYS");
  console.log(result.recordset);
  process.exit(0);
}

dumpGateways();
