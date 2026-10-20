const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),esbuild=require(root+'/node_modules/esbuild');
test('real chat component distinguishes ongoing automatic authorization from human approval in three languages',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'routine-ui-')),file=path.join(dir,'fixture.cjs');
 try{
  esbuild.buildSync({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import{TeamChatMessages}from './shared/TeamChatMessages';import{teamWorkCopy}from './shared/teamWorkCopy';
  const now=new Date().toISOString(),base={authorId:'owner',authorName:'Synthetic owner',text:'Synthetic routine reply',files:[],createdAt:now};
  const messages=[{...base,id:'human',seq:1,ai:{model:'Synthetic model',approvedBy:'owner'}},{...base,id:'automatic',seq:2,ai:{model:'Synthetic model',authorizedBy:'owner',routineAuthorization:{jobId:'synthetic',sourceSeq:1,policyHash:'synthetic',policyVersion:1,epoch:1,replyCode:'acknowledge'}}}];
  module.exports=['zh','en','id'].map(language=>({language,html:renderToStaticMarkup(<TeamChatMessages messages={messages} client={{}} staffId='employee' channelId='synthetic' query='' language={language}>{null}</TeamChatMessages>),copy:teamWorkCopy(language)}));`,resolveDir:root,loader:'tsx'},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},bundle:true,platform:'node',format:'cjs',outfile:file,logLevel:'silent'});
  const rendered=require(file);for(const r of rendered){assert(r.html.includes(r.copy.aiRoutine));assert(r.html.includes(r.copy.aiApproved));const auto=r.html.slice(r.html.indexOf('id="team-message-2"'));assert(auto.includes(r.copy.aiRoutine));assert(!auto.includes(r.copy.aiApproved))}
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
