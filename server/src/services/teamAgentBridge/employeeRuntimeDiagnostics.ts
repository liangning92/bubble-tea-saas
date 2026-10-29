/** Administrator-only projection. Never return prompts, tool arguments, receipts or credentials. */
export function employeeExecutionDiagnostic(value:string,updatedAt:Date|string) {
  try {
    const s=JSON.parse(value)
    if(!['input','response','tools','final','complete','unknown'].includes(s.phase))return null
    return {phase:s.phase,turn:Number.isSafeInteger(s.turn)?s.turn:0,
      inputs:Array.isArray(s.inputs)?s.inputs.length:0,responses:Array.isArray(s.responses)?s.responses.length:0,tools:Array.isArray(s.tools)?s.tools.length:0,
      faultCode:typeof s.fault?.code==='string'&&/^[A-Z0-9_]{1,100}$/.test(s.fault.code)?s.fault.code:null,
      updatedAt:new Date(updatedAt).toISOString()}
  }catch{return null}
}
