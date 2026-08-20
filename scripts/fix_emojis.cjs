const fs = require('fs');
const path = require('path');

const filesToFix = [
  path.resolve(__dirname, '../server.cjs'),
  path.resolve(__dirname, '../routes/legacyRoutes.js')
];

function recoverMojibake(text) {
  // Common mojibake patterns: starts with ðŸ (F0 9F), âœ (E2 9C), â” (E2 94), âš (E2 9A), etc.
  // Actually, let's just find all substrings that look like they could be UTF-8 encoded as Latin-1
  // We can look for strings containing these specific starting characters: ð, â
  
  // This regex matches a sequence of characters that are typical in mojibake
  // specifically: characters in the range \x80-\xFF (extended ASCII) but since they are now UTF-8, 
  // they appear as characters like ð, Ÿ, Ž, Ÿ, ï, ¸, â, œ, …
  
  return text.replace(/([ðâ][\x80-\u024F]+)+/g, match => {
    try {
      // Attempt to convert the mojibake back to the original UTF-8 string
      const buf = Buffer.from(match, 'latin1');
      const recovered = buf.toString('utf8');
      
      // If the recovered string contains replacement characters (), it wasn't valid UTF-8
      if (recovered.includes('\uFFFD')) {
        return match;
      }
      
      // Since saving actual emojis in the file might cause them to be corrupted again 
      // by whatever tool the user is using, we will save them as unicode escapes!
      let escaped = '';
      for (let i = 0; i < recovered.length; i++) {
        const hex = recovered.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
        escaped += `\\u${hex}`;
      }
      return escaped;
    } catch (e) {
      return match;
    }
  });
}

filesToFix.forEach(file => {
  if (fs.existsSync(file)) {
    let originalContent = fs.readFileSync(file, 'utf8');
    
    // Some specific manual replacements for heavily corrupted strings that regex might miss
    let content = originalContent;
    const manualMap = {
      'ðŸŽŸï¸': '\\uD83C\\uDFAB\\uFE0F',
      'âœ…': '\\u2705',
      'ðŸ”„': '\\uD83D\\uDD04',
      'ðŸ“Š': '\\uD83D\\uDCCA',
      'ðŸš¨': '\\uD83D\\uDEA8',
      'ðŸ›’': '\\uD83D\\uDED2',
      'ðŸ‘¤': '\\uD83D\\uDC64',
      'ðŸ“…': '\\uD83D\\uDCC5',
      'ðŸ“ ': '\\uD83D\\u938D',
      'âš ï¸': '\\u26A0\\uFE0F',
      'â Œ': '\\u274C',
      'â„¹ï¸': '\\u2139\\uFE0F',
      'ðŸ”§': '\\uD83D\\uDD27',
      'ðŸ” ': '\\uD83D\\uDD0D',
      'ðŸ“ˆ': '\\uD83D\\uDCC8',
      'ðŸ“‰': '\\uD83D\\uDCC9',
      'â€¢': '\\u2022'
    };
    
    for (const [mojibake, escapeCode] of Object.entries(manualMap)) {
      content = content.split(mojibake).join(escapeCode);
    }
    
    // Also fix the corrupted box drawings â”â”â” (â” = E2 94)
    content = content.replace(/(â”)+/g, match => {
      // For each 'â”', it's supposed to be one '─' (\u2500)
      // Actually '─' is 3 bytes (E2 94 80), 'â”' is only 2 chars. 
      // The user showed "â”â”â”â”" which means the 3rd byte was dropped or swallowed.
      return '\\u2500'.repeat(match.length / 2); // approximate length
    });

    // Apply the automatic regex recovery for anything else missed
    content = recoverMojibake(content);

    // Apply the weird PowerShell console ones just in case they were actually saved that way
    const weirdMap = {
      'A,A"': '\\uD83D\\uDEA8',
      'A"?': '\\u2705',
      'A,?~A': '\\uD83D\\uDC64',
      'A,?TA3': '\\uD83D\\uDCB3',
      'A,A?A': '\\uD83D\\uDED2',
      'A,?o?': '\\uD83D\\uDCC5',
      'A,?o': '\\uD83D\\uDCCA',
      'A,?oA': '\\uD83D\\uDCE1',
      'A,??A\'': '\\uD83D\\uDD0C',
      'A,?AA_A,A?': '\\uD83D\\uDDA5\\uFE0F',
      'AAA_A,A?': '\\u26A0\\uFE0F',
      'A,??A?': '\\u23F3',
      'A,A A1': '\\uD83E\\uDDF9',
      'A,??': '\\u2139\\uFE0F',
      'A,,A_A,A?': '\\uD83C\\uDFAB\\uFE0F',
      'A??,': '' // Some kind of repeating artifact
    };
    for (const [weird, escapeCode] of Object.entries(weirdMap)) {
      content = content.split(weird).join(escapeCode);
    }
    
    if (content !== originalContent) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`[FIXED] Restored emojis in ${path.basename(file)}`);
    } else {
      console.log(`[OK] No mojibake found in ${path.basename(file)}`);
    }
  } else {
    console.log(`[SKIP] File not found: ${file}`);
  }
});
