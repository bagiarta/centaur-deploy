/**
 * Validates if the SQL query is a safe READ-ONLY SELECT statement.
 * Blocks multiple statements (;), comments that could hide logic, 
 * and DDL/DML mutation keywords.
 */
export function isValidSafeSQL(script) {
  if (!script || typeof script !== 'string') return false;

  // 1. Remove comments to see the actual commands
  // Single line comments starting with --
  // Block comments /* ... */
  const cleanScript = script
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  if (!cleanScript) return false;

  const normalized = cleanScript.toUpperCase();

  // 2. Must start with SELECT (ignoring what we just cleaned)
  if (!normalized.startsWith('SELECT')) return false;

  // 3. Block multiple statements (semicolon)
  // We allow a semicolon at the very end of the script, but not elsewhere
  const withoutTrailingSemicolon = cleanScript.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) return false;

  // 4. Block mutation keywords
  const blockedKeywords = [
    'UPDATE', 'DELETE', 'INSERT', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE',
    'RECONFIGURE', 'EXEC', 'EXECUTE', 'MERGE', 'GRANT', 'REVOKE',
    'INTO', 'WRITETEXT', 'UPDATETEXT', 'DELETETEXT'
  ];

  for (const keyword of blockedKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(normalized)) return false;
  }

  return true;
}

