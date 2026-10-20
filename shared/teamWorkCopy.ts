const zh = {
 tasks:'行动项跟进', taskHelp:'从已确认纪要或已批准计划生成任务；已读不代表接收，完成须经人工验收。', noTasks:'暂无跟进任务', promote:'创建跟进任务', snapshot:'来源纪要版本',
 assigned:'待接收', accepted:'已接收', submitted:'待验收', changes_requested:'待补充', completed:'已验收', cancelled:'已取消',
 accept:'接收任务', submit:'提交结果', return:'退回补充', complete:'验收通过', cancelTask:'取消任务', note:'结果或处理说明', evidence:'选择本人发送的证据消息', events:'处理记录', assign:'发布任务',
 confirmAction:'确认操作', close:'关闭', saved:'已保存', error:'操作未完成，请核对状态后重试。', conflict:'版本已变化，请刷新后重新操作；输入仍保留。',
 cancelTransfer:'取消读取', attachmentError:'附件读取未完成。慢速网络请稍候或重试；原消息已保留。', preview:'查看附件', download:'下载附件', enlarge:'放大图片', image:'私有工作图片', loading:'读取中…', retry:'重试',
 ai:'MiniMax 沟通助手', aiHelp:'仅处理手选工作文字，不发送附件。译文和汇报是私有草稿，向员工发送前需人工确认。',
 settings:'MiniMax 设置', enabled:'启用沟通 AI', model:'模型名称', apiKey:'API 密钥（留空保留原值）', keyReady:'已配置密钥', keyMissing:'尚未配置密钥', removeKey:'清除已保存的密钥',
 budget:'每月费用上限 USD（留空为不设上限）', unlimited:'当前不设费用上限', estimate:'本月估算含待核对预留，按 UTC 月计算；以供应商账单为准', inputPrice:'每百万输入 token 价格 USD', outputPrice:'每百万输出 token 价格 USD',
 save:'保存设置', prices:'模型与价格需按 MiniMax 账户核实；切换模型后同时核对单价。',
 region:'MiniMax 服务地区', globalRegion:'国际区', cnRegion:'中国区', endpoint:'官方调用地址（OpenAI 兼容）',
 regionHelp:'地区须与密钥来源平台一致；地址固定，不接受自定义主机。切换地区不会沿用已保存的密钥，请本人重新输入目标地区密钥。',
 regionConsent:'我确认将新输入的密钥用于以上官方域名；不沿用已保存密钥。', configOnly:'保存只校验配置格式，不调用模型，也不代表供应商已接受密钥。',
 subscriptionHelp:'Token Plan／M Plan 的模型与用途需按账号权益核实，不能把订阅名称当作门店后台授权。USD 为内部估算，不等于订阅实际扣费。',
 translate:'翻译成中文', draft:'拟写印尼语消息', report:'生成中文汇报', instruction:'中文工作要求或追问目标', sources:'选择来源消息（最多20条）',
 consent:'我确认将所选工作文字及上述要求发送给 MiniMax，不含私人资料。', generate:'生成草稿（可能计费）', generating:'正在生成，请勿重复提交',
 privateDraft:'AI 草稿，仅本人可见，请核对原文、数量和日期。', approve:'已核对内容与频道成员，批准发送', publish:'批准并发送到当前频道', sent:'已发送', pending:'处理中', uncertain:'结果待核对，请先查询；重新生成可能再次计费。',
 lookup:'查询上次调用结果', aiApproved:'AI 辅助 · 发送人已确认', aiRoutine:'AI 辅助 · 持续授权自动发送', blocked:'配置已变化，结果未发布', requestFailed:'AI 不可用，仍可手动沟通。',
}
const id: typeof zh = {
 tasks:'Tindak lanjut tugas',taskHelp:'Tugas dibuat dari notulen yang dikonfirmasi atau rencana yang disetujui. Dibaca bukan berarti diterima; hasil diperiksa manusia.',noTasks:'Belum ada tugas tindak lanjut',promote:'Buat tugas tindak lanjut',snapshot:'Versi notulen sumber',
 assigned:'Menunggu diterima',accepted:'Diterima',submitted:'Menunggu pemeriksaan',changes_requested:'Perlu dilengkapi',completed:'Disetujui',cancelled:'Dibatalkan',
 accept:'Terima tugas',submit:'Kirim hasil',return:'Minta perbaikan',complete:'Setujui hasil',cancelTask:'Batalkan tugas',note:'Hasil atau alasan tindakan',evidence:'Pilih pesan bukti yang Anda kirim',events:'Riwayat tindakan',assign:'Terbitkan tugas',
 confirmAction:'Konfirmasi',close:'Tutup',saved:'Tersimpan',error:'Operasi belum selesai. Periksa status sebelum mencoba lagi.',conflict:'Versi berubah. Muat ulang sebelum mencoba lagi; isian tetap disimpan.',
 cancelTransfer:'Batalkan',attachmentError:'Lampiran belum selesai dimuat. Tunggu atau coba lagi pada koneksi lambat; pesan tetap tersimpan.',preview:'Lihat lampiran',download:'Unduh lampiran',enlarge:'Perbesar gambar',image:'Gambar kerja privat',loading:'Memuat…',retry:'Coba lagi',
 ai:'Asisten komunikasi MiniMax',aiHelp:'Hanya teks kerja yang dipilih; lampiran tidak dikirim. Terjemahan dan laporan adalah draf privat. Pengiriman ke staf memerlukan konfirmasi manusia.',
 settings:'Pengaturan MiniMax',enabled:'Aktifkan AI komunikasi',model:'Nama model',apiKey:'Kunci API (kosong untuk mempertahankan)',keyReady:'Kunci sudah diatur',keyMissing:'Kunci belum diatur',removeKey:'Hapus kunci tersimpan',
 budget:'Batas biaya bulanan USD (kosong = tanpa batas)',unlimited:'Tanpa batas biaya saat ini',estimate:'Perkiraan termasuk reservasi yang belum dikonfirmasi, bulan UTC; tagihan penyedia menjadi acuan',inputPrice:'Harga per sejuta token input USD',outputPrice:'Harga per sejuta token output USD',
 save:'Simpan pengaturan',prices:'Periksa model dan harga di akun MiniMax. Periksa harga kembali saat mengganti model.',
 region:'Wilayah layanan MiniMax',globalRegion:'Global',cnRegion:'Tiongkok',endpoint:'Endpoint resmi (kompatibel OpenAI)',
 regionHelp:'Wilayah harus sesuai asal kunci. Host tetap; host khusus tidak diterima. Perubahan wilayah tidak memakai ulang kunci tersimpan; masukkan kunci wilayah tujuan.',
 regionConsent:'Saya menyetujui penggunaan kunci baru pada domain resmi di atas, tanpa memakai ulang kunci tersimpan.',configOnly:'Penyimpanan hanya memeriksa format, tidak memanggil model atau membuktikan kunci diterima penyedia.',
 subscriptionHelp:'Periksa model dan penggunaan Token Plan/M Plan sesuai hak akun; nama paket bukan izin backend toko. USD hanya perkiraan internal, bukan tagihan langganan.',
 translate:'Terjemahkan ke Mandarin',draft:'Susun pesan bahasa Indonesia',report:'Buat laporan Mandarin',instruction:'Tujuan kerja atau pertanyaan dalam Mandarin',sources:'Pilih pesan sumber (maksimal 20)',
 consent:'Saya menyetujui pengiriman teks kerja yang dipilih dan instruksi ke MiniMax, tanpa data pribadi.',generate:'Buat draf (dapat dikenai biaya)',generating:'Sedang membuat; jangan kirim ulang',
 privateDraft:'Draf AI privat. Periksa sumber, jumlah, dan tanggal.',approve:'Isi dan anggota kanal sudah diperiksa; setujui pengiriman',publish:'Setujui dan kirim ke kanal ini',sent:'Terkirim',pending:'Diproses',uncertain:'Hasil perlu diperiksa. Periksa dahulu; pembuatan ulang dapat dikenai biaya lagi.',
 lookup:'Periksa permintaan terakhir',aiApproved:'Dibantu AI · dikonfirmasi pengirim',aiRoutine:'Dibantu AI · terkirim otomatis dengan izin berkelanjutan',blocked:'Konfigurasi berubah; hasil tidak diterbitkan',requestFailed:'AI tidak tersedia. Komunikasi manual tetap dapat digunakan.',
}
const en: typeof zh = {
 tasks:'Action follow-up',taskHelp:'Tasks come from confirmed minutes or approved plans. Read is not accepted; a person reviews completion.',noTasks:'No follow-up tasks',promote:'Create follow-up task',snapshot:'Source minutes version',
 assigned:'Awaiting acceptance',accepted:'Accepted',submitted:'Awaiting review',changes_requested:'Changes requested',completed:'Approved',cancelled:'Cancelled',
 accept:'Accept task',submit:'Submit result',return:'Request changes',complete:'Approve result',cancelTask:'Cancel task',note:'Result or action reason',evidence:'Select evidence messages you sent',events:'Action history',assign:'Assign task',
 confirmAction:'Confirm action',close:'Close',saved:'Saved',error:'Operation did not finish. Check its status before retrying.',conflict:'The version changed. Refresh before retrying; your input is retained.',
 cancelTransfer:'Cancel',attachmentError:'Attachment did not finish loading. Wait or retry on a slow connection; your message is saved.',preview:'View attachment',download:'Download attachment',enlarge:'Enlarge image',image:'Private work image',loading:'Loading…',retry:'Retry',
 ai:'MiniMax communication assistant',aiHelp:'Only selected work text is sent; attachments are excluded. Translations and reports are private drafts. Sending to staff requires human approval.',
 settings:'MiniMax settings',enabled:'Enable communication AI',model:'Model name',apiKey:'API key (leave blank to keep)',keyReady:'Key configured',keyMissing:'Key not configured',removeKey:'Remove saved key',
 budget:'Monthly budget USD (blank = no cap)',unlimited:'No spending cap set',estimate:'Estimate includes unconfirmed reservations, UTC billing month; provider invoice is authoritative',inputPrice:'USD per million input tokens',outputPrice:'USD per million output tokens',
 save:'Save settings',prices:'Verify model and rates with your MiniMax account. Review rates when changing models.',
 region:'MiniMax service region',globalRegion:'Global',cnRegion:'China',endpoint:'Official endpoint (OpenAI compatible)',
 regionHelp:'Match the key’s platform region. Hosts are fixed; custom hosts are rejected. Changing region never reuses a saved key; enter the destination region’s key yourself.',
 regionConsent:'I approve using the newly entered key with the official domain above, without reusing the saved key.',configOnly:'Saving validates format only; it does not call the model or confirm that the provider accepts the key.',
 subscriptionHelp:'Verify Token Plan/M Plan model and usage entitlements; a plan name does not authorize a store backend. USD is an internal estimate, not the subscription bill.',
 translate:'Translate to Chinese',draft:'Draft an Indonesian message',report:'Create Chinese report',instruction:'Work instruction or follow-up goal in Chinese',sources:'Select source messages (up to 20)',
 consent:'I approve sending the selected work text and instruction to MiniMax, excluding private information.',generate:'Generate draft (may incur charges)',generating:'Generating; do not resubmit',
 privateDraft:'Private AI draft. Verify sources, quantities and dates.',approve:'I checked the text and channel members and approve sending',publish:'Approve and send to this channel',sent:'Sent',pending:'Processing',uncertain:'Outcome needs verification. Check first; generating again may incur another charge.',
 lookup:'Check last request',aiApproved:'AI assisted · approved by sender',aiRoutine:'AI assisted · automatically sent under ongoing consent',blocked:'Configuration changed; result was not published',requestFailed:'AI unavailable. Manual communication remains available.',
}
export const teamWorkCopy = (language: string) => language.startsWith('zh') ? zh : language.startsWith('en') ? en : id
export function teamWorkError(language: string, code: string) {
 const w = teamWorkCopy(language), zh = language.startsWith('zh'), en = language.startsWith('en')
 if (code === 'TEAM_VERSION_CONFLICT') return w.conflict
 if (code === 'TEAM_AI_CREDENTIAL_REJECTED') return zh ? 'MiniMax 拒绝了密钥。请在“设置 → AI设置”核对服务地区、密钥来源及类型；先查询原请求，不要反复生成。' : en ? 'MiniMax rejected the key. Check the service region, key platform and type in AI settings. Check the existing request before generating again.' : 'MiniMax menolak kunci. Periksa wilayah, asal dan jenis kunci di Pengaturan AI. Periksa permintaan lama sebelum membuat lagi.'
 if (/TEAM_AI_(?:REGION_KEY_REQUIRED|CREDENTIAL_REGION_MISMATCH)/.test(code)) return w.regionHelp
 if (code === 'TEAM_AI_REGION_CONFIRM_REQUIRED') return w.regionConsent
 if (code === 'TEAM_AI_REGION_INVALID') return zh ? '服务地区无效，请选择中国区或国际区。' : en ? 'Choose China or Global as the service region.' : 'Pilih wilayah Tiongkok atau Global.'
 if (/TEAM_PLAN_/.test(code)) return zh ? '计划或任务范围已变化，请刷新并核对计划状态、频道成员及指定主管。' : en ? 'Plan or task scope changed. Refresh and check the plan, members and reviewer.' : 'Lingkup rencana atau tugas berubah. Muat ulang dan periksa rencana, anggota serta pemeriksa.'
 if (/TEAM_AI_(?:NOT_CONFIGURED|KEY_REQUIRED)/.test(code)) return zh ? '请先到“设置 → AI设置”配置密钥并启用沟通 AI。' : en ? 'Configure the key and enable communication AI in Settings → AI settings first.' : 'Atur kunci dan aktifkan AI komunikasi di Pengaturan → Pengaturan AI terlebih dahulu.'
 if (/TEAM_AI_(?:PENDING|NEW_REQUEST_REQUIRED)/.test(code)) return w.uncertain
 if (code === 'TEAM_AI_BUDGET_LIMIT') return zh ? '本月估算已达到费用上限，请由管理员核对。' : en ? 'The monthly estimated spending cap has been reached. Ask the administrator to review it.' : 'Perkiraan batas biaya bulanan tercapai. Minta administrator memeriksanya.'
 if (/RATE_LIMIT/.test(code)) return zh ? '请求较频繁，请稍后再试。' : en ? 'Too many requests. Please try again later.' : 'Terlalu banyak permintaan. Coba lagi nanti.'
 if (/TEAM_AI_(?:AUDIENCE_CHANGED|CONFIG_CHANGED)/.test(code)) return zh ? '频道成员或模型设置已变化，请重新核对并生成草稿。' : en ? 'Channel members or model settings changed. Review them and generate a new draft.' : 'Anggota kanal atau pengaturan model berubah. Periksa dan buat draf baru.'
 if (code === 'TEAM_TASK_EVIDENCE_REQUIRED') return zh ? '请填写结果，并选择本人发送的有效证据消息。' : en ? 'Describe the result and select valid evidence messages you sent.' : 'Jelaskan hasil dan pilih pesan bukti sah yang Anda kirim.'
 if (code === 'TEAM_TASK_OWNER_ACCESS') return zh ? '负责人需要先加入频道，并有权查看来源纪要。' : en ? 'The assignee must be a channel member with access to the source minutes.' : 'Penanggung jawab harus menjadi anggota yang dapat membaca notulen sumber.'
 if (/TEAM_AI_/.test(code)) return w.requestFailed
 return w.error
}
