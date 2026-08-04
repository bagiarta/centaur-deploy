const { poolPromise } = require('./config/db.js');
poolPromise.then(pool => {
  pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ESL_LABELS'").then(res => {
    console.log(res.recordset);
    process.exit(0);
  });
});
