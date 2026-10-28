import { createHash } from 'crypto'
import type { BridgeGrant } from './contract'

/** Adding another authorized conversation must not interrupt an existing turn.
 * All executable authority and revisions remain exact; removals are revocations. */
export function employeeGrantAuthority(grant: BridgeGrant) {
  return createHash('sha256').update(JSON.stringify({ ...grant, staffIds: undefined, channelIds: undefined })).digest('hex')
}
export function employeeGrantExtends(previous: BridgeGrant, current: BridgeGrant) {
  return employeeGrantAuthority(previous) === employeeGrantAuthority(current) &&
    previous.staffIds.every(id => current.staffIds.includes(id)) && previous.channelIds.every(id => current.channelIds.includes(id))
}
