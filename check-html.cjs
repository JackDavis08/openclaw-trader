const http = require('http');
http.get('http://localhost:9999/', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    // Extract script
    const scriptStart = data.indexOf('<script>');
    const scriptEnd = data.indexOf('</script>');
    if (scriptStart !== -1 && scriptEnd !== -1) {
      const script = data.substring(scriptStart + 8, scriptEnd);
      console.log('Script length in browser response:', script.length);
      
      // Check middle dots
      let middleDots = [];
      for (let i = 0; i < script.length; i++) {
        if (script.charCodeAt(i) === 0x00B7) {
          middleDots.push(i);
        }
      }
      console.log('Middle dot positions in browser script:', middleDots);
      
      // Check for any obvious syntax issues around middle dots
      if (middleDots.length > 0) {
        middleDots.forEach(pos => {
          const context = script.substring(Math.max(0, pos-20), pos+20);
          console.log('Context around middle dot:', JSON.stringify(context));
        });
      }
      
      // Try to parse
      try {
        new Function(script);
        console.log('Browser script parse: OK');
      } catch(e) {
        console.log('Browser script parse ERROR:', e.message);
      }
    }
  });
}).on('error', console.error);
