import { test, expect, jest } from '@jest/globals'
jest.mock('@modelcontextprotocol/server', () => ({ fromJsonSchema: (schema: unknown) => schema }))
import { createAgentTaskTools } from '../src/services/externalMcp/agentTools'

test('tool directory intersects role with the resolved token scopes', () => {
  function names(role: 'manager' | 'executor', scopes: string[]) {
    const found: string[] = []
    createAgentTaskTools({ registerTool: (name: string) => found.push(name) } as any, {} as any,
      async () => { throw Error('DIRECTORY_MUST_NOT_EXECUTE') }, role, scopes)
    return found
  }
  expect(names('manager', ['management.read'])).toEqual(['store_task_get'])
  expect(names('executor', ['executor.claim'])).toEqual(['store_task_get', 'store_task_claim'])
  expect(names('manager', ['executor.report'])).toEqual([])
  expect(names('executor', ['management.review'])).toEqual([])
  expect(names('executor', ['executor.claim', 'executor.evidence', 'executor.report'])).toEqual([
    'store_task_get', 'store_task_claim', 'store_task_read_stock_evidence', 'store_task_report'])
})
