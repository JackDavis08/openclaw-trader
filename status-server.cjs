const http = require('http');
const fs = require('fs');
const log = (msg) => { fs.appendFileSync('C:\\Users\\DELL\\openclaw-trader\\server.log', new Date().toISOString() + ' ' + msg + '\n'); console.log(msg); };
log('Starting server');
const server = http.createServer((req, res) => { log('Request: ' + req.url); res.end('OK'); });
server.on('error', (e) => { log('Server error: ' + e.code + ' ' + e.message); });
server.on('listening', () => {
  const addr = server.address();
  log('Listening event: ' + JSON.stringify(addr));
});
server.on('close', () => { log('Server closed'); });
server.on('error', (e) => { log('Server error: ' + e.code); });
server.listen(9999, '0.0.0.0', () => {
  const addr = server.address();
  log('Listen callback: ' + JSON.stringify(addr));
});
log('After listen call');
setInterval(() => { log('Tick'); }, 5000);
