const { build } = require('esbuild');
const { mkdir } = require('fs/promises');
const path = require('path');

const outDir = path.resolve(__dirname, '../public');
const outFile = path.join(outDir, 'app.js');

async function main(){
  await mkdir(outDir, { recursive: true });
  await build({
    entryPoints: [path.resolve(__dirname, '../src/app.js')],
    bundle: true,
    format: 'iife',
    outfile: outFile,
    sourcemap: false,
    target: 'es2018'
  });
  console.log('Built', outFile);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
