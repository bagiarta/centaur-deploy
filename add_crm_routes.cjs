const fs = require('fs');
let content = fs.readFileSync('routes/legacyRoutes.js', 'utf-8');

const newRoutes = `
// ── GET /api/crm/sync-logs ──────────────────────────────
router.get('/api/crm/sync-logs', async (req, res) => {
  try {
    const crmPool = await getCrmPool();
    
    // Ensure table exists (fail-safe)
    await crmPool.request().query(\`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sync_item_crm_job_log')
      BEGIN
          CREATE TABLE dbo.sync_item_crm_job_log (
              log_id INT IDENTITY(1,1) PRIMARY KEY,
              log_date DATETIME DEFAULT GETDATE(),
              issue_date DATETIME,
              item_code VARCHAR(50),
              item_name VARCHAR(150),
              item_stk_uom VARCHAR(10),
              item_vendor_cd VARCHAR(50),
              status VARCHAR(50),
              message VARCHAR(MAX)
          );
      END
    \`);

    const result = await crmPool.request().query(\`
      SELECT TOP 100 * FROM sync_item_crm_job_log ORDER BY log_date DESC
    \`);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching sync logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
  }
});

// ── POST /api/crm/sync-retry ──────────────────────────────
router.post('/api/crm/sync-retry', async (req, res) => {
  try {
    const crmPool = await getCrmPool();
    
    // Ensure table exists
    await crmPool.request().query(\`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sync_item_crm_job_log')
      BEGIN
          CREATE TABLE dbo.sync_item_crm_job_log (
              log_id INT IDENTITY(1,1) PRIMARY KEY,
              log_date DATETIME DEFAULT GETDATE(),
              issue_date DATETIME,
              item_code VARCHAR(50),
              item_name VARCHAR(150),
              item_stk_uom VARCHAR(10),
              item_vendor_cd VARCHAR(50),
              status VARCHAR(50),
              message VARCHAR(MAX)
          );
      END
    \`);

    // Check failed count in the last 2 days
    const checkFailed = await crmPool.request().query(\`
      SELECT COUNT(*) as failedCount 
      FROM LOYAL_CRM_ITEM_MST WITH (NOLOCK)
      WHERE RESPONSE_MSG NOT LIKE 'Success%'
        AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -2, GETDATE())
    \`);
    
    const countFailed = checkFailed.recordset[0].failedCount;
    
    if (countFailed > 0) {
      // Find the oldest target date
      const targetDateRes = await crmPool.request().query(\`
        SELECT TOP 1 CAST(CAST(LAST_TIMESTAMP AS DATETIME) AS DATE) as targetDate
        FROM LOYAL_CRM_ITEM_MST WITH (NOLOCK)
        WHERE RESPONSE_MSG NOT LIKE 'Success%'
          AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -2, GETDATE())
        ORDER BY CAST(LAST_TIMESTAMP AS DATETIME) ASC
      \`);
      
      const targetDate = targetDateRes.recordset[0].targetDate;
      
      const transaction = new sql.Transaction(crmPool);
      await transaction.begin();
      
      try {
        const reqQuery = new sql.Request(transaction);
        reqQuery.input('targetDate', sql.Date, targetDate);
        
        await reqQuery.query(\`
          UPDATE LOYAL_CRM_PROCESS_CONFIG
          SET PROCESS_EXEC_DATE = DATEADD(day, -1, @targetDate);
        \`);
        
        await reqQuery.query(\`
          INSERT INTO dbo.sync_item_crm_job_log (
              log_date, issue_date, item_code, item_name, item_stk_uom, item_vendor_cd, status, message
          )
          SELECT 
              GETDATE(), CAST(LAST_TIMESTAMP AS DATETIME), ITEM_CODE, ITEM_NAME, ITEM_STK_UOM, ITEM_VENDOR_CD, 'FAILED', RESPONSE_MSG
          FROM LOYAL_CRM_ITEM_MST WITH (NOLOCK)
          WHERE RESPONSE_MSG NOT LIKE 'Success%'
            AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -2, GETDATE());
        \`);
        
        await reqQuery.query(\`
          UPDATE LOYAL_CRM_ITEM_MST set IS_SYNC='0', RESPONSE_MSG=''
          WHERE RESPONSE_MSG NOT LIKE 'Success%'
            AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -2, GETDATE());
        \`);
        
        await transaction.commit();
        res.json({ success: true, message: \`Successfully pushed \${countFailed} failed items for retry.\` });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } else {
      await crmPool.request().query(\`
        INSERT INTO dbo.sync_item_crm_job_log (
            log_date, issue_date, status, message
        )
        VALUES (
            GETDATE(),
            CAST(CAST(DATEADD(day, -1, GETDATE()) AS DATE) AS DATETIME), 
            'SUCCESS',
            'No failed records found. Process date remains unchanged.'
        );
      \`);
      
      res.json({ success: true, message: 'No failed records found. Process date remains unchanged.' });
    }
  } catch (err) {
    console.error('Error during CRM sync retry:', err);
    res.status(500).json({ error: 'Failed to process sync retry', details: err.message });
  }
});
`;

content = content.replace('export default router;', newRoutes + '\nexport default router;');
fs.writeFileSync('routes/legacyRoutes.js', content);
console.log('CRM Sync Routes added successfully!');
