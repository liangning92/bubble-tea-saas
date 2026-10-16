// Generate the update manifest from the exact APK bytes copied to the release.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function manifest(apk,{sourceSha,versionCode,versionName}){
 const code=Number(versionCode),size=fs.statSync(apk).size;
 if(!/^[a-f0-9]{40}$/.test(sourceSha||'')||!Number.isSafeInteger(code)||code<1||code>999999999||versionName!==`2.0.${code}`||size<1||size>25*1024*1024)throw Error('Invalid TV release metadata');
 return {schemaVersion:1,sourceSha,versionCode:code,versionName,minSdk:21,size,sha256:crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),url:`https://github.com/liangning92/bubble-tea-saas/releases/download/tv-v${versionName}/Store-TV.apk`};
}
module.exports={manifest};
if(require.main===module){const apk=process.argv[2];const value=manifest(apk,{sourceSha:process.env.SOURCE_SHA,versionCode:process.env.TV_VERSION_CODE,versionName:process.env.TV_VERSION_NAME});fs.writeFileSync(path.join(path.dirname(apk),'manifest.json'),JSON.stringify(value,null,2)+'\n');}
