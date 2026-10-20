export interface WorkflowJobView {
  id: string; sourceSeq: number; sourceAuthorId: string; version: number; attempt: number; status: string; updatedAt: string
  automaticReply?: boolean
  error?: string; nextAttemptAt?: number; replyMessageId?: string; planId?: string
  billingStatus?: string; billingAttempts?: { attempt: number; requestId: string; status: string; billingStatus: string }[]
  result?: { replyText: string; summaryZh: string; exceptions: string[]; suggestedTask: null | {
    category: string; text: string; evidenceRequired: string; acceptanceCriteria: string
  } }
}
export type WorkflowAction = 'approve_reply' | 'approve_task' | 'dismiss' | 'reconcile' | 'retry'
export interface WorkflowCommand { url: string; data: { requestId: string; expectedVersion: number; action: WorkflowAction; note: string; [key: string]: unknown } }
export const workflowBase = (channelId: string) => `/team/channels/${channelId}/workflow`
const actions: WorkflowAction[] = ['approve_reply', 'approve_task', 'dismiss', 'reconcile', 'retry']

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
  autoReplied:'AI replied under ongoing authorization',humanTakeover:'Human takeover: automatic replies paused',
  title:'AI inbox review',refresh:'Refresh records',empty:'No incoming-message records',more:'Load more records',source:'Source message',attempts:'Attempts',
  help:'Only this channel and your own workflow records are shown. Processing requires an authorized consumer; this page refreshes status only.',settings:'Channel permissions: Settings → AI settings',loading:'Loading…',saved:'Operation saved',failed:'Could not load. Try again.',unknown:'Outcome unknown. Check the original operation before making another decision.',journal:'Could not safely save the operation receipt. Submission stopped.',replay:'Check original operation',pending:'An earlier outcome is unresolved. New decisions are locked; checking reuses the same request ID.',
  note:'Review note',approved:'I checked the content, channel members and consequences',charge:'I approve one new model attempt and understand the old request may have been billed',approve_reply:'Review reply',approve_task:'Review task',dismiss:'Close manually',reconcile:'Check saved result',retry:'Approve new attempt',send:'Approve and send reply',assign:'Approve and assign task',confirm:'Confirm operation',cancel:'Cancel',reply:'Reply to send',summary:'AI Chinese draft · employee statement is unverified',exceptions:'Exceptions requiring human review',task:'Task',evidence:'Required employee evidence',criteria:'Supervisor acceptance criteria',acceptBy:'Accept by',deadline:'Completion deadline',timezone:'Form time zone',owner:'Employee',reviewer:'Reviewer',taskState:'Assigned task status',followup:'Use the task section below for acceptance, own evidence, return and final review.',conflict:'The record changed. Cancel and review the latest version before approving.',invalidTime:'Enter valid times; acceptance must be no later than completion.',report:'Generate Chinese report',moreReport:'Read more report entries',reportText:'Chinese report · sources and human review are separate',copy:'Copy report',copied:'Copied',copyFailed:'Copy failed. Select the report text to copy it.',queued:'Queued',processing:'Processing',retry_wait:'Waiting for safe retry',awaiting_approval:'Awaiting human approval',reviewed:'Draft reviewed; task review is separate',uncertain:'Unknown outcome; no automatic retry',blocked:'Blocked; human review required',dismissed:'Closed manually',not_started:'Not called',possible:'Possible billing; unresolved risk retained',usage_recorded:'Usage recorded; provider bill is authoritative',assigned:'Awaiting employee acceptance',accepted:'Accepted',submitted:'Awaiting supervisor review',changes_requested:'Returned for changes',completed:'Accepted by human reviewer',cancelled:'Cancelled',failedAction:'Operation failed. Check the latest state.',forbidden:'Your identity or channel permissions do not allow this operation.',configChanged:'AI configuration or channel scope changed. Check permissions first.',
}
const id: Copy = {
  ...en,autoReplied:'AI membalas sesuai izin berkelanjutan',humanTakeover:'Diambil alih manusia: balasan otomatis dijeda',title:'Tinjauan pesan AI',refresh:'Muat ulang catatan',empty:'Belum ada catatan pesan masuk',more:'Muat catatan berikutnya',source:'Pesan sumber',attempts:'Percobaan',help:'Hanya kanal ini dan catatan Anda. Pemrosesan memerlukan konsumen berizin; halaman ini hanya memuat status.',settings:'Izin kanal: Pengaturan → Pengaturan AI',loading:'Memuat…',saved:'Tindakan tersimpan',failed:'Gagal memuat. Coba lagi.',unknown:'Hasil belum pasti. Periksa tindakan awal sebelum membuat keputusan baru.',journal:'Catatan tindakan tidak dapat disimpan dengan aman. Pengiriman dihentikan.',replay:'Periksa tindakan awal',pending:'Hasil tindakan sebelumnya belum pasti. Persetujuan baru dikunci; pemeriksaan memakai ID yang sama.',note:'Catatan persetujuan',approved:'Saya memeriksa isi, anggota kanal dan dampaknya',charge:'Saya menyetujui satu percobaan baru dan memahami permintaan lama mungkin ditagih',approve_reply:'Tinjau balasan',approve_task:'Tinjau tugas',dismiss:'Tutup manual',reconcile:'Periksa hasil tersimpan',retry:'Setujui percobaan baru',send:'Setujui dan kirim balasan',assign:'Setujui dan berikan tugas',confirm:'Konfirmasi tindakan',cancel:'Batal',reply:'Balasan yang akan dikirim',summary:'Draf Mandarin AI · pernyataan pegawai belum diverifikasi',exceptions:'Pengecualian untuk ditinjau manusia',task:'Tugas',evidence:'Bukti wajib dari pegawai',criteria:'Kriteria penerimaan atasan',acceptBy:'Batas penerimaan',deadline:'Tenggat penyelesaian',timezone:'Zona waktu formulir',owner:'Pegawai',reviewer:'Peninjau',taskState:'Status tugas diberikan',followup:'Gunakan bagian tugas di bawah untuk penerimaan, bukti sendiri, pengembalian dan pemeriksaan akhir.',conflict:'Catatan berubah. Batalkan dan tinjau versi terbaru.',invalidTime:'Isi waktu yang valid; penerimaan tidak boleh melewati tenggat.',report:'Buat laporan Mandarin',moreReport:'Baca laporan berikutnya',reportText:'Laporan Mandarin · sumber dan tinjauan manusia dipisahkan',copy:'Salin laporan',copied:'Disalin',copyFailed:'Gagal menyalin. Pilih teks laporan untuk menyalinnya.',queued:'Antrean',processing:'Memproses',retry_wait:'Menunggu percobaan aman',awaiting_approval:'Menunggu persetujuan',reviewed:'Draf ditinjau; pemeriksaan tugas terpisah',uncertain:'Hasil belum pasti; tanpa pengulangan otomatis',blocked:'Diblokir; perlu tinjauan',dismissed:'Ditutup manual',not_started:'Belum dipanggil',possible:'Mungkin ditagih; risiko disimpan',usage_recorded:'Penggunaan tercatat; tagihan penyedia tetap acuan',assigned:'Menunggu penerimaan pegawai',accepted:'Diterima',submitted:'Menunggu pemeriksaan atasan',changes_requested:'Dikembalikan untuk dilengkapi',completed:'Diterima peninjau manusia',cancelled:'Dibatalkan',failedAction:'Tindakan gagal. Periksa status terbaru.',forbidden:'Identitas atau izin kanal tidak mengizinkan tindakan ini.',configChanged:'Konfigurasi AI atau cakupan kanal berubah. Periksa izin terlebih dahulu.',
}
export const workflowCopy = (language: string): Copy => language.startsWith('zh') ? zh : language.startsWith('en') ? en : id
export function workflowError(language: string, error: unknown): string {
  const c = workflowCopy(language), e = error as any, code = e?.response?.data?.message || e?.message || ''
  if (code === 'TEAM_VERSION_CONFLICT') return c.conflict
  if (/ADMIN_REQUIRED|IDENTITY_REQUIRED|CHANNEL_FORBIDDEN|NOT_FOUND/.test(code)) return c.forbidden
  if (/CONFIG_CHANGED|SCOPE_CHANGED|PAUSED|EMPLOYEE_UNAVAILABLE/.test(code)) return c.configChanged
  return c.failedAction
}
