const fs=require('node:fs'),path=require('node:path');
const from=path.resolve('server/public/tv'),to=path.resolve('tv-android-app/app/src/main/assets/tv');
fs.mkdirSync(to,{recursive:true});for(const file of ['index.html','player.js','player.css','build.js'])fs.copyFileSync(path.join(from,file),path.join(to,file));
