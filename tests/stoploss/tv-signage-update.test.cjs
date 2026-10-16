const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {manifest}=require('../../scripts/tv-update-manifest.cjs');
test('release manifest binds exact bytes, stable TV version and source',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tv-update-manifest-'));
 try{const file=path.join(dir,'Store-TV.apk');fs.writeFileSync(file,'apk bytes');const env={sourceSha:'a'.repeat(40),versionCode:8,versionName:'2.0.8'};const m=manifest(file,env);
 assert.equal(m.size,9);assert.equal(m.sha256,require('node:crypto').createHash('sha256').update('apk bytes').digest('hex'));assert.equal(m.url,'https://github.com/liangning92/bubble-tea-saas/releases/download/tv-v2.0.8/Store-TV.apk');
 for(const bad of [{versionCode:0},{versionCode:1.5},{versionName:'2.0.9'},{sourceSha:'master'}])assert.throws(()=>manifest(file,{...env,...bad}));
 fs.truncateSync(file,26*1024*1024);assert.throws(()=>manifest(file,env));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native update policy rejects downgrade, foreign signer, package substitution and unsafe downloads',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tv-update-policy-'));
 const javaRoot=path.resolve('tv-android-app/app/src/main/java/com/youme/tv');
 try{
 fs.writeFileSync(path.join(dir,'UpdatePolicyTest.java'),`package com.youme.tv;
 public class UpdatePolicyTest {
   static void yes(boolean value){if(!value)throw new AssertionError();}
   static void rejects(Runnable call){try{call.run();}catch(IllegalArgumentException e){return;}throw new AssertionError("Expected rejection");}
   public static void main(String[] args) throws Exception {
     java.io.File file=java.io.File.createTempFile("tv-digest-test-",".apk");
     try {
       java.nio.file.Files.write(file.toPath(),new byte[]{97,98,99});
       UpdatePolicy.verifyFile(file,3,"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
       try{UpdatePolicy.verifyFile(file,4,"bad");throw new AssertionError();}catch(java.io.IOException expected){}
       try{UpdatePolicy.verifyFile(file,3,"bad");throw new AssertionError();}catch(java.io.IOException expected){}
       java.nio.file.Files.write(file.toPath(),new byte[]{97,98,100});
       try{UpdatePolicy.verifyFile(file,3,"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");throw new AssertionError();}catch(java.io.IOException expected){}
     } finally {file.delete();}
     yes(UpdatePolicy.version("tv-v2.0.8")==8);
     for(String bad:new String[]{"v2026.10.8","tv-v2.0.0","tv-v2.0.8-beta","tv-v2.0.08","tv-v2.0.9999999999",""})yes(UpdatePolicy.version(bad)==-1);
     for(String good:new String[]{"https://api.github.com/repos/x", "https://github.com/x", "https://release-assets.githubusercontent.com/x?token=a"})yes(UpdatePolicy.allowedUrl(good));
     for(String bad:new String[]{"http://github.com/x","https://github.com.evil.test/x","https://user@github.com/x","https://github.com:444/x","file:///tmp/x","https://localhost/x","https://github.com/x#hash"})yes(!UpdatePolicy.allowedUrl(bad));
     String sha=new String(new char[64]).replace('\0','a'),source=new String(new char[40]).replace('\0','b');
     UpdatePolicy.metadata("tv-v2.0.8",8,"2.0.8",sha,100,source,UpdatePolicy.DOWNLOADS+"tv-v2.0.8/Store-TV.apk");
     rejects(()->UpdatePolicy.metadata("tv-v2.0.8",9,"2.0.8",sha,100,source,UpdatePolicy.DOWNLOADS+"tv-v2.0.8/Store-TV.apk"));
     rejects(()->UpdatePolicy.metadata("tv-v2.0.8",8,"2.0.8",sha,0,source,UpdatePolicy.DOWNLOADS+"tv-v2.0.8/Store-TV.apk"));
     rejects(()->UpdatePolicy.metadata("tv-v2.0.8",8,"2.0.8",sha,UpdatePolicy.MAX_APK_BYTES+1,source,UpdatePolicy.DOWNLOADS+"tv-v2.0.8/Store-TV.apk"));
     rejects(()->UpdatePolicy.metadata("tv-v2.0.8",8,"2.0.8","bad",100,source,UpdatePolicy.DOWNLOADS+"tv-v2.0.8/Store-TV.apk"));
     rejects(()->UpdatePolicy.metadata("tv-v2.0.8",8,"2.0.8",sha,100,source,"https://evil.test/Store-TV.apk"));
     UpdatePolicy.archive("com.youme.tv","com.youme.tv",7,8,8,new String[]{"sig"},new String[]{"sig"});
     rejects(()->UpdatePolicy.archive("com.youme.tv","other",7,8,8,new String[]{"sig"},new String[]{"sig"}));
     rejects(()->UpdatePolicy.archive("com.youme.tv","com.youme.tv",8,8,8,new String[]{"sig"},new String[]{"sig"}));
     rejects(()->UpdatePolicy.archive("com.youme.tv","com.youme.tv",8,7,7,new String[]{"sig"},new String[]{"sig"}));
     rejects(()->UpdatePolicy.archive("com.youme.tv","com.youme.tv",7,8,9,new String[]{"sig"},new String[]{"sig"}));
     rejects(()->UpdatePolicy.archive("com.youme.tv","com.youme.tv",7,8,8,new String[]{"sig"},new String[]{"foreign"}));
     rejects(()->UpdatePolicy.archive("com.youme.tv","com.youme.tv",7,8,8,new String[]{},new String[]{}));
   }
 }`);
 const bin=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin'):'';
 execFileSync(bin?path.join(bin,'javac'):'javac',['-d',dir,path.join(javaRoot,'UpdatePolicy.java'),path.join(dir,'UpdatePolicyTest.java')],{stdio:'pipe'});
 execFileSync(bin?path.join(bin,'java'):'java',['-cp',dir,'com.youme.tv.UpdatePolicyTest'],{stdio:'pipe'});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
