const zh = {
 title:'运营计划', help:'导入计划→人工批准→员工执行→主管验收→中文结果导出。自动消息关闭；升级检查须手动点击。Dot 通过管理员导入和导出交接，不会自动读取本店。',
 newPlan:'新建计划草稿', empty:'暂无运营计划', planTitle:'计划名称', objective:'目标与范围', reviewer:'指定验收主管（频道主持人或后台管理员）',
 item:'任务', taskText:'任务内容（员工可读）', owner:'负责人', acceptBy:'最迟确认接收时间', deadline:'完成截止时间', evidence:'执行证据要求', criteria:'验收标准',
 add:'增加任务', remove:'移除', save:'保存计划草稿', cancel:'关闭编辑', importTitle:'从主对话导入计划', importHelp:'粘贴约定格式的计划 JSON，载入表单核对后再保存；不会立即发布。', load:'载入并核对',
 invalid:'计划格式不完整，请核对任务、人员、带时区截止时间和必填字段。', choose:'选择计划', draft:'草稿', published:'已发布', paused:'已暂停', revision:'内容版本', stateVersion:'操作版本',
 approve:'已核对计划、频道成员、负责人、时间及验收标准，批准在此频道发布', publish:'批准并创建任务', pause:'暂停计划', resume:'批准恢复', revise:'修订为新草稿',
 note:'发布／暂停／恢复说明', scan:'检查未回复与逾期', export:'生成中文结果与导出', download:'下载结果供主对话读取', report:'中文结果（仅管理员；不会自动分享）',
 retry:'重试上次操作', discard:'已核对状态，放弃本次重试', pending:'上次操作结果待核对。请先刷新；重试使用同一请求编号，不会重复创建。', refresh:'刷新计划',
 escalation:'升级记录', unacknowledged:'未确认接收', overdue:'执行逾期', review_overdue:'主管验收逾期', member_unavailable:'负责人或主管不可用', open:'待处理', resolved:'已解除', checkedAt:'最近检查',
 timezone:'时间使用本机时区', planSnapshot:'来源计划版本', criteriaConfirm:'已按上述验收标准核对证据，并确认通过', planPaused:'计划已暂停或版本已变，执行已停止；主管仍可说明取消。',
 assist:'在已批准任务范围内辅助沟通', explain:'解释任务', followup:'追问进展', remind:'提醒提交', scope:'只发送此任务已批准的内容、时间、证据要求与验收标准；不发送员工消息或附件。',
 saved:'操作已保存', error:'操作未完成，请先核对当前状态。', openTasks:'请先完成旧任务；或暂停并说明取消旧任务，再修订。', changed:'计划、任务或频道成员已变化，请刷新后重新核对。',
 criteriaError:'完成任务须填写验收说明并确认已核对标准。', pauseFirst:'请先暂停已发布计划，再准备修订。', reviewerError:'请选择有权限的指定主管；只有该主管可验收或退回。'
}
const id: typeof zh = {
 title:'Rencana operasional',help:'Impor → persetujuan manusia → pelaksanaan staf → pemeriksaan atasan → ekspor hasil Mandarin. Pesan otomatis nonaktif; pemeriksaan eskalasi dilakukan manual. Dot menerima impor dan ekspor dari admin, bukan akses langsung toko.',
 newPlan:'Draf rencana baru',empty:'Belum ada rencana',planTitle:'Nama rencana',objective:'Tujuan dan ruang lingkup',reviewer:'Pemeriksa (pemilik kanal atau admin)',
 item:'Tugas',taskText:'Instruksi yang dapat dibaca staf',owner:'Penanggung jawab',acceptBy:'Batas konfirmasi penerimaan',deadline:'Batas penyelesaian',evidence:'Bukti yang diperlukan',criteria:'Kriteria pemeriksaan',
 add:'Tambah tugas',remove:'Hapus',save:'Simpan draf rencana',cancel:'Tutup editor',importTitle:'Impor rencana dari percakapan utama',importHelp:'Tempel JSON rencana, muat dan periksa formulir sebelum menyimpan. Belum diterbitkan.',load:'Muat dan periksa',
 invalid:'Format belum lengkap. Periksa tugas, anggota, waktu dengan zona, dan kolom wajib.',choose:'Pilih rencana',draft:'Draf',published:'Diterbitkan',paused:'Dijeda',revision:'Revisi isi',stateVersion:'Versi tindakan',
 approve:'Saya memeriksa rencana, anggota, penanggung jawab, waktu dan kriteria, serta menyetujui penerbitan di kanal ini',publish:'Setujui dan buat tugas',pause:'Jeda rencana',resume:'Setujui pelanjutan',revise:'Revisi sebagai draf baru',
 note:'Alasan penerbitan / jeda / pelanjutan',scan:'Periksa tugas belum diterima dan terlambat',export:'Buat hasil Mandarin dan ekspor',download:'Unduh hasil untuk percakapan utama',report:'Hasil Mandarin (khusus admin; tidak dibagikan otomatis)',
 retry:'Ulangi tindakan terakhir',discard:'Status diperiksa; batalkan pengulangan',pending:'Hasil terakhir perlu diperiksa. Muat ulang dahulu; pengulangan memakai ID yang sama agar tidak menduplikasi.',refresh:'Muat ulang rencana',
 escalation:'Catatan eskalasi',unacknowledged:'Belum dikonfirmasi',overdue:'Pelaksanaan terlambat',review_overdue:'Pemeriksaan terlambat',member_unavailable:'Pelaksana atau pemeriksa tidak tersedia',open:'Perlu tindakan',resolved:'Teratasi',checkedAt:'Pemeriksaan terakhir',
 timezone:'Waktu memakai zona perangkat',planSnapshot:'Revisi rencana sumber',criteriaConfirm:'Saya sudah memeriksa bukti sesuai kriteria di atas dan menyetujui hasilnya',planPaused:'Rencana dijeda atau revisi berubah; tindakan dihentikan. Atasan masih dapat membatalkan dengan alasan.',
 assist:'Bantuan untuk tugas yang disetujui',explain:'Jelaskan tugas',followup:'Tanyakan kemajuan',remind:'Ingatkan pengiriman',scope:'Hanya isi, waktu, bukti dan kriteria tugas yang disetujui dikirim; pesan staf dan lampiran tidak dikirim.',
 saved:'Tersimpan',error:'Tindakan belum selesai. Periksa status dahulu.',openTasks:'Selesaikan tugas lama dahulu, atau jeda lalu batalkan tugas lama dengan alasan, sebelum merevisi.',changed:'Rencana, tugas atau anggota berubah. Muat ulang dan periksa kembali.',
 criteriaError:'Isi alasan pemeriksaan dan konfirmasi kriteria sebelum menyetujui hasil.',pauseFirst:'Jeda rencana yang diterbitkan sebelum merevisi.',reviewerError:'Pilih pemeriksa yang berwenang. Hanya pemeriksa yang ditunjuk dapat menyetujui atau mengembalikan.'
}
const en: typeof zh = {
 title:'Operations plan',help:'Import → human approval → staff execution → supervisor review → Chinese results export. Automatic messages are off; escalation checks are manual. Dot receives admin imports and exports, without direct store access.',
 newPlan:'New plan draft',empty:'No operations plans',planTitle:'Plan name',objective:'Objective and scope',reviewer:'Reviewer (channel owner or admin)',
 item:'Task',taskText:'Staff-readable instruction',owner:'Assignee',acceptBy:'Acceptance deadline',deadline:'Completion deadline',evidence:'Required evidence',criteria:'Acceptance criteria',
 add:'Add task',remove:'Remove',save:'Save plan draft',cancel:'Close editor',importTitle:'Import from the main conversation',importHelp:'Paste plan JSON, load and review the form before saving. This does not publish it.',load:'Load and review',
 invalid:'The plan is incomplete. Check tasks, members, timezone-aware deadlines and required fields.',choose:'Choose plan',draft:'Draft',published:'Published',paused:'Paused',revision:'Content revision',stateVersion:'Action version',
 approve:'I checked the plan, members, assignees, times and criteria, and approve publication in this channel',publish:'Approve and create tasks',pause:'Pause plan',resume:'Approve resume',revise:'Revise as a new draft',
 note:'Reason for publication / pause / resume',scan:'Check unanswered and overdue tasks',export:'Create Chinese results and export',download:'Download results for the main conversation',report:'Chinese results (admin only; not shared automatically)',
 retry:'Retry last operation',discard:'Status checked; discard retry',pending:'The last outcome needs checking. Refresh first; retry uses the same request ID to prevent duplicates.',refresh:'Refresh plans',
 escalation:'Escalation records',unacknowledged:'Not acknowledged',overdue:'Execution overdue',review_overdue:'Review overdue',member_unavailable:'Assignee or reviewer unavailable',open:'Open',resolved:'Resolved',checkedAt:'Last checked',
 timezone:'Times use this device timezone',planSnapshot:'Source plan revision',criteriaConfirm:'I checked the evidence against the criteria above and approve completion',planPaused:'The plan is paused or its revision changed. Execution stopped; supervisors may still cancel with a reason.',
 assist:'Communicate within the approved task',explain:'Explain task',followup:'Ask for progress',remind:'Remind to submit',scope:'Only approved task text, times, evidence requirements and criteria are sent; staff messages and attachments are excluded.',
 saved:'Saved',error:'Operation did not finish. Check its status first.',openTasks:'Complete previous tasks first, or pause and cancel them with a reason, before revising.',changed:'The plan, task or membership changed. Refresh and review again.',
 criteriaError:'Provide a review note and confirm the criteria before completing.',pauseFirst:'Pause the published plan before revising.',reviewerError:'Choose an authorized reviewer. Only the designated reviewer may approve or return results.'
}
export const teamOperationCopy = (language: string) => language.startsWith('zh') ? zh : language.startsWith('en') ? en : id
export function teamOperationError(language: string, code: string) {
 const w = teamOperationCopy(language)
 return code === 'TEAM_PLAN_OPEN_TASKS' ? w.openTasks : code === 'TEAM_PLAN_PAUSE_BEFORE_REVISION' ? w.pauseFirst :
  code === 'TEAM_PLAN_CRITERIA_REQUIRED' ? w.criteriaError : code === 'TEAM_PLAN_REVIEWER_REQUIRED' ? w.reviewerError :
  /TEAM_(?:PLAN_(?:PAUSED|SCOPE_CHANGED|AUDIENCE_CHANGED)|VERSION_CONFLICT)/.test(code) ? w.changed : code === 'TEAM_INVALID_INPUT' ? w.invalid : w.error
}
