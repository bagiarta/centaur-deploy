
function isValidSafeSQL(script) {
  if (!script || typeof script !== 'string') return false;

  const normalized = script.trim().toUpperCase();

  // 1. Must start with SELECT (ignoring simple whitespace/newlines)
  if (!normalized.startsWith('SELECT')) return false;

  // 2. Block multiple statements (semicolon)
  if (normalized.includes(';')) return false;

  // 3. Block mutation keywords
  const blockedKeywords = [
    'UPDATE', 'DELETE', 'INSERT', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE',
    'RECONFIGURE', 'EXEC', 'EXECUTE', 'MERGE', 'GRANT', 'REVOKE',
    'INTO', 'WRITETEXT', 'UPDATETEXT', 'DELETETEXT'
  ];

  for (const keyword of blockedKeywords) {
    // Check for keyword with surrounding whitespace/boundaries to avoid false positives in column names
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(normalized)) return false;
  }

  return true;
}

const tests = [
    "SELECT * FROM Users",
    "  SELECT * FROM Users  ",
    "-- comment\nSELECT * FROM Users",
    "SELECT * FROM Users;",
    "SELECT * FROM Users; DROP TABLE Users",
    "UPDATE Users SET name = 'foo'",
    "SELECT name FROM (SELECT name FROM Users) as t",
    "SELECT * FROM Users -- update is a keyword"
];

tests.forEach(t => {
    console.log(`Query: [${t.replace(/\n/g, '\\n')}] => Result: ${isValidSafeSQL(t)}`);
});
