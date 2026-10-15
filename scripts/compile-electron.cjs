const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
execFileSync(process.execPath,[require.resolve('typescript/bin/tsc'),'-p',path.join(root,'client-pos/tsconfig.electron.json')],{cwd:root,stdio:'inherit'});
// Compiled main modules are CommonJS even though the web client uses ESM.
fs.writeFileSync(path.join(root,'client-pos/dist-electron/package.json'),JSON.stringify({type:'commonjs'}));
