import { useEffect, useRef, useState } from 'react'
import type { TeamClient } from '../../../../shared/TeamCommunication'
import type { TeamTask } from '../../../../shared/TeamTasks'
import { canSubmitOwnerDecision, ownerDecisionExpired, readWorkflowCommand, workflowBase, workflowCopy, workflowError, type WorkflowAction, type WorkflowCommand, type WorkflowJobView } from './teamWorkflowUi'

const button = 'rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50'
const field = 'mt-1 w-full min-w-0 rounded-lg border bg-white p-2 text-sm'
export function TeamWorkflowPanel({ client, channelId, scope, staffId, language, directory, tasks, onChanged }: {
  client: Pick<TeamClient, 'request' | 'current'>; channelId: string; scope: string; staffId: string; language: string
  directory: { id: string; name: string }[]; tasks: TeamTask[]; onChanged: () => void
}) {
  const c = workflowCopy(language), base = workflowBase(channelId), storage = `team-workflow:${scope}:${channelId}`
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('workflow') === '1'), [jobs, setJobs] = useState<WorkflowJobView[]>([]), [pages, setPages] = useState(1), [more, setMore] = useState(false)
  const [managementMode,setManagementMode] = useState(false)
  const [takeover,setTakeover] = useState<{byStaffId:string}|null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [journalBlocked, setJournalBlocked] = useState(false)
  const [pending, setPending] = useState<WorkflowCommand | null>(null), [editing, setEditing] = useState<{ job: WorkflowJobView; action: WorkflowAction } | null>(null)
  const [note, setNote] = useState(''), [approved, setApproved] = useState(false), [charge, setCharge] = useState(false), [reply, setReply] = useState('')
  const [taskText, setTaskText] = useState(''), [evidence, setEvidence] = useState(''), [criteria, setCriteria] = useState('')
  const [acceptBy, setAcceptBy] = useState(''), [deadline, setDeadline] = useState('')
  const [report, setReport] = useState<{ text: string; cursor: number; hasMore: boolean } | null>(null)
  const alive = useRef(true), reading = useRef(false), sending = useRef(false), epoch = useRef(0)
  const current = () => alive.current && client.current(), name = (id: string) => directory.find(d => d.id === id)?.name || id
  const label = (key: string) => (c as Record<string, string>)[key] || key
  const date = (value: string | number) => new Date(value).toLocaleString(language)
  const reconfirming = !!editing && editing.action === 'owner_decision' && ownerDecisionExpired(editing.job)
  const actionLabel = (job: WorkflowJobView, action: WorkflowAction) => action === 'owner_decision' && ownerDecisionExpired(job) ? c.decisionReconfirm : c[action]
  const changed = !!editing && jobs.find(j => j.id === editing.job.id)?.version !== editing.job.version
  useEffect(() => {
    alive.current = true
    try { setPending(readWorkflowCommand(sessionStorage, storage, channelId)) } catch { setJournalBlocked(true); setError(c.journal) }
    return () => { alive.current = false; epoch.current++ }
  }, [client, storage])
  async function load(count = pages) {
    if (reading.current || !current()) return
    reading.current = true; const token = epoch.current
    try {
      let cursor = 0, hasMore = false; const records: WorkflowJobView[] = []
      for (let page = 0; page < count; page++) {
        const result = await client.request('get', `${base}/jobs?after=${cursor}`)
        if (!current() || token !== epoch.current) return
        if(page===0){setTakeover(result.takeover||null);setManagementMode(!!result.management || result.jobs.some((job:WorkflowJobView)=>!!job.management))}
        records.push(...result.jobs); hasMore = result.hasMore
        if (!hasMore) break
        if (!Number.isSafeInteger(result.cursor) || result.cursor <= cursor) throw Error('INVALID_CURSOR')
        cursor = result.cursor
      }
      setJobs(records); setMore(hasMore); setPages(count)
    } catch (e) { if (current() && token === epoch.current) setError(workflowError(language, e)) }
    finally { reading.current = false }
  }
  useEffect(() => {
    if (!open) return
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5000)
    return () => clearInterval(timer)
  }, [client, open, pages])
  function begin(job: WorkflowJobView, action: WorkflowAction) {
    setEditing({ job, action }); setNote(''); setApproved(false); setCharge(false); setError(''); setNotice('')
    setReply(job.result?.replyText || ''); setTaskText(job.result?.suggestedTask?.text || '')
    setEvidence(job.result?.suggestedTask?.evidenceRequired || ''); setCriteria(job.result?.suggestedTask?.acceptanceCriteria || '')
    setAcceptBy(''); setDeadline('')
  }
  async function submit(command: WorkflowCommand) {
    if (sending.current || journalBlocked || !current()) return
    sending.current = true; setBusy(true); setError(''); setNotice('')
    // A receipt must survive an interrupted response/reload before any mutation.
    try { sessionStorage.setItem(storage, JSON.stringify(command)); setPending(command) }
    catch { setJournalBlocked(true); setError(c.journal); sending.current = false; setBusy(false); return }
    try {
      await client.request('post', command.url, command.data)
      if (!current()) return
      sessionStorage.removeItem(storage); setPending(null); setEditing(null); setNotice(c.saved)
      await load(); onChanged()
    } catch (e: any) {
      if (!current()) return
      if (e?.response?.status >= 400 && e.response.status < 500 && ![408, 429].includes(e.response.status)) {
        try { sessionStorage.removeItem(storage); setPending(null) } catch { setJournalBlocked(true) }
        setError(workflowError(language, e)); await load()
      } else setError(c.unknown)
    } finally { sending.current = false; if (current()) setBusy(false) }
  }
  async function checkDecision() {
    if (!pending || pending.data.action !== 'owner_decision' || sending.current || !current()) return
    sending.current=true;setBusy(true);setError('');const token=epoch.current
    try {
      const sourceSeq=Number(pending.url.slice((base+'/jobs/').length).split('/')[0])
      const result=await client.request('get', `${base}/jobs?after=${Math.max(0,sourceSeq-1)}&requestId=${encodeURIComponent(pending.data.requestId)}`)
      if (!current() || token!==epoch.current) return
      const job=(result.jobs as WorkflowJobView[]).find(item=>item.sourceSeq===sourceSeq)
      if (result.requestReceipt?.requestId===pending.data.requestId && result.requestReceipt.sourceSeq===sourceSeq || job?.ownerDecision?.requestId===pending.data.requestId) {
        sessionStorage.removeItem(storage);setPending(null);setEditing(null);setNotice(c.saved);await load();onChanged()
      } else setError(c.decisionMissing)
    } catch(e) {if(current()&&token===epoch.current)setError(workflowError(language,e))}
    finally {sending.current=false;if(current()&&token===epoch.current)setBusy(false)}
  }
  function confirm() {
    if (!editing || changed || pending || !note.trim() || !current()) return
    const { job, action } = editing
    if (action === 'owner_decision' && (!canSubmitOwnerDecision(job) || reconfirming && !approved)) return
    if (!['dismiss','owner_decision'].includes(action) && !approved || action === 'retry' && !charge) return
    const data: WorkflowCommand['data'] = { requestId: crypto.randomUUID(), expectedVersion: job.version, action, note: note.trim(), ...(action === 'owner_decision' ? {} : {approved}) }
    if (action === 'approve_reply') data.replyText = reply.trim()
    if (action === 'retry') data.acknowledgePossibleCharge = charge
    if (action === 'approve_task') {
      if (!acceptBy || !deadline || !Number.isFinite(Date.parse(acceptBy)) || !Number.isFinite(Date.parse(deadline)) || Date.parse(acceptBy) > Date.parse(deadline)) { setError(c.invalidTime); return }
      data.content = { schema: 'team.operations.plan.v1', title: taskText.trim().slice(0, 120), objective: job.result!.summaryZh.slice(0, 800), reviewerId: staffId,
        items: [{ key: 'workflow', text: taskText.trim(), ownerId: job.sourceAuthorId, acceptByAt: new Date(acceptBy).toISOString(), deadlineAt: new Date(deadline).toISOString(), evidenceRequired: evidence.trim(), acceptanceCriteria: criteria.trim() }] }
    }
    void submit({ url: `${base}/jobs/${job.sourceSeq}/actions`, data })
  }
  async function exportReport(append = false) {
    if (sending.current || !current()) return
    sending.current = true; setBusy(true); setError('')
    try {
      const result = await client.request('get', `${base}/export?after=${append ? report?.cursor || 0 : 0}`)
      if (!current()) return
      if (result.hasMore && result.cursor <= (append ? report?.cursor || 0 : 0)) throw Error('INVALID_CURSOR')
      setReport({ text: (append && report?.text ? report.text + '\n\n' : '') + result.textZh, cursor: result.cursor, hasMore: result.hasMore })
    } catch (e) { if (current()) setError(workflowError(language, e)) }
    finally { sending.current = false; if (current()) setBusy(false) }
  }
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="min-w-0 space-y-3 rounded-xl border bg-white p-4" data-testid="team-workflow">
    <summary className="cursor-pointer font-semibold">{c.title}</summary>
    {open && <><p className="text-xs text-gray-600">{managementMode ? c.managementHelp : c.help}</p><a href="/settings/ai#ai-workflow-permissions" className="text-sm text-red-700 underline">{c.settings}</a>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => { setError(''); void load() }}>{c.refresh}</button><button type="button" className={button} disabled={busy} onClick={() => void exportReport()}>{c.report}</button></div>
      {takeover && <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm">{c.humanTakeover} · {name(takeover.byStaffId)}</p>}
      {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-green-800">{notice}</p>}
      {pending && <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><p>{pending.data.action==='owner_decision'?c.decisionPending:c.pending}</p><p className="break-all">{pending.data.requestId}</p><button type="button" className={button} disabled={busy || journalBlocked} onClick={() => void (pending.data.action==='owner_decision'?checkDecision():submit(pending))}>{pending.data.action==='owner_decision'?c.decisionCheck:c.replay}</button></div>}
      {!jobs.length && <p className="text-sm text-gray-500">{c.empty}</p>}
      {jobs.map(job => <article key={job.id} data-notice-object={job.id} data-notice-event={`management:${job.id}:${job.status}`} data-notice-version={job.updatedAt} className="min-w-0 space-y-2 rounded-lg border p-3 text-sm" data-testid={`workflow-job-${job.sourceSeq}`}>
        <div className="flex flex-wrap justify-between gap-2"><a href={`#team-message-${job.sourceSeq}`} className="underline">{c.source} #{job.sourceSeq} · {name(job.sourceAuthorId)}</a><strong>{job.management ? job.status==='reviewed'?c.managementReplied:label(job.status) : job.automaticReply ? c.autoReplied : label(job.status)}</strong></div>
        <p>{c.attempts}: {job.attempt}/3 · {date(job.updatedAt)}</p><p className={job.billingStatus === 'possible' ? 'text-amber-800' : 'text-gray-600'}>{label(job.billingStatus || 'not_started')}</p>
        {job.billingAttempts?.map(a => <p key={a.requestId} className="break-all text-xs text-gray-500">{a.attempt}: {label(a.billingStatus)} · {a.requestId}</p>)}
        {job.error && <p className="break-words text-red-700">{workflowError(language, { message: job.error })} <span className="font-mono text-xs">{job.error}</span></p>}
        {job.status === 'retry_wait' && job.nextAttemptAt && <p>{date(job.nextAttemptAt)}</p>}
        {job.management && <div className="min-w-0 space-y-2 rounded-lg bg-blue-50 p-3"><p className="whitespace-pre-wrap break-words"><strong>{c.original}</strong><br/>{job.management.originalText}</p><p className="whitespace-pre-wrap break-words">{job.management.summary}</p><div><strong>{c.knownFacts}</strong><ul className="list-disc space-y-1 pl-5">{job.management.knownFacts.map((fact,index)=><li key={index} className="whitespace-pre-wrap break-words">{fact}</li>)}</ul></div>{job.management.question&&<p className="whitespace-pre-wrap break-words"><strong>{c.ownerQuestion}</strong><br/>{job.management.question}</p>}{job.management.action&&<p className="whitespace-pre-wrap break-words"><strong>{c.pendingAction}: {job.management.action.title}</strong><br/>{job.management.action.details}</p>}{job.ownerDecision&&<p className="whitespace-pre-wrap break-words"><strong>{c.decisionNote}</strong><br/>{job.ownerDecision.text}</p>}</div>}
        {job.result && !job.management && <><p className="whitespace-pre-wrap break-words"><strong>{c.summary}</strong><br />{job.result.summaryZh}</p>{!!job.result.exceptions.length && <p className="whitespace-pre-wrap break-words text-amber-800">{c.exceptions}: {job.result.exceptions.join('；')}</p>}</>}
        {job.planId && <div className="space-y-1 rounded bg-gray-50 p-2"><p>{c.taskState}: {tasks.filter(t => t.planId === job.planId).map(t => label(t.status)).join(' · ') || '—'}</p><p>{c.followup}</p></div>}
        <div className="flex flex-wrap gap-2">{(['owner_decision', 'approve_reply', 'approve_task', 'reconcile', 'retry', 'dismiss'] as WorkflowAction[]).filter(action => {
          if (action === 'owner_decision') return canSubmitOwnerDecision(job)
          if (job.management && ['approve_reply','approve_task','reconcile','retry'].includes(action)) return false
          if (action === 'approve_reply') return job.status === 'awaiting_approval' && !!job.result && !job.replyMessageId
          if (action === 'approve_task') return job.status === 'awaiting_approval' && !!job.result?.suggestedTask && !job.result.exceptions.length && !job.planId
          if (action === 'reconcile') return ['uncertain', 'blocked'].includes(job.status)
          if (action === 'retry') return ['uncertain', 'blocked', 'retry_wait'].includes(job.status) && job.attempt < 3
          return !['processing', 'dismissed'].includes(job.status)
        }).map(action => <button type="button" key={action} className={button} disabled={busy || !!pending || journalBlocked} onClick={() => begin(job, action)}>{actionLabel(job, action)}</button>)}</div>
      </article>)}
      {more && <button type="button" className={button} disabled={busy || reading.current} onClick={() => void load(pages + 1)}>{c.more}</button>}
      {editing && <form className="min-w-0 space-y-3 rounded-lg border border-red-200 p-3" data-testid="workflow-review-form" onSubmit={event => { event.preventDefault(); confirm() }}>
        <h4 className="font-semibold">{actionLabel(editing.job, editing.action)} · #{editing.job.sourceSeq}</h4>{changed && <p role="alert" className="text-sm text-red-700">{c.conflict}</p>}
        <fieldset disabled={busy || !!pending || journalBlocked || changed} className="min-w-0 space-y-3">
          {editing.action === 'approve_reply' && <label className="block text-sm">{c.reply}<textarea required maxLength={1800} rows={4} className={field} value={reply} onChange={event => { setReply(event.target.value); setApproved(false) }} /></label>}
          {editing.action === 'approve_task' && <><p className="text-sm">{c.owner}: {name(editing.job.sourceAuthorId)} · {c.reviewer}: {name(staffId)}</p>
            {([{ label: c.task, value: taskText, set: setTaskText, max: 600 }, { label: c.evidence, value: evidence, set: setEvidence, max: 400 }, { label: c.criteria, value: criteria, set: setCriteria, max: 600 }]).map(input => <label key={input.label} className="block text-sm">{input.label}<textarea required className={field} value={input.value} maxLength={input.max} onChange={event => { input.set(event.target.value); setApproved(false) }} /></label>)}
            <p className="text-xs text-gray-500">{c.timezone}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p><div className="grid min-w-0 gap-3 sm:grid-cols-2">{[{ label: c.acceptBy, value: acceptBy, set: setAcceptBy }, { label: c.deadline, value: deadline, set: setDeadline }].map(input => <label key={input.label} className="block min-w-0 text-sm">{input.label}<input type="datetime-local" required className={field} value={input.value} onChange={event => { input.set(event.target.value); setApproved(false) }} /></label>)}</div></>}
          {editing.action==='owner_decision'&&<p className="text-sm text-gray-600">{reconfirming?c.decisionReconfirmHelp:c.decisionHelp}</p>}
          <label className="block text-sm">{editing.action==='owner_decision'?c.decisionNote:c.note}<textarea required maxLength={500} className={field} value={note} onChange={event => { setNote(event.target.value); setApproved(false) }} /></label>
          {reconfirming && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={event=>setApproved(event.target.checked)}/>{c.decisionReconfirmCheck}</label>}
          {!['dismiss','owner_decision'].includes(editing.action) && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} />{c.approved}</label>}
          {editing.action === 'retry' && <label className="flex items-start gap-2 text-sm text-amber-900"><input type="checkbox" checked={charge} onChange={event => setCharge(event.target.checked)} />{c.charge}</label>}
          <button className={button} disabled={!note.trim() || reconfirming && !approved || !['dismiss','owner_decision'].includes(editing.action) && !approved || editing.action === 'retry' && !charge}>{editing.action === 'approve_reply' ? c.send : editing.action === 'approve_task' ? c.assign : editing.action==='owner_decision'?actionLabel(editing.job, editing.action):c.confirm}</button>
        </fieldset><button type="button" className={button} disabled={busy || !!pending} onClick={() => setEditing(null)}>{c.cancel}</button>
      </form>}
      {report && <div className="space-y-2"><label className="block text-sm">{c.reportText}<textarea readOnly rows={10} className={field} value={report.text} /></label><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => void navigator.clipboard.writeText(report.text).then(() => setNotice(c.copied)).catch(() => setError(c.copyFailed))}>{c.copy}</button>{report.hasMore && <button type="button" className={button} disabled={busy} onClick={() => void exportReport(true)}>{c.moreReport}</button>}</div></div>}
    </>}
  </details>
}
