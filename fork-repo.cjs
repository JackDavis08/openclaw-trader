const https = require('https');

// Fork the repo
const options = {
  hostname: 'api.github.com',
  path: '/repos/gcmsg/openclaw-trader/forks',
  method: 'POST',
  headers: {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'OpenClaw-Agent'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.end();
