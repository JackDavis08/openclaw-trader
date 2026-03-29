const http = require('http');
const fs = require('fs');

const content = fs.readFileSync('status-server.ts', 'utf8');
const scriptStart = content.indexOf('<script>');
const scriptEnd = content.indexOf('</script>');
const originalScript = content.substring(scriptStart + 8, scriptEnd);

http.get('http://localhost:9999/', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const browserScriptStart = data.indexOf('<script>');
    const browserScriptEnd = data.indexOf('</script>');
    const browserScript = data.substring(browserScriptStart + 8, browserScriptEnd);
    
    console.log('Original script length:', originalScript.length);
    console.log('Browser script length:', browserScript.length);
    console.log('Difference:', originalScript.length - browserScript.length);
    
    // Find first difference
    let firstDiff = -1;
    for (let i = 0; i < Math.min(originalScript.length, browserScript.length); i++) {
      if (originalScript[i] !== browserScript[i]) {
        firstDiff = i;
        console.log('First difference at position:', i);
        console.log('Original char:', JSON.stringify(originalScript[i]), 'Code:', originalScript.charCodeAt(i).toString(16));
        console.log('Browser char:', JSON.stringify(browserScript[i]), 'Code:', browserScript.charCodeAt(i).toString(16));
        console.log('Context original:', JSON.stringify(originalScript.substring(i-20, i+20)));
        console.log('Context browser:', JSON.stringify(browserScript.substring(i-20, i+20)));
        break;
      }
    }
    
    if (firstDiff === -1) {
      console.log('Lengths differ but same content up to min length');
      console.log('Extra chars at end of original:', JSON.stringify(originalScript.substring(browserScript.length)));
    }
  });
}).on('error', console.error);
