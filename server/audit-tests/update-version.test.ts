import {expect, test} from '@jest/globals'
import {isNewerUpdate} from '../../client-pos/src/utils/updateVersion'
test.each([
  ['2026.10.310','2026.10.309',true],
  ['2026.10.309','2026.10.309',false],
  ['2026.10.308','2026.10.309',false],
  ['2026.10.10','2026.10.9',true],
  ['2026.10.309','2026.10.309.0',false],
  ['bad','2026.10.309',false],
  [undefined,'2026.10.309',false],
  ['2026.10.309',undefined,false]
])('update %s compared with installed %s is %s', (latest,current,expected) => expect(isNewerUpdate(latest,current)).toBe(expected))
