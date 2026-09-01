const fs = require('fs');
const path = require('path');

const distDir = path.join(process.cwd(), 'dist');
const indexPath = path.join(distDir, 'index.html');
const notFoundPath = path.join(distDir, '404.html');
const noJekyllPath = path.join(distDir, '.nojekyll');

let html = fs.readFileSync(indexPath, 'utf8');

html = html
  .replace(/href="\/([^"]*)"/g, 'href="./$1"')
  .replace(/src="\/([^"]*)"/g, 'src="./$1"');

fs.writeFileSync(indexPath, html);
fs.writeFileSync(notFoundPath, html);
fs.writeFileSync(noJekyllPath, '');

console.log('Prepared dist for GitHub Pages');
