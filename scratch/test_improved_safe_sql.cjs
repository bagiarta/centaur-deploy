
function isValidSafeSQL(script) {
  if (!script || typeof script !== 'string') return false;

  // Remove comments (single line -- and block /* */)
  const scriptWithoutComments = script
    .replace(/--.*$/gm, '') 
    .replace(/\/\*[\s\S]*?\*\//g, '') 
    .trim();

  if (!scriptWithoutComments) return false;

  const normalized = scriptWithoutComments.toUpperCase();

  // 1. Must start with SELECT
  if (!normalized.startsWith('SELECT')) return false;

  // 2. Allow trailing semicolon, but block internal semicolons (multiple statements)
  const withoutTrailingSemicolon = scriptWithoutComments.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) return false;

  // 3. Block mutation keywords
  const blockedKeywords = [
    'UPDATE', 'DELETE', 'INSERT', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE',
    'RECONFIGURE', 'EXEC', 'EXECUTE', 'MERGE', 'GRANT', 'REVOKE',
    'INTO', 'WRITETEXT', 'UPDATETEXT', 'DELETETEXT'
  ];

  for (const keyword of blockedKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(withoutTrailingSemicolon)) return false;
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
    "SELECT * FROM Users -- update is a keyword",
    "/* block\ncomment */ SELECT * FROM Users",
    "SELECT * FROM Users; -- comment after semicolon"
];

tests.forEach(t => {
    console.log(`Query: [${t.replace(/\n/g, '\\n')}] => Result: ${isValidSafeSQL(t)}`);
});
