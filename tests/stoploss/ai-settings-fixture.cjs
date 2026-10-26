// Read-only fixtures for the additional Agent and memory panels on the settings page.
// Keep model/permission tests isolated from real runtimes and provider credentials.
module.exports=function aiSettingsFixture(path){
 if(path==='/api/team/ai/agent-memory')return {memories:[],experiences:[]};
 if(path==='/api/team/ai/agent-settings')return {settings:{version:1,enabled:false,agentName:'Synthetic Hermes',agentOrigin:'',pdcaPilotEnabled:false,employeeBridgeEnabled:false,allChannelsAllowed:false,memoryEnabled:true,learningEnabled:true,expiresAt:null,taskTimeoutMinutes:15,requireHumanReview:true,permissions:{}},systemState:{pilotState:'disabled',employeeBridgeConfigured:false,runtimeAvailable:false,hostOrigin:'',capabilities:[]}};
};
