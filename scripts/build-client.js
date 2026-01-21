const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, '../src/client/bundle.ts');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/client/index.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2021',
  jsxImportSource: 'hono/jsx/dom',
  jsx: 'automatic',
  write: false,
  outfile: 'bundle.js',
}).outputFiles.forEach((file) => {
  const js = file.text;
  const tsContent = `// Auto-generated - do not edit directly
export const clientScript = ${JSON.stringify(js)};
`;
  fs.writeFileSync(outPath, tsContent);
  console.log('✓ Client bundle compiled to', outPath);
});
