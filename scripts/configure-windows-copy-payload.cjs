// Build-time correction: dictionary/filter options re-enable LZMA after -mx=0.
// Keep its differential package/blockmap path, but really store a Copy payload.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{createRequire}=require('node:module');
function copyPayloadSource(source){
 const before='storeOnly = false; // env var overrides "store" config';
 const after='storeOnly = compressionLevel === "0"; // zero must not re-enable the BCJ/LZMA filter';
 assert.equal(source.split(before).length,2,'Locked archive implementation changed: review before packaging');
 const dictionary='if (options.dictSize != null) {';
 assert.equal(source.split(dictionary).length,2,'Locked dictionary handling changed: review before packaging');
 return source.replace(before,after).replace(dictionary,'if (options.dictSize != null && !storeOnly) {');
}
function builderArchive(){
 const builderRequire=createRequire(require.resolve('electron-builder/package.json'));
 const entry=builderRequire.resolve('app-builder-lib/package.json');
 assert.equal(JSON.parse(fs.readFileSync(entry,'utf8')).version,'26.17.0','Review a new builder before applying this narrow correction');
 return path.join(path.dirname(entry),'out/targets/archive.js');
}
if(require.main===module){
 assert.equal(process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL,'0');
 const config=JSON.parse(fs.readFileSync('electron-builder.json','utf8'));
 assert.notEqual(config.nsis.differentialPackage,false,'Keep the existing blockmap updater protocol');
 const file=builderArchive(),original=fs.readFileSync(file,'utf8'),corrected=copyPayloadSource(original);
 fs.writeFileSync(file,corrected);
 const args=require(file).compute7zCompressArgs('7z',{compression:'normal',dictSize:1,solid:false,installTimeDecodable:true});
 assert.ok(args.includes('-mx=0')&&!args.some(a=>a.startsWith('-mf=')||a.startsWith('-md=')));
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const report={sourceSha:process.env.GITHUB_SHA,builderVersion:'26.17.0',method:'Copy',differentialUpdateFormatPreserved:true,builderArchiveBefore:hash(original),builderArchiveAfter:hash(corrected),archiveArgs:args};
 fs.writeFileSync('installer-payload-packaging.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
module.exports={copyPayloadSource,builderArchive};
