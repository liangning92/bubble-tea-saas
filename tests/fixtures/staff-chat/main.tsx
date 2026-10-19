import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link } from 'react-router-dom'
import { type TeamClient } from '../../../shared/TeamCommunication'
import { StaffTeamConversation } from '../../../client-staff/src/components/StaffTeamConversation'
import { BottomNav } from '../../../client-staff/src/components/BottomNav'
import '../../../client-staff/src/i18n'
import '../../../client-staff/src/index.css'

const params = new URLSearchParams(location.search)
const nativeViewport = window.visualViewport
let keyboard = false
if (params.has('keyboardtest') && nativeViewport) {
 const testViewport = new EventTarget()
 for (const key of ['height', 'width', 'offsetTop', 'scale'] as const) Object.defineProperty(testViewport, key, { get: () => key === 'height' && keyboard ? 380 : key === 'offsetTop' && keyboard ? 45 : nativeViewport[key] })
 Object.defineProperty(window, 'visualViewport', { value: testViewport, configurable: true })
 window.addEventListener('resize', () => testViewport.dispatchEvent(new Event('resize')))
}
const channel = { id: 'synthetic-chat', title: '合成测试频道 · 门店工作沟通 · 长标题不会挤掉操作入口', kind: 'group', ownerId: 'qa-a', lastSeq: 24, version: 1, archived: false, members: [{ staffId: 'qa-a', fromSeq: 1 }, { staffId: 'qa-b', fromSeq: 1 }], member: true, canEdit: false, canAudit: false, unread: 0, round: null }
const messages = Array.from({ length: 24 }, (_, i) => ({ id: `qa-${i+1}`, requestId: `fixture-${i+1}`, seq: i+1, authorId: i % 2 ? 'qa-b' : 'qa-a', authorName: i % 2 ? '合成员工' : '合成主管', text: `合成短消息 ${i+1}：今天工作顺利。`, files: [] as string[], createdAt: `2026-10-19T08:${String(i).padStart(2, '0')}:00Z` }))
if (params.get('content') === 'long') { messages[22].text = '长消息与长网址 https://example.invalid/' + 'longtext'.repeat(80) + '\n' + '合成长消息，不包含真实员工资料。'.repeat(30); messages[23].files = ['synthetic-image'] }
const client: TeamClient = {
 current: () => true,
 request: async (method, url) => {
  if (params.get('content') === 'error' && url.includes('/messages?')) throw Error('SYNTHETIC_NETWORK_ERROR')
  if (url === '/team/channels') return [channel, { ...channel, id: 'synthetic-other', title: '另一个合成会话' }]
  if (url === '/team/directory') return [{ id: 'qa-a', name: '合成主管' }, { id: 'qa-b', name: '合成员工' }]
  if (url === '/team/capabilities') return { manage: false, audit: false }
  if (url.includes('/messages?')) return { channel, canEdit: false, cursor: 24, messages: url.includes('after=0') && params.get('content') !== 'empty' ? messages : [], hasMore: false }
  if (url.endsWith('/read') && method === 'put') return {}
  if (url.endsWith('/receipts')) return [{ staffId: 'qa-a', seq: 24 }, { staffId: 'qa-b', seq: 24 }]
  if (url.endsWith('/minutes') || url.endsWith('/tasks')) return []
  throw Error('SYNTHETIC_UNEXPECTED_REQUEST')
 },
 upload: async () => { throw Error('SYNTHETIC_UPLOAD_DISABLED') },
 download: async () => {
  const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#c9e5d4'; ctx.fillRect(0,0,800,600); ctx.fillStyle = '#20372e'; ctx.font = '36px sans-serif'; ctx.fillText('SYNTHETIC IMAGE 800 x 600',80,300)
  return await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'))
 }
}
function Fixture() {
 const [open, setOpen] = useState(false)
 return <><div className="employee-shell" style={params.has('safe') ? { '--team-safe-bottom': '34px' } as React.CSSProperties : undefined}><Link to="/" className="employee-parent-link">← 返回</Link><StaffTeamConversation client={client} scope="synthetic-layout-only" staffId="qa-b" language={params.get('lang') || 'zh'} /><BottomNav /></div>
 {params.has('keyboardtest') && <div style={{ position: 'fixed', zIndex: 100, bottom: 20, left: 20, padding: 12, background: '#e4e5e8' }}><button onClick={() => { keyboard = !keyboard; setOpen(keyboard); document.querySelector<HTMLTextAreaElement>('.team-composer textarea')?.focus(); window.visualViewport?.dispatchEvent(new Event('resize')) }}>{open ? '关闭模拟键盘' : '打开模拟键盘'}</button><p>visualViewport 380px / offsetTop 45px · 合成测试</p></div>}
 {params.has('phototest') && <button style={{ position: 'fixed', top: 80, left: 10, zIndex: 100, background: '#fff' }} onClick={async () => {
  const blob = await client.download('/synthetic-only'), input = document.querySelector<HTMLInputElement>('input[type=file]')!
  const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'synthetic-photo.png', { type: 'image/png' })); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }))
 }}>选择页面内合成照片</button>}</>
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Fixture /></BrowserRouter>)
