const fs = require('fs');
const content = fs.readFileSync('status-server.ts', 'utf8');
const scriptStart = content.indexOf('<script>');
const scriptEnd = content.indexOf('</script>');
if (scriptStart !== -1 && scriptEnd !== -1) {
  const script = content.substring(scriptStart + 8, scriptEnd);
  console.log('Script length:', script.length);
  
  // Check for middle dot (0x00B7)
  let middleDotCount = 0;
  for (let i = 0; i < script.length; i++) {
    if (script.charCodeAt(i) === 0x00B7) middleDotCount++;
  }
  console.log('Middle dot (·) count:', middleDotCount);
  
  // Check for smart quotes
  let smartQuotes = 0;
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i);
    if (c === 0x2018 || c === 0x2019 || c === 0x201C || c === 0x201D) smartQuotes++;
  }
  console.log('Smart quotes count:', smartQuotes);
  
  // Check for backticks
  const backticks = (script.match(/`/g) || []).length;
  console.log('Backticks count:', backticks);
  
  // Count single and double quotes
  const singleQuotes = (script.match(/'/g) || []).length;
  const doubleQuotes = (script.match(/"/g) || []).length;
  console.log('Single quotes:', singleQuotes, 'Double quotes:', doubleQuotes);
  
  // Try to create function
  try {
    new Function(script);
    console.log('Function parse: OK');
  } catch(e) {
    console.log('Function parse ERROR:', e.message);
  }
}
