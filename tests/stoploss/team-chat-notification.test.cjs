const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'../..');
test('existing staff service worker opens the real team route with its consumed channel query',async()=>{
 const vm=require('node:vm'),handlers={},shown=[],opened=[],origin='https://synthetic.example',channel='00000000-0000-4000-8000-000000000001';
 vm.runInNewContext(fs.readFileSync(root+'/client-staff/public/employee-sw.js','utf8'),{self:{location:{origin},addEventListener:(type,fn)=>handlers[type]=fn,registration:{showNotification:async(title,options)=>shown.push({title,options})}},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},URL});
 let pending;const payload={title:'Pesan kerja baru / 新工作消息',id:'synthetic',url:'/team?channel='+channel};handlers.push({data:{json:()=>payload},waitUntil:p=>pending=p});await pending;
 assert.equal(shown[0].options.body,'Buka aplikasi untuk melihat detail.');assert.equal(shown[0].options.data.url,payload.url);
 handlers.notificationclick({notification:{close:()=>{},data:shown[0].options.data},waitUntil:p=>pending=p});await pending;assert.equal(opened[0],origin+payload.url);
 assert(fs.readFileSync(root+'/client-staff/src/App.tsx','utf8').includes('<Route path="/team"'));
 assert(fs.readFileSync(root+'/client-staff/src/components/StaffTeamConversation.tsx','utf8').includes("params.get('channel')"));
});
