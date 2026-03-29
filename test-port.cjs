const http = require('http');
const server = http.createServer((req, res) => { res.end('OK'); });
server.on('error', (e) => { console.error('ERROR:', e.code, e.message); process.exit(1); });
server.listen(9999, () => { console.log('Listening on 9999'); });
setTimeout(() => { console.log('Still alive after 5s'); process.exit(0); }, 5000);
