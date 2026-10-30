const zh = {
  description: '一个门店运营 Hermes，按账户权限处理工作。依次设置身份与运行、模型连接、员工沟通和知识；外部工作台连接为可选项。各分区独立保存，页面跳转不会丢弃本页草稿。',
  navigation: 'AI 设置分区',
  groups: [
    {id:'agent',title:'身份与运行',description:'设置名称和服务开关，查看实际运行状态。后台业务使用发起账户权限，不再逐项开通工具。'},
    {id:'model',title:'模型与用量',description:'配置当前模型、连接地区和密钥，查看连接验证、用量估算及预算。'},
    {id:'communication',title:'沟通与账户',description:'了解原生 Hermes 的会话身份与回复范围；历史沟通工作流单独归档。'},
    {id:'knowledge',title:'技能与知识',description:'区分原生 Hermes 的技能和私有记忆，以及后台可审核的门店知识记录。'},
    {id:'workbench',title:'工作台连接',description:'可选：让外部工作台向同一个 Hermes 派工和读取回执。内置聊天无需建立此连接。'},
  ],
  subscription:'沿用现有模型连接。页面中的美元金额是按配置单价计算的用量估算，不是订阅账单或剩余额度；本页不能确认供应商是否额外计费。不会因整理设置而新增服务或切换付费兜底。',
  channelExceptions:'历史沟通工作流设置',
  communicationHelp:'原生 Hermes 使用消息发送账户和当前会话的真实成员身份。回复和私有记忆按账户与会话受众隔离；员工不会继承管理员的财务或人事权限。原生服务启停使用“身份与运行”中的总开关。',
  legacyHelp:'以下设置保留给旧工作流消费者，并不控制当前原生 Hermes 的回复、暂停或人工接管。不要用这里的状态判断原生服务是否运行。',
  nativeTitle:'原生技能、工具与工作空间',
  nativeHelp:'技能、工具发现、子 Agent 和私有记忆由原生 Hermes 管理，不用为营销、库存等业务重新勾选能力。可在对应聊天中要求 Hermes 查看技能、学习工作方法或记住规则。实际可用性取决于运行环境和已有连接；缺少凭据的外部服务不会自动接通。',
  memoryHelp:'原生私有工作空间按账户和会话受众隔离。下方是后台保存的门店知识与历史经验，不代表已读取原生工作空间中的全部记忆或技能。分享为全店规则前请核对内容。',
}
const en: typeof zh = {
  description:'One store-operations Hermes, acting with the requesting account’s permissions. Configure identity, model, communication and knowledge; an external workbench connection is optional. Each section saves separately. Section links retain drafts on this page.',
  navigation:'AI settings sections',
  groups:[
    {id:'agent',title:'Identity and runtime',description:'Set the name and service switch; inspect runtime status. Store actions use the requesting account’s permissions without per-tool activation.'},
    {id:'model',title:'Model and usage',description:'Configure the current model, region and credential; review connection checks, usage estimates and budget.'},
    {id:'communication',title:'Communication and accounts',description:'Understand native Hermes conversation identity and reply scope. Legacy communication workflows are kept separately.'},
    {id:'knowledge',title:'Skills and knowledge',description:'Distinguish native Hermes skills and private memory from reviewable store knowledge records.'},
    {id:'workbench',title:'Workbench connection',description:'Optional: let an external workbench assign work and read receipts from the same Hermes. Built-in chat needs no such connection.'},
  ],
  subscription:'Reuse the existing model connection. Dollar amounts are usage estimates based on configured rates, not a subscription invoice or remaining allowance. This page cannot confirm additional provider charges. Reorganizing settings adds no service or paid fallback.',
  channelExceptions:'Legacy communication workflow settings',
  communicationHelp:'Native Hermes uses the sender’s account and actual conversation membership. Replies and private memory are isolated by account and audience; employees do not inherit administrator finance or personnel permissions. Start or stop the native service with the switch under Identity and runtime.',
  legacyHelp:'The settings below are retained for legacy workflow consumers. They do not control native Hermes replies, pausing or human takeover. Their status does not indicate whether the native service is running.',
  nativeTitle:'Native skills, tools and workspace',
  nativeHelp:'Native Hermes manages skills, tool discovery, subagents and private memory. Marketing and inventory do not need separate capability switches. Ask Hermes in the relevant chat to inspect skills, learn a workflow or remember a rule. Availability depends on the runtime and existing connections; missing external credentials are not provisioned automatically.',
  memoryHelp:'Native private workspaces are isolated by account and conversation audience. The records below are store knowledge and historical lessons saved by the backend, not a complete listing of native workspace memory or skills. Review content before sharing it with the store.',
}
const id: typeof zh = {
  description:'Satu Hermes operasional toko yang mengikuti izin akun peminta. Atur identitas, model, komunikasi, dan pengetahuan; koneksi workbench eksternal bersifat opsional. Setiap bagian disimpan terpisah. Tautan bagian mempertahankan draf di halaman ini.',
  navigation:'Bagian pengaturan AI',
  groups:[
    {id:'agent',title:'Identitas dan runtime',description:'Atur nama dan sakelar layanan; lihat status runtime. Operasi mengikuti izin akun peminta tanpa aktivasi alat satu per satu.'},
    {id:'model',title:'Model dan penggunaan',description:'Atur model, wilayah dan kredensial; periksa koneksi, estimasi penggunaan, dan anggaran.'},
    {id:'communication',title:'Komunikasi dan akun',description:'Pahami identitas percakapan dan cakupan balasan Hermes asli. Alur komunikasi lama disimpan terpisah.'},
    {id:'knowledge',title:'Keterampilan dan pengetahuan',description:'Bedakan keterampilan dan memori pribadi Hermes asli dari catatan pengetahuan toko yang dapat ditinjau.'},
    {id:'workbench',title:'Koneksi workbench',description:'Opsional: workbench eksternal dapat memberi tugas dan membaca bukti dari Hermes yang sama. Chat bawaan tidak memerlukan koneksi ini.'},
  ],
  subscription:'Gunakan koneksi model yang sudah ada. Nilai dolar adalah estimasi penggunaan berdasarkan tarif yang dikonfigurasi, bukan tagihan langganan atau sisa kuota. Halaman ini tidak dapat memastikan biaya tambahan penyedia. Penataan pengaturan tidak menambah layanan atau cadangan berbayar.',
  channelExceptions:'Pengaturan alur komunikasi lama',
  communicationHelp:'Hermes asli memakai akun pengirim dan keanggotaan percakapan yang sebenarnya. Balasan dan memori pribadi dipisahkan menurut akun dan penerima; karyawan tidak mewarisi izin keuangan atau personalia admin. Aktifkan atau hentikan layanan asli melalui sakelar pada Identitas dan runtime.',
  legacyHelp:'Pengaturan di bawah dipertahankan untuk pemroses alur lama. Pengaturan ini tidak mengontrol balasan, jeda, atau pengambilalihan manusia pada Hermes asli. Statusnya tidak menunjukkan apakah layanan asli berjalan.',
  nativeTitle:'Keterampilan, alat, dan ruang kerja asli',
  nativeHelp:'Hermes asli mengelola keterampilan, penemuan alat, subagen, dan memori pribadi. Pemasaran serta inventaris tidak memerlukan sakelar kemampuan terpisah. Minta Hermes di chat terkait untuk memeriksa keterampilan, mempelajari alur kerja, atau mengingat aturan. Ketersediaan bergantung pada runtime dan koneksi yang ada; kredensial eksternal tidak dibuat otomatis.',
  memoryHelp:'Ruang kerja pribadi asli dipisahkan menurut akun dan penerima percakapan. Catatan di bawah adalah pengetahuan toko dan pelajaran historis yang disimpan backend, bukan daftar lengkap memori atau keterampilan ruang kerja asli. Tinjau sebelum dibagikan kepada toko.',
}
export function aiSettingsSections(language: string) {
  return language.startsWith('zh') ? zh : language.startsWith('id') ? id : en
}
