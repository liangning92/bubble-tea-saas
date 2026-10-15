const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),{spawnSync,execFileSync}=require('node:child_process');
const {copyPayloadSource,builderArchive}=require('../../scripts/configure-windows-copy-payload.cjs');
test('real differential archive uses Copy and preserves runtime bytes without mutating installed dependencies',()=>{
 const file=builderArchive(),source=fs.readFileSync(file,'utf8'),fixed=copyPayloadSource(source),loaded=new Module(file,module),prior=process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL;
 loaded.filename=file;loaded.paths=Module._nodeModulePaths(path.dirname(file));loaded._compile(fixed,file);
 const seven=['7z','7za','7zz'].find(cmd=>spawnSync(cmd,['i'],{stdio:'ignore'}).status===0);assert.ok(seven,'7-Zip required for the real package format regression');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pos-copy-payload-'));
 try{
  process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL='0';
  const args=loaded.exports.compute7zCompressArgs('7z',{compression:'normal',dictSize:1,solid:false,installTimeDecodable:true});
  fs.mkdirSync(path.join(root,'input'));const bytes=Buffer.concat([Buffer.from('MZ'),Buffer.alloc(1024*1024,71)]);
  fs.writeFileSync(path.join(root,'input','runtime.exe'),bytes);fs.writeFileSync(path.join(root,'input','rules.json'),'可离线经营30天');
  const archive=path.join(root,'payload.7z');execFileSync(seven,[...args,archive,'.'],{cwd:path.join(root,'input'),stdio:'ignore'});
  const listing=execFileSync(seven,['l','-slt',archive],{encoding:'utf8'});assert.match(listing,/Method = Copy/);assert.doesNotMatch(listing,/Method = .*LZMA/);
  execFileSync(seven,['x',archive,'-o'+path.join(root,'restored'),'-y'],{stdio:'ignore'});
  assert.deepEqual(fs.readFileSync(path.join(root,'restored','runtime.exe')),bytes);assert.equal(fs.readFileSync(path.join(root,'restored','rules.json'),'utf8'),'可离线经营30天');assert.equal(fs.readFileSync(file,'utf8'),source);
 }finally{if(prior===undefined)delete process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL;else process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL=prior;fs.rmSync(root,{recursive:true,force:true})}
});
test('an upstream builder change fails closed instead of silently packaging a slow or incompatible archive',()=>{assert.throws(()=>copyPayloadSource('different archive implementation'));});
