const fs = require('fs');
const files = ['app/(auth)/sign-in/page.tsx', 'app/(auth)/sign-up/page.tsx'];
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/dark:[a-zA-Z0-9_\-\/]+/g, '');
  content = content.replace(/ +/g, ' ');
  fs.writeFileSync(file, content);
});
console.log('Removed dark classes');
