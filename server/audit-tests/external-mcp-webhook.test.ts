import { describe, test, expect, jest, afterEach } from '@jest/globals'
const dns = require('dns/promises'), https = require('https')
import { EventEmitter } from 'events'
import { publicHttpsPost } from '../src/services/externalMcp/webhookDelivery'

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })
describe('webhook absolute deadline without network', () => {
  test('DNS that never settles cannot hold the callback operation beyond ten seconds', async () => {
    jest.useFakeTimers()
    jest.spyOn(dns, 'lookup').mockImplementation((() => new Promise(() => {})) as any)
    const wire = jest.spyOn(https, 'request').mockImplementation((() => { throw Error('unexpected network') }) as any)
    const result = publicHttpsPost('https://callback.example.com/event', '{}', {})
    const rejected = expect(result).rejects.toThrow('MCP_CALLBACK_TIMEOUT')
    await jest.advanceTimersByTimeAsync(10001); await rejected; expect(wire).not.toHaveBeenCalled()
  })
  test('a peer trickling bytes is aborted by the absolute deadline, with DNS pinned and TLS hostname retained', async () => {
    jest.useFakeTimers()
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any)
    let requestOptions: any, response: EventEmitter
    const req = new EventEmitter() as any; req.end = () => {}
    jest.spyOn(https, 'request').mockImplementation(((url: URL, opts: any, callback: any) => {
      requestOptions = opts; response = new EventEmitter(); (response as any).statusCode = 200
      callback(response); return req
    }) as any)
    const result = publicHttpsPost('https://callback.example.com/event', '{}', {}), rejected = expect(result).rejects.toThrow('MCP_CALLBACK_TIMEOUT')
    await jest.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 9; i++) { response!.emit('data', Buffer.from(' ')); await jest.advanceTimersByTimeAsync(1000) }
    expect(requestOptions.servername).toBe('callback.example.com'); expect(requestOptions.agent).toBe(false)
    requestOptions.lookup('callback.example.com', {}, (_error: any, address: string) => expect(address).toBe('8.8.8.8'))
    await jest.advanceTimersByTimeAsync(1001); await rejected; expect(requestOptions.signal.aborted).toBe(true)
  })
  test('mixed public/private DNS answers reject before any connection', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }] as any)
    const wire = jest.spyOn(https, 'request').mockImplementation((() => { throw Error('unexpected network') }) as any)
    await expect(publicHttpsPost('https://callback.example.com/event', '{}', {})).rejects.toThrow('MCP_CALLBACK_ADDRESS_BLOCKED'); expect(wire).not.toHaveBeenCalled()
  })
})
