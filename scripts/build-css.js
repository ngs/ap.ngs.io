const sass = require('sass');
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../src/styles/main.scss');
const outPath = path.join(__dirname, '../src/styles/css.ts');

const result = sass.compile(srcPath, {
  style: 'compressed',
});

const tsContent = `// Auto-generated from main.scss - do not edit directly
export const css = ${JSON.stringify(result.css)};
`;

fs.writeFileSync(outPath, tsContent);
console.log('✓ SCSS compiled to', outPath);
