const { build } = require('esbuild');
const { mkdir, copyFile } = require('fs/promises');
const path = require('path');

const outDir = path.resolve(__dirname, '../public');
const outFile = path.join(outDir, 'app.js');
const docsOutDir = path.resolve(__dirname, '../docs/public');
const docsOutFile = path.join(docsOutDir, 'app.js');

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
  try{
    await mkdir(docsOutDir, { recursive: true });
    await copyFile(outFile, docsOutFile);
  }catch(err){
    console.warn('Docs bundle copy failed:', err?.message || err);
  }
  console.log('Built', outFile);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
