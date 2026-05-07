const fs = require('fs');
const content = fs.readFileSync('server.cjs', 'utf-8');

const lines = content.split('\n');
const routes = [];
lines.forEach((line, i) => {
  if (line.trim().startsWith('app.get(') || line.trim().startsWith('app.post(') || line.trim().startsWith('app.put(') || line.trim().startsWith('app.delete(')) {
    routes.push(`Line ${i+1}: ${line.trim().split('{')[0]}`);
  }
});
fs.writeFileSync('route_list.txt', routes.join('\n'));
