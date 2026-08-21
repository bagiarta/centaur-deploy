const fs = require('fs');

const transformScript = fs.readFileSync('transform_devices.js', 'utf8');

// Extract the newScript variable from the old file by isolating the string
let startIndex = transformScript.indexOf('const newScript = `') + 19;
let endIndex = transformScript.indexOf('`;\n\n// 1. Replace the old script with new script');
let extractedScript = transformScript.substring(startIndex, endIndex);

let pageContent = fs.readFileSync('src/pages/DevicesPage.tsx', 'utf8');

// The <pre> block
let preRegex = /<pre className="text-\[9\.5px\].*?<\/pre>/s;
pageContent = pageContent.replace(preRegex, `<pre className="text-[9px] font-mono bg-background text-foreground p-3.5 pr-14 rounded-md border border-border whitespace-pre-wrap break-words h-[400px] overflow-y-auto">\n{\`\${newScript}\`}\n                  </pre>`);

// The onClick button
let btnRegex = /onClick=\{\(\) => navigator\.clipboard\.writeText\(\`.*?\`\)\}/s;
pageContent = pageContent.replace(btnRegex, 'onClick={() => navigator.clipboard.writeText(newScript)}');

// Insert newScript definition at the top of the component
let componentDefRegex = /export default function DevicesPage\(\) \{/;
let escapedScript = extractedScript.replace(/\\/g, "\\\\").replace(/\`/g, "\\`").replace(/\$/g, "\\$");

let replacement = `const newScript = \`${escapedScript}\`;\n\nexport default function DevicesPage() {`;
pageContent = pageContent.replace(componentDefRegex, replacement);

fs.writeFileSync('src/pages/DevicesPage.tsx', pageContent);
console.log('Successfully updated DevicesPage.tsx with new script block');
