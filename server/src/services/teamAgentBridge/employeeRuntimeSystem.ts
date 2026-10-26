import { EMPLOYEE_RUNTIME_INSTRUCTION, LEGACY_EMPLOYEE_RUNTIME_INSTRUCTION } from './employeeRuntimeContract'
import { join } from 'path'
import { createHash } from 'crypto'
const digest=(s:string)=>createHash('sha256').update(s).digest('hex')
/** Replace ONLY host-issued per-execution filesystem locations and strictly
 * formatted clock/OS metadata. All remaining prompt bytes must match the reviewed
 * pinned Hermes system template hash, including the operational instruction. */
export function employeeSystemTemplateHash(messages: unknown, root: string, executionId: string): string {
  if(!Array.isArray(messages)||messages.length!==1||messages[0]?.role!=='system'||Object.keys(messages[0]).some(k=>!['role','content'].includes(k))||typeof messages[0].content!=='string')throw Error('EMPLOYEE_SYSTEM_ASSEMBLY_INVALID')
  const execution=join(root,'executions',digest(executionId)),home=join(root,'homes',digest(executionId))
  // Two exact server-authored instruction versions share the reviewed template.
  // No user-authored text or arbitrary prompt region is removed.
  let content=messages[0].content.split(EMPLOYEE_RUNTIME_INSTRUCTION).join(LEGACY_EMPLOYEE_RUNTIME_INSTRUCTION)
  // Longest exact path first; arbitrary paths and any additional context survive
  // and therefore fail the pinned hash. No regex that removes unknown prose.
  for(const [path,label]of[[join(execution,'profiles','employee_work'),'$PROFILE'],[home,'$HOME'],[execution,'$EXECUTION']])content=content.split(path).join(label)
  content=content.replace(/^Conversation started: (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4} \([A-Za-z0-9_+:/, -]+\)$/m,'Conversation started: $CLOCK')
  content=content.replace(/^Host: (?:macOS|Linux|Windows) \([A-Za-z0-9_.+ -]+\)$/m,'Host: $OS')
  return digest(JSON.stringify([{role:'system',content}]))
}
