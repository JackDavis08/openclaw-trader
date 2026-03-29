const fs = require('fs');
const content = fs.readFileSync('status-server.ts', 'utf8');
const scriptStart = content.indexOf('<script>');
const scriptEnd = content.indexOf('</script>');
const script = content.substring(scriptStart + 8, scriptEnd);

try {
  new Function(script);
  console.log('JavaScript syntax: OK');
} catch(e) {
  console.log('JavaScript syntax ERROR:', e.message);
}
