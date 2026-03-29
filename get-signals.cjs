const https = require('https');
const fs = require('fs');

const url = 'https://raw.githubusercontent.com/gcmsg/openclaw-trader/master/src/strategy/signals.ts';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Find the last signal and add our new signals before the closing brace
    // Find the pattern: the last signal before the closing }
    const lines = data.split('\n');
    console.log('Total lines:', lines.length);
    console.log('Last 5 lines:');
    for(let i = lines.length - 5; i < lines.length; i++) {
      console.log(i + ': ' + lines[i]);
    }
  });
}).on('error', (e) => {
  console.error('Error:', e.message);
});
