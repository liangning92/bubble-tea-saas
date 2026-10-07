import { afterEach, expect, jest, test } from '@jest/globals'
import { startOfTodayJakarta } from '../src/utils/dateUtils'
afterEach(()=>jest.useRealTimers())
test.each(['2026-10-05T18:00:00Z','2026-12-31T23:59:00Z','2026-10-05T02:00:00Z'])('Jakarta business day begins at 17:00 UTC on prior calendar date (%s)',time=>{
  jest.useFakeTimers().setSystemTime(new Date(time))
  const expected={'2026-10-05T18:00:00Z':'2026-10-05T17:00:00.000Z','2026-12-31T23:59:00Z':'2026-12-31T17:00:00.000Z','2026-10-05T02:00:00Z':'2026-10-04T17:00:00.000Z'}[time]
  expect(startOfTodayJakarta().toISOString()).toBe(expected)
})
