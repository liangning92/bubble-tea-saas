export interface WorkflowJobView {
  id: string; sourceSeq: number; sourceAuthorId: string; version: number; attempt: number; status: string; updatedAt: string
  automaticReply?: boolean
  management?: { kind: 'reply' | 'clarify' | 'pending_action' | 'owner_question'; summary: string; knownFacts: string[]; question: string | null; action: { title: string; details: string } | null; originalText: string; factsFingerprint: string; contextLastSeq: number }
  ownerDecision?: { text: string; byStaffId: string; at: string; requestId: string }
  error?: string; nextAttemptAt?: number; replyMessageId?: string; planId?: string
  billingStatus?: string; billingAttempts?: { attempt: number; requestId: string; status: string; billingStatus: string }[]
  result?: { replyText: string; summaryZh: string; exceptions: string[]; suggestedTask: null | {
    category: string; text: string; evidenceRequired: string; acceptanceCriteria: string
  } }
}
/** UI mirrors the execution gate; the backend rechecks current scope and every attempt. */
export function ownerDecisionBillingKnown(job: WorkflowJobView): boolean {
  const known = (value?: string) => value === undefined || ['not_started', 'usage_recorded'].includes(value)
  return known(job.billingStatus) && (job.billingAttempts || []).every(attempt => known(attempt.billingStatus) && !['pending', 'uncertain'].includes(attempt.status))
}
export function ownerDecisionExpired(job: WorkflowJobView): boolean {
  return !!job.management && !!job.ownerDecision && job.status === 'blocked' &&
    job.error === 'TEAM_MANAGEMENT_SOURCE_EXPIRED' && ownerDecisionBillingKnown(job)
}
export function canSubmitOwnerDecision(job: WorkflowJobView): boolean {
  return !!job.management && ownerDecisionBillingKnown(job) && (job.status === 'awaiting_owner' || ownerDecisionExpired(job))
}
export type WorkflowAction = 'approve_reply' | 'approve_task' | 'dismiss' | 'reconcile' | 'retry' | 'owner_decision'
export interface WorkflowCommand { url: string; data: { requestId: string; expectedVersion: number; action: WorkflowAction; note: string; [key: string]: unknown } }
export const workflowBase = (channelId: string) => `/team/channels/${channelId}/workflow`
const actions: WorkflowAction[] = ['approve_reply', 'approve_task', 'dismiss', 'reconcile', 'retry', 'owner_decision']

export function readWorkflowCommand(storage: Storage, key: string, channelId: string): WorkflowCommand | null {
  const raw = storage.getItem(key)
  if (!raw) return null
  const command = JSON.parse(raw)
  const prefix = workflowBase(channelId) + '/jobs/'
  if (typeof command?.url !== 'string' || !command.url.startsWith(prefix) || !/^[1-9]\d*\/actions$/.test(command.url.slice(prefix.length)) ||
      !actions.includes(command.data?.action) || !/^[a-f0-9-]{36}$/i.test(command.data?.requestId) ||
      !Number.isSafeInteger(command.data?.expectedVersion) || command.data.expectedVersion < 1 ||
      typeof command.data?.note !== 'string' || !command.data.note.trim() || command.data.note.length > 500) throw Error('WORKFLOW_JOURNAL_INVALID')
  return command
}

const zh = {
  decisionReconfirm:'核对当前信息后重新确认并继续',decisionReconfirmHelp:'原信息已过期。请先核对当前现场、任务及成员情况，再填写新的确认；旧决定不会自动重发。',decisionReconfirmCheck:'我已核对当前信息，并确认本次填写的新决定',
  managementReplied:'工作协调已反馈',owner_decision:'回复决定并继续',decisionNote:'你的决定或补充事实',decisionHelp:'此处答复用于继续工作协调，不执行付款、奖惩、权限或库存变更。',original:'员工原文',knownFacts:'已知事实',ownerQuestion:'需要你决定的问题',pendingAction:'待处理行动',awaiting_owner:'等待负责人决定',pending_action:'待处理行动',managementHelp:'日常工作确认、追问和协调自动处理。这里仅处理需要你的决定或后续业务行动，不要求逐条审稿。',decisionPending:'决定提交结果待核对；仅查询已保存回执，不重复发送。',decisionCheck:'查询决定回执',decisionMissing:'尚未查到匹配回执，保留原请求并继续锁定；请核对处理记录。',
  autoReplied:'AI 已依持续授权回复',humanTakeover:'人工已接管，自动回复已暂停',
  title: 'AI 来信待办', refresh: '刷新处理记录', empty: '尚无来信处理记录', more: '加载更多记录', source: '源消息', attempts: '尝试',
  help: '仅展示本频道、由当前管理员负责的来信。处理需要已获许可的消费者运行；此页面只刷新状态。',
  settings: '频道许可请到设置 → AI设置', loading: '正在读取…', saved: '操作已保存', failed: '读取失败，请重试。',
  unknown: '未取得可靠结果，请核对原操作；不要重新批准或新建请求。', journal: '无法安全保存操作记录，已停止提交。',
  replay: '核对原操作', pending: '上次操作结果待核对，已锁定新的审批；核对使用同一个请求编号。',
  note: '审批说明', approved: '我已核对当前内容、频道成员及操作影响', charge: '我批准一次新的模型尝试，并知晓旧请求可能已计费',
  approve_reply: '审阅回复', approve_task: '审阅任务', dismiss: '人工关闭', reconcile: '核对已保存结果', retry: '批准新尝试',
  send: '批准并发送回复', assign: '批准并下达任务', confirm: '确认操作', cancel: '取消',
  reply: '将发送的回复', summary: 'AI 中文草稿 · 员工陈述尚未核实', exceptions: '需人工处理的异常',
  task: '任务内容', evidence: '要求员工提交的证据', criteria: '主管验收标准', acceptBy: '最晚接收时间', deadline: '完成期限',
  timezone: '表单时间所属时区', owner: '负责员工', reviewer: '验收人', taskState: '已下达任务状态',
  followup: '接收、本人证据、退回和最终验收继续使用下方任务区。', conflict: '记录已变更，保留的表单不能再批准；请取消后重新审阅。',
  invalidTime: '请填写有效的接收和完成时间，接收时间不得晚于完成时间。', report: '生成中文汇报', moreReport: '继续读取汇报',
  reportText: '中文汇报 · 按来源和人工验收区分', copy: '复制汇报', copied: '已复制', copyFailed: '复制失败，可直接选中汇报文本复制。',
  queued: '排队中', processing: '处理中', retry_wait: '等待安全重试', awaiting_approval: '待人工审批', reviewed: '草稿已处理，任务另行验收',
  uncertain: '结果不明，禁止自动重试', blocked: '已阻断，待人工复核', dismissed: '已人工关闭',
  not_started: '尚未调用', possible: '可能已计费，保留未决风险', usage_recorded: '已有用量记录，以供应商账单为准',
  assigned: '待员工接收', accepted: '已接收', submitted: '待主管验收', changes_requested: '已退回补交', completed: '已人工验收', cancelled: '已取消',
  failedAction: '操作失败，请核对最新状态。', forbidden: '当前身份或频道权限不允许此操作。', configChanged: 'AI 配置或频道范围已变化，请核对许可后处理。',
}
type Copy = typeof zh
const en: Copy = {
  decisionReconfirm:'Recheck current information, reconfirm and continue',decisionReconfirmHelp:'The previous information expired. Check current conditions, tasks and members, then enter a fresh confirmation. The old decision will not be resent automatically.',decisionReconfirmCheck:'I checked current information and confirm this newly entered decision',
  managementReplied:'Work coordination response sent',owner_decision:'Reply with a decision and continue',decisionNote:'Your decision or additional facts',decisionHelp:'This reply resumes work coordination. It does not execute payment, discipline, permissions or stock changes.',original:'Employee message',knownFacts:'Known facts',ownerQuestion:'Question for your decision',pendingAction:'Pending action',awaiting_owner:'Awaiting owner decision',pending_action:'Pending action',managementHelp:'Routine confirmations, questions and coordination run automatically. Only decisions and follow-up business actions appear here; individual replies do not need review.',decisionPending:'The decision outcome is unresolved. Only the saved receipt will be queried; nothing is resent.',decisionCheck:'Check decision receipt',decisionMissing:'No matching receipt is visible yet. The original request and lock are retained; check the processing records.',
  autoReplied:'AI replied under ongoing authorization',humanTakeover:'Human takeover: automatic replies paused',
  title:'AI inbox review',refresh:'Refresh records',empty:'No incoming-message records',more:'Load more records',source:'Source message',attempts:'Attempts',
  help:'Only this channel and your own workflow records are shown. Processing requires an authorized consumer; this page refreshes status only.',settings:'Channel permissions: Settings → AI settings',loading:'Loading…',saved:'Operation saved',failed:'Could not load. Try again.',unknown:'Outcome unknown. Check the original operation before making another decision.',journal:'Could not safely save the operation receipt. Submission stopped.',replay:'Check original operation',pending:'An earlier outcome is unresolved. New decisions are locked; checking reuses the same request ID.',
  note:'Review note',approved:'I checked the content, channel members and consequences',charge:'I approve one new model attempt and understand the old request may have been billed',approve_reply:'Review reply',approve_task:'Review task',dismiss:'Close manually',reconcile:'Check saved result',retry:'Approve new attempt',send:'Approve and send reply',assign:'Approve and assign task',confirm:'Confirm operation',cancel:'Cancel',reply:'Reply to send',summary:'AI Chinese draft · employee statement is unverified',exceptions:'Exceptions requiring human review',task:'Task',evidence:'Required employee evidence',criteria:'Supervisor acceptance criteria',acceptBy:'Accept by',deadline:'Completion deadline',timezone:'Form time zone',owner:'Employee',reviewer:'Reviewer',taskState:'Assigned task status',followup:'Use the task section below for acceptance, own evidence, return and final review.',conflict:'The record changed. Cancel and review the latest version before approving.',invalidTime:'Enter valid times; acceptance must be no later than completion.',report:'Generate Chinese report',moreReport:'Read more report entries',reportText:'Chinese report · sources and human review are separate',copy:'Copy report',copied:'Copied',copyFailed:'Copy failed. Select the report text to copy it.',queued:'Queued',processing:'Processing',retry_wait:'Waiting for safe retry',awaiting_approval:'Awaiting human approval',reviewed:'Draft reviewed; task review is separate',uncertain:'Unknown outcome; no automatic retry',blocked:'Blocked; human review required',dismissed:'Closed manually',not_started:'Not called',possible:'Possible billing; unresolved risk retained',usage_recorded:'Usage recorded; provider bill is authoritative',assigned:'Awaiting employee acceptance',accepted:'Accepted',submitted:'Awaiting supervisor review',changes_requested:'Returned for changes',completed:'Accepted by human reviewer',cancelled:'Cancelled',failedAction:'Operation failed. Check the latest state.',forbidden:'Your identity or channel permissions do not allow this operation.',configChanged:'AI configuration or channel scope changed. Check permissions first.',
}
const id: Copy = {
  ...en,decisionReconfirm:'Periksa informasi terkini, konfirmasi ulang dan lanjutkan',decisionReconfirmHelp:'Informasi sebelumnya kedaluwarsa. Periksa kondisi, tugas dan anggota terkini, lalu isi konfirmasi baru. Keputusan lama tidak dikirim ulang otomatis.',decisionReconfirmCheck:'Saya telah memeriksa informasi terkini dan mengonfirmasi keputusan baru ini',managementReplied:'Tanggapan koordinasi kerja terkirim',owner_decision:'Jawab keputusan dan lanjutkan',decisionNote:'Keputusan atau fakta tambahan Anda',decisionHelp:'Jawaban ini melanjutkan koordinasi kerja, bukan pembayaran, sanksi, izin atau perubahan stok.',original:'Pesan pegawai',knownFacts:'Fakta yang diketahui',ownerQuestion:'Pertanyaan untuk keputusan Anda',pendingAction:'Tindakan tertunda',awaiting_owner:'Menunggu keputusan penanggung jawab',pending_action:'Tindakan tertunda',managementHelp:'Konfirmasi, pertanyaan dan koordinasi rutin berjalan otomatis. Bagian ini hanya untuk keputusan atau tindak lanjut bisnis, bukan meninjau setiap balasan.',decisionPending:'Hasil keputusan belum pasti. Hanya bukti tersimpan yang diperiksa, tanpa mengirim ulang.',decisionCheck:'Periksa bukti keputusan',decisionMissing:'Bukti yang cocok belum terlihat. Permintaan asli dan kunci tetap disimpan; periksa catatan pemrosesan.',autoReplied:'AI membalas sesuai izin berkelanjutan',humanTakeover:'Diambil alih manusia: balasan otomatis dijeda',title:'Tinjauan pesan AI',refresh:'Muat ulang catatan',empty:'Belum ada catatan pesan masuk',more:'Muat catatan berikutnya',source:'Pesan sumber',attempts:'Percobaan',help:'Hanya kanal ini dan catatan Anda. Pemrosesan memerlukan konsumen berizin; halaman ini hanya memuat status.',settings:'Izin kanal: Pengaturan → Pengaturan AI',loading:'Memuat…',saved:'Tindakan tersimpan',failed:'Gagal memuat. Coba lagi.',unknown:'Hasil belum pasti. Periksa tindakan awal sebelum membuat keputusan baru.',journal:'Catatan tindakan tidak dapat disimpan dengan aman. Pengiriman dihentikan.',replay:'Periksa tindakan awal',pending:'Hasil tindakan sebelumnya belum pasti. Persetujuan baru dikunci; pemeriksaan memakai ID yang sama.',note:'Catatan persetujuan',approved:'Saya memeriksa isi, anggota kanal dan dampaknya',charge:'Saya menyetujui satu percobaan baru dan memahami permintaan lama mungkin ditagih',approve_reply:'Tinjau balasan',approve_task:'Tinjau tugas',dismiss:'Tutup manual',reconcile:'Periksa hasil tersimpan',retry:'Setujui percobaan baru',send:'Setujui dan kirim balasan',assign:'Setujui dan berikan tugas',confirm:'Konfirmasi tindakan',cancel:'Batal',reply:'Balasan yang akan dikirim',summary:'Draf Mandarin AI · pernyataan pegawai belum diverifikasi',exceptions:'Pengecualian untuk ditinjau manusia',task:'Tugas',evidence:'Bukti wajib dari pegawai',criteria:'Kriteria penerimaan atasan',acceptBy:'Batas penerimaan',deadline:'Tenggat penyelesaian',timezone:'Zona waktu formulir',owner:'Pegawai',reviewer:'Peninjau',taskState:'Status tugas diberikan',followup:'Gunakan bagian tugas di bawah untuk penerimaan, bukti sendiri, pengembalian dan pemeriksaan akhir.',conflict:'Catatan berubah. Batalkan dan tinjau versi terbaru.',invalidTime:'Isi waktu yang valid; penerimaan tidak boleh melewati tenggat.',report:'Buat laporan Mandarin',moreReport:'Baca laporan berikutnya',reportText:'Laporan Mandarin · sumber dan tinjauan manusia dipisahkan',copy:'Salin laporan',copied:'Disalin',copyFailed:'Gagal menyalin. Pilih teks laporan untuk menyalinnya.',queued:'Antrean',processing:'Memproses',retry_wait:'Menunggu percobaan aman',awaiting_approval:'Menunggu persetujuan',reviewed:'Draf ditinjau; pemeriksaan tugas terpisah',uncertain:'Hasil belum pasti; tanpa pengulangan otomatis',blocked:'Diblokir; perlu tinjauan',dismissed:'Ditutup manual',not_started:'Belum dipanggil',possible:'Mungkin ditagih; risiko disimpan',usage_recorded:'Penggunaan tercatat; tagihan penyedia tetap acuan',assigned:'Menunggu penerimaan pegawai',accepted:'Diterima',submitted:'Menunggu pemeriksaan atasan',changes_requested:'Dikembalikan untuk dilengkapi',completed:'Diterima peninjau manusia',cancelled:'Dibatalkan',failedAction:'Tindakan gagal. Periksa status terbaru.',forbidden:'Identitas atau izin kanal tidak mengizinkan tindakan ini.',configChanged:'Konfigurasi AI atau cakupan kanal berubah. Periksa izin terlebih dahulu.',
}
export const workflowCopy = (language: string): Copy => language.startsWith('zh') ? zh : language.startsWith('en') ? en : id
export function workflowError(language: string, error: unknown): string {
  const c = workflowCopy(language), e = error as any, code = e?.response?.data?.message || e?.message || ''
  if (code === 'TEAM_VERSION_CONFLICT') return c.conflict
  if (/ADMIN_REQUIRED|IDENTITY_REQUIRED|CHANNEL_FORBIDDEN|NOT_FOUND/.test(code)) return c.forbidden
  if (/CONFIG_CHANGED|SCOPE_CHANGED|PAUSED|EMPLOYEE_UNAVAILABLE/.test(code)) return c.configChanged
  return c.failedAction
}
