import {existsSync} from 'fs'
import path from 'path'

/** Reuse a historical profile in place, including its pending Chromium orders. */
export function resolvePosDataProfile(current: string, appData: string, localAppData?: string): string {
  const hasData = (folder: string) => existsSync(path.join(folder,'data','dev.db')) || existsSync(path.join(folder,'IndexedDB'))
  const candidates = [...new Set([path.resolve(current),...[appData,localAppData].filter(Boolean).flatMap(root=>
    ['BTPS','bubble-tea-saas'].map(name=>path.resolve(root!,name)))])].filter(hasData)
  if (candidates.length > 1) throw Error('AMBIGUOUS_POS_DATA_DIRECTORIES')
  return candidates[0] || current
}
