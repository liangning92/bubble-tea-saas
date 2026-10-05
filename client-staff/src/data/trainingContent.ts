// 员工培训学院 - 多语言标准化培训资料
// 参考星巴克、喜茶、蜜雪冰城等大型连锁茶饮/咖啡品牌的门店运营标准（SOP）整理
// 语言：zh 中文 / en English / id Bahasa Indonesia

export type Lang = 'zh' | 'en' | 'id'
export type LText = Record<Lang, string>

export interface TrainingSection {
  title: LText
  points: LText[]
  tip?: LText          // 重点提示
  warning?: LText      // 禁止事项 / 红线
}

export interface QuizQuestion {
  q: LText
  options: LText[]
  answer: number       // 正确选项下标
}

export interface TrainingModule {
  key: string
  icon: string
  color: string        // tailwind 渐变色
  title: LText
  subtitle: LText
  minutes: number
  sections: TrainingSection[]
  quiz: QuizQuestion[]
}

export const tr = (text: LText | undefined, lang: string): string => {
  if (!text) return ''
  const l = (['zh', 'en', 'id'].includes(lang) ? lang : 'id') as Lang
  return text[l] || text.id || text.en
}

export const TRAINING_MODULES: TrainingModule[] = [
  // ==================== 1. 品牌与入职 ====================
  {
    key: 'onboarding',
    icon: '👋',
    color: 'from-sky-500 to-indigo-500',
    title: { zh: '入职须知与职业形象', en: 'Onboarding & Professional Image', id: 'Orientasi & Penampilan Profesional' },
    subtitle: { zh: '仪容仪表、考勤纪律、岗位职责', en: 'Grooming, attendance, job duties', id: 'Kerapian, kehadiran, tugas kerja' },
    minutes: 10,
    sections: [
      {
        title: { zh: '仪容仪表标准', en: 'Grooming Standards', id: 'Standar Kerapian' },
        points: [
          { zh: '统一穿着干净整洁的工服、围裙与工帽，名牌佩戴在左胸。', en: 'Wear a clean uniform, apron and cap; name tag on the left chest.', id: 'Pakai seragam, apron, dan topi yang bersih; name tag di dada kiri.' },
          { zh: '长发必须盘起并完全收进帽子或发网，不得有碎发外露。', en: 'Long hair must be tied up and fully covered by cap or hairnet.', id: 'Rambut panjang wajib diikat dan tertutup topi/hairnet sepenuhnya.' },
          { zh: '指甲剪短、不涂指甲油、不贴假指甲；工作时不佩戴戒指、手链、手表。', en: 'Short nails, no polish or fake nails; no rings, bracelets or watches on duty.', id: 'Kuku pendek, tanpa kutek/kuku palsu; tidak memakai cincin, gelang, jam saat bekerja.' },
          { zh: '穿防滑、包头的黑色工作鞋；不喷浓烈香水。', en: 'Wear black, closed-toe, non-slip shoes; no strong perfume.', id: 'Pakai sepatu hitam tertutup anti-slip; tidak memakai parfum menyengat.' }
        ],
        tip: { zh: '上岗前对着镜子做一次"从头到脚"自检。', en: 'Do a head-to-toe mirror check before every shift.', id: 'Cek penampilan dari kepala sampai kaki di cermin sebelum shift.' }
      },
      {
        title: { zh: '考勤与纪律', en: 'Attendance & Discipline', id: 'Kehadiran & Disiplin' },
        points: [
          { zh: '提前 10 分钟到店，换好工服后在员工 App 扫码打卡。', en: 'Arrive 10 minutes early, change, then clock in via the Staff App QR.', id: 'Datang 10 menit lebih awal, ganti seragam, lalu absen via QR di Staff App.' },
          { zh: '请假、换班、加班需提前在 App 中提交申请，经店长审批。', en: 'Leave, shift swaps and overtime must be requested in the App in advance.', id: 'Cuti, tukar shift, dan lembur wajib diajukan lebih dulu di App.' },
          { zh: '工作区域内禁止玩手机、吃东西、嚼口香糖；手机统一放在储物柜。', en: 'No phone use, eating or chewing gum in work area; phones stay in lockers.', id: 'Dilarang main HP, makan, atau permen karet di area kerja; HP disimpan di loker.' }
        ],
        warning: { zh: '严禁私自拿取店内原料或饮品，员工餐饮需按规定登记。', en: 'Never take store ingredients or drinks without permission; staff drinks must be recorded.', id: 'Dilarang mengambil bahan/minuman toko tanpa izin; minuman staf wajib dicatat.' }
      },
      {
        title: { zh: '岗位分工', en: 'Station Roles', id: 'Pembagian Posisi' },
        points: [
          { zh: '收银/点单岗：迎宾、点单、复述订单、收款、推荐新品与加料。', en: 'Cashier: greet, take order, repeat back, payment, suggest new items & toppings.', id: 'Kasir: menyambut, menerima pesanan, mengulang pesanan, pembayaran, menawarkan menu baru & topping.' },
          { zh: '制作岗：按配方标准出杯，保证口味一致与出杯速度。', en: 'Bar: make drinks exactly to recipe, ensuring consistency and speed.', id: 'Bar: membuat minuman sesuai resep, menjaga konsistensi dan kecepatan.' },
          { zh: '出品/打包岗：核对小票、封口、贴标签、叫号交付或交给骑手。', en: 'Handoff: check ticket, seal, label, call number or hand to rider.', id: 'Penyerahan: cek struk, seal, label, panggil nomor atau serahkan ke driver.' },
          { zh: '后场岗：煮珍珠、泡茶、备料、清洗器具与补货。', en: 'Back-of-house: cook pearls, brew tea, prep, wash tools, restock.', id: 'Belakang: masak boba, seduh teh, persiapan bahan, cuci alat, isi ulang stok.' }
        ]
      }
    ],
    quiz: [
      {
        q: { zh: '上班应提前多少分钟到店？', en: 'How early should you arrive before your shift?', id: 'Berapa menit lebih awal harus datang sebelum shift?' },
        options: [
          { zh: '准点到即可', en: 'Exactly on time', id: 'Tepat waktu saja' },
          { zh: '提前 10 分钟', en: '10 minutes early', id: '10 menit lebih awal' },
          { zh: '迟到 5 分钟内都可以', en: 'Up to 5 min late is fine', id: 'Telat 5 menit tidak apa-apa' }
        ],
        answer: 1
      },
      {
        q: { zh: '以下哪项在工作时是允许的？', en: 'Which is allowed while on duty?', id: 'Mana yang diperbolehkan saat bekerja?' },
        options: [
          { zh: '佩戴戒指和手链', en: 'Wearing rings and bracelets', id: 'Memakai cincin dan gelang' },
          { zh: '涂指甲油', en: 'Nail polish', id: 'Memakai kutek' },
          { zh: '头发完全收进帽子', en: 'Hair fully tucked under cap', id: 'Rambut tertutup topi sepenuhnya' }
        ],
        answer: 2
      },
      {
        q: { zh: '想和同事换班应该怎么做？', en: 'How do you swap a shift?', id: 'Bagaimana cara tukar shift?' },
        options: [
          { zh: '私下说好就行', en: 'Just agree privately', id: 'Cukup sepakat secara pribadi' },
          { zh: '在 App 提交换班申请，由店长审批', en: 'Submit a swap request in the App for manager approval', id: 'Ajukan tukar shift di App untuk disetujui manajer' }
        ],
        answer: 1
      }
    ]
  },

  // ==================== 2. 顾客服务 ====================
  {
    key: 'service',
    icon: '😊',
    color: 'from-pink-500 to-rose-500',
    title: { zh: '顾客服务标准', en: 'Customer Service Standards', id: 'Standar Pelayanan Pelanggan' },
    subtitle: { zh: '点单六步法、LATTE 客诉处理', en: '6-step ordering, LATTE recovery', id: '6 langkah pemesanan, metode LATTE' },
    minutes: 15,
    sections: [
      {
        title: { zh: '点单服务六步法', en: '6-Step Ordering Service', id: '6 Langkah Melayani Pesanan' },
        points: [
          { zh: '① 迎宾：顾客进店 3 秒内眼神接触、微笑并问候 "Selamat datang!"', en: '① Greet: within 3 seconds, eye contact, smile, "Selamat datang!"', id: '① Sambut: dalam 3 detik, kontak mata, senyum, "Selamat datang!"' },
          { zh: '② 了解需求：询问是否第一次来，主动推荐招牌或当季新品。', en: '② Discover: ask if it is their first visit; recommend signature or seasonal drinks.', id: '② Gali kebutuhan: tanya apakah pertama kali; rekomendasikan menu andalan/musiman.' },
          { zh: '③ 确认规格：杯型、甜度、冰量、加料必须逐一确认。', en: '③ Confirm size, sugar level, ice level and toppings one by one.', id: '③ Konfirmasi ukuran, level gula, level es, dan topping satu per satu.' },
          { zh: '④ 复述订单：完整复述一遍，避免做错。', en: '④ Repeat the full order back to avoid mistakes.', id: '④ Ulangi seluruh pesanan untuk menghindari kesalahan.' },
          { zh: '⑤ 会员与收款：询问是否会员（手机号积分），告知金额并确认支付方式（现金/QRIS/GoPay/OVO）。', en: '⑤ Ask for membership (phone for points), state total, confirm payment (Cash/QRIS/GoPay/OVO).', id: '⑤ Tanyakan member (nomor HP untuk poin), sebutkan total, konfirmasi pembayaran (Tunai/QRIS/GoPay/OVO).' },
          { zh: '⑥ 致谢与指引：告知取餐号与预计等待时间，"Terima kasih, mohon ditunggu ya!"', en: '⑥ Thank & guide: give queue number and wait time, "Terima kasih, mohon ditunggu ya!"', id: '⑥ Terima kasih: berikan nomor antrean & estimasi waktu, "Terima kasih, mohon ditunggu ya!"' }
        ],
        tip: { zh: '每单推荐一次加料（如珍珠、奶盖），是提升客单价最有效的方式。', en: 'Suggest one topping (pearls, cheese foam) per order — the easiest way to raise ticket size.', id: 'Tawarkan satu topping (boba, cheese foam) tiap pesanan — cara termudah menaikkan nilai transaksi.' }
      },
      {
        title: { zh: '出杯交付标准', en: 'Drink Handoff Standard', id: 'Standar Penyerahan Minuman' },
        points: [
          { zh: '叫号时清晰大声，同时说出饮品名称，例如 "A05，大杯珍珠奶茶少冰"。', en: 'Call clearly with drink name, e.g. "A05, large pearl milk tea, less ice".', id: 'Panggil dengan jelas beserta nama minuman, mis. "A05, milk tea boba large, less ice".' },
          { zh: '双手递杯，杯身标签朝向顾客，附上吸管和纸巾。', en: 'Hand over with both hands, label facing customer, with straw and napkin.', id: 'Serahkan dengan dua tangan, label menghadap pelanggan, sertakan sedotan dan tisu.' },
          { zh: '外卖单必须核对平台订单号，封袋并贴封口贴。', en: 'Delivery orders: verify platform order ID, seal the bag with a sticker.', id: 'Pesanan online: cocokkan nomor order platform, segel kantong dengan stiker.' }
        ]
      },
      {
        title: { zh: 'LATTE 客诉处理法（星巴克标准）', en: 'LATTE Complaint Recovery (Starbucks)', id: 'Metode LATTE Menangani Keluhan (Starbucks)' },
        points: [
          { zh: 'L - Listen 倾听：不打断，让顾客把话说完。', en: 'L - Listen: do not interrupt; let the customer finish.', id: 'L - Listen: dengarkan, jangan memotong pembicaraan.' },
          { zh: 'A - Acknowledge 认同：理解顾客感受，"非常抱歉给您带来不好的体验"。', en: 'A - Acknowledge: show empathy, "I am really sorry for this experience".', id: 'A - Acknowledge: tunjukkan empati, "Mohon maaf atas ketidaknyamanannya".' },
          { zh: 'T - Take action 行动：立即重做饮品或按店长授权补偿。', en: 'T - Take action: remake the drink immediately or compensate as authorized.', id: 'T - Take action: buat ulang minuman segera atau beri kompensasi sesuai wewenang.' },
          { zh: 'T - Thank 感谢：感谢顾客提出意见。', en: 'T - Thank: thank the customer for the feedback.', id: 'T - Thank: berterima kasih atas masukannya.' },
          { zh: 'E - Encourage 邀请再来：邀请顾客下次再光临。', en: 'E - Encourage return: invite them to come back.', id: 'E - Encourage: ajak pelanggan untuk datang kembali.' }
        ],
        warning: { zh: '绝不与顾客争辩；超出权限的问题立即请店长处理。', en: 'Never argue with a customer; escalate anything beyond your authority to the manager.', id: 'Jangan pernah berdebat dengan pelanggan; serahkan ke manajer jika di luar wewenang.' }
      }
    ],
    quiz: [
      {
        q: { zh: '顾客进店后应在多少秒内问候？', en: 'Greet customers within how many seconds?', id: 'Sapa pelanggan dalam berapa detik?' },
        options: [
          { zh: '3 秒', en: '3 seconds', id: '3 detik' },
          { zh: '30 秒', en: '30 seconds', id: '30 detik' },
          { zh: '等顾客开口再说', en: 'Wait for them to speak', id: 'Tunggu pelanggan bicara dulu' }
        ],
        answer: 0
      },
      {
        q: { zh: 'LATTE 中的第一个 "T" 代表什么？', en: 'What does the first "T" in LATTE stand for?', id: 'Apa arti "T" pertama dalam LATTE?' },
        options: [
          { zh: 'Talk 解释原因', en: 'Talk (explain why)', id: 'Talk (jelaskan alasan)' },
          { zh: 'Take action 立即行动解决', en: 'Take action', id: 'Take action (segera bertindak)' },
          { zh: 'Tell 告诉店长', en: 'Tell the manager', id: 'Tell (beri tahu manajer)' }
        ],
        answer: 1
      },
      {
        q: { zh: '收款前必须做什么？', en: 'What must you do before payment?', id: 'Apa yang wajib dilakukan sebelum pembayaran?' },
        options: [
          { zh: '完整复述订单', en: 'Repeat the full order back', id: 'Mengulang seluruh pesanan' },
          { zh: '直接打单', en: 'Print immediately', id: 'Langsung cetak' }
        ],
        answer: 0
      }
    ]
  },

  // ==================== 3. 食品安全与卫生 ====================
  {
    key: 'hygiene',
    icon: '🧼',
    color: 'from-emerald-500 to-teal-500',
    title: { zh: '食品安全与卫生', en: 'Food Safety & Hygiene', id: 'Keamanan Pangan & Kebersihan' },
    subtitle: { zh: '洗手七步、温度控制、清洁排程', en: 'Handwashing, temperature, cleaning', id: 'Cuci tangan, suhu, jadwal bersih' },
    minutes: 15,
    sections: [
      {
        title: { zh: '洗手标准（至少 20 秒）', en: 'Handwashing (at least 20 seconds)', id: 'Cuci Tangan (minimal 20 detik)' },
        points: [
          { zh: '必须洗手的时机：上岗前、如厕后、收钱后、触碰垃圾/手机/脸部后、处理生鲜水果前后。', en: 'Must wash: before work, after toilet, after cash, after touching trash/phone/face, before & after handling fruit.', id: 'Wajib cuci: sebelum kerja, setelah toilet, setelah pegang uang, sampah/HP/wajah, sebelum & sesudah memegang buah.' },
          { zh: '七步洗手：掌心、手背、指缝、指背、拇指、指尖、手腕，依次搓洗。', en: '7 steps: palms, backs, between fingers, finger backs, thumbs, fingertips, wrists.', id: '7 langkah: telapak, punggung tangan, sela jari, punggung jari, ibu jari, ujung jari, pergelangan.' },
          { zh: '使用一次性纸巾擦干，再用酒精消毒。', en: 'Dry with disposable paper towel, then sanitize with alcohol.', id: 'Keringkan dengan tisu sekali pakai, lalu semprot alkohol.' }
        ],
        tip: { zh: '手部有伤口必须贴防水创可贴并戴手套。', en: 'Cover any cut with a waterproof plaster and wear gloves.', id: 'Luka di tangan wajib ditutup plester tahan air dan memakai sarung tangan.' }
      },
      {
        title: { zh: '温度控制', en: 'Temperature Control', id: 'Kontrol Suhu' },
        points: [
          { zh: '冷藏：0–5°C（鲜奶、奶油、切好的水果、茶汤备用）。', en: 'Chiller: 0–5°C (fresh milk, cream, cut fruit, reserve tea).', id: 'Chiller: 0–5°C (susu segar, krim, buah potong, cadangan teh).' },
          { zh: '冷冻：-18°C 以下（冷冻水果、冰淇淋基底）。', en: 'Freezer: −18°C or below (frozen fruit, ice-cream base).', id: 'Freezer: −18°C atau lebih rendah (buah beku, bahan es krim).' },
          { zh: '危险温度区 5–60°C：易腐原料在此区间不得超过 2 小时。', en: 'Danger zone 5–60°C: perishables must not stay there over 2 hours.', id: 'Zona bahaya 5–60°C: bahan mudah rusak tidak boleh lebih dari 2 jam.' },
          { zh: '每天开店与交接班时检查并记录冰箱温度。', en: 'Check and log fridge temperatures at opening and every shift change.', id: 'Cek dan catat suhu kulkas saat buka toko dan setiap pergantian shift.' }
        ],
        warning: { zh: '冰块只能用专用冰铲取用，禁止用杯子直接舀冰；冰铲不得放在冰里。', en: 'Use only the ice scoop — never scoop ice with a cup; never leave the scoop inside the ice.', id: 'Ambil es hanya dengan sekop es — jangan pakai gelas; sekop tidak boleh ditinggal di dalam es.' }
      },
      {
        title: { zh: '清洁消毒排程', en: 'Cleaning Schedule', id: 'Jadwal Kebersihan' },
        points: [
          { zh: '每 30 分钟：擦拭吧台台面、清洗量杯与雪克杯、清理地面水渍。', en: 'Every 30 min: wipe counters, rinse jiggers & shakers, dry floor spills.', id: 'Setiap 30 menit: lap meja bar, bilas gelas takar & shaker, keringkan lantai basah.' },
          { zh: '每 2 小时：清洗茶桶、果糖机出口、封口机台面。', en: 'Every 2 hours: wash tea urns, fructose dispenser nozzle, sealer surface.', id: 'Setiap 2 jam: cuci tempat teh, nozzle dispenser fruktosa, permukaan mesin seal.' },
          { zh: '每天闭店：制冰机外壳、冰箱内部、下水道、垃圾桶全面清洁消毒。', en: 'Daily closing: clean & sanitize ice machine exterior, fridges, drains, bins.', id: 'Tutup toko harian: bersihkan & sanitasi mesin es, kulkas, saluran air, tempat sampah.' },
          { zh: '每周：制冰机内部除垢消毒、冰箱除霜、排风扇清洁。', en: 'Weekly: descale ice machine interior, defrost fridges, clean exhaust fan.', id: 'Mingguan: descaling mesin es, defrost kulkas, bersihkan exhaust fan.' }
        ],
        tip: { zh: '完成清洁后在 App "卫生任务" 中拍照打卡，店长可实时查看。', en: 'After cleaning, submit photo proof in the App "Hygiene Tasks".', id: 'Setelah bersih-bersih, kirim foto bukti di menu "Tugas Kebersihan" App.' }
      },
      {
        title: { zh: '过敏原与交叉污染', en: 'Allergens & Cross-Contamination', id: 'Alergen & Kontaminasi Silang' },
        points: [
          { zh: '常见过敏原：牛奶、坚果（花生酱）、大豆、麸质。顾客询问时如实告知，不确定就请店长。', en: 'Common allergens: milk, nuts (peanut butter), soy, gluten. Answer honestly; ask the manager if unsure.', id: 'Alergen umum: susu, kacang (selai kacang), kedelai, gluten. Jawab jujur; tanya manajer jika ragu.' },
          { zh: '生熟分开：水果砧板、刀具与其他用途分开，按颜色区分。', en: 'Separate tools: fruit boards and knives are color-coded and not shared.', id: 'Pisahkan alat: talenan & pisau buah diberi kode warna dan tidak dicampur.' }
        ]
      }
    ],
    quiz: [
      {
        q: { zh: '洗手至少需要多长时间？', en: 'Minimum handwashing time?', id: 'Minimal waktu cuci tangan?' },
        options: [
          { zh: '5 秒', en: '5 seconds', id: '5 detik' },
          { zh: '20 秒', en: '20 seconds', id: '20 detik' },
          { zh: '冲一下就行', en: 'A quick rinse', id: 'Bilas sebentar' }
        ],
        answer: 1
      },
      {
        q: { zh: '冷藏冰箱的标准温度是？', en: 'Correct chiller temperature?', id: 'Suhu chiller yang benar?' },
        options: [
          { zh: '0–5°C', en: '0–5°C', id: '0–5°C' },
          { zh: '8–12°C', en: '8–12°C', id: '8–12°C' },
          { zh: '-18°C', en: '−18°C', id: '−18°C' }
        ],
        answer: 0
      },
      {
        q: { zh: '正确的取冰方式是？', en: 'Correct way to get ice?', id: 'Cara mengambil es yang benar?' },
        options: [
          { zh: '用杯子直接舀', en: 'Scoop with the cup', id: 'Ambil langsung dengan gelas' },
          { zh: '用专用冰铲，用完放回支架', en: 'Use the ice scoop and return it to its holder', id: 'Pakai sekop es lalu kembalikan ke tempatnya' },
          { zh: '戴手套用手抓', en: 'Grab by gloved hand', id: 'Ambil dengan tangan bersarung' }
        ],
        answer: 1
      },
      {
        q: { zh: '收完现金后马上做饮品前需要？', en: 'After handling cash, before making drinks you must…', id: 'Setelah memegang uang, sebelum membuat minuman harus…' },
        options: [
          { zh: '洗手消毒', en: 'Wash and sanitize hands', id: 'Cuci tangan dan sanitasi' },
          { zh: '直接制作', en: 'Start making directly', id: 'Langsung membuat' }
        ],
        answer: 0
      }
    ]
  },

  // ==================== 4. 原料管理 ====================
  {
    key: 'materials',
    icon: '📦',
    color: 'from-amber-500 to-orange-500',
    title: { zh: '原料管理', en: 'Raw Material Management', id: 'Manajemen Bahan Baku' },
    subtitle: { zh: '收货验收、先进先出、效期标签', en: 'Receiving, FIFO, shelf-life labels', id: 'Penerimaan, FIFO, label kedaluwarsa' },
    minutes: 15,
    sections: [
      {
        title: { zh: '收货验收', en: 'Receiving Goods', id: 'Penerimaan Barang' },
        points: [
          { zh: '核对送货单：品名、规格、数量与采购单一致。', en: 'Check delivery note: item, spec and quantity match the PO.', id: 'Cek surat jalan: nama, spesifikasi, jumlah sesuai PO.' },
          { zh: '检查包装完好、无胀袋、无漏液，生产日期与保质期充足（剩余效期 ≥ 2/3）。', en: 'Packaging intact, no bloating or leaks; at least 2/3 of shelf life remaining.', id: 'Kemasan utuh, tidak menggembung/bocor; sisa masa simpan minimal 2/3.' },
          { zh: '冷链原料（鲜奶、奶油）到货温度需 ≤ 5°C，超温拒收。', en: 'Cold-chain items (milk, cream) must arrive ≤ 5°C, otherwise reject.', id: 'Bahan rantai dingin (susu, krim) harus ≤ 5°C saat tiba, jika tidak tolak.' },
          { zh: '验收合格后立即在 App "库存" 中做入库登记。', en: 'Record stock-in in the App "Inventory" immediately after acceptance.', id: 'Segera catat barang masuk di menu "Inventaris" App setelah diterima.' }
        ]
      },
      {
        title: { zh: '先进先出 FIFO / 先到期先出 FEFO', en: 'FIFO / FEFO Rotation', id: 'Rotasi FIFO / FEFO' },
        points: [
          { zh: '新货放后面/下面，旧货放前面/上面，先用旧货。', en: 'New stock goes behind/below; older stock in front/on top and used first.', id: 'Stok baru di belakang/bawah; stok lama di depan/atas dan dipakai lebih dulu.' },
          { zh: '到期时间更早的优先使用（FEFO 优先于 FIFO）。', en: 'Items expiring sooner are used first (FEFO over FIFO).', id: 'Bahan yang lebih cepat kedaluwarsa dipakai lebih dulu (FEFO di atas FIFO).' },
          { zh: '原料离地 15cm、离墙 5cm 存放，化学品（清洁剂）与食品分开存放。', en: 'Store 15 cm off the floor and 5 cm from walls; chemicals kept away from food.', id: 'Simpan 15 cm dari lantai dan 5 cm dari dinding; bahan kimia terpisah dari makanan.' }
        ]
      },
      {
        title: { zh: '开封效期标签（贴标必写：品名/开封时间/到期时间/操作人）', en: 'Shelf-Life Labels (item / opened / expires / initials)', id: 'Label Masa Simpan (nama / dibuka / kedaluwarsa / paraf)' },
        points: [
          { zh: '茶汤（红茶/绿茶/乌龙）：泡好后常温 4 小时内用完。', en: 'Brewed tea (black/green/oolong): use within 4 hours at room temp.', id: 'Teh seduh (hitam/hijau/oolong): habiskan dalam 4 jam suhu ruang.' },
          { zh: '煮好的珍珠：保温 4 小时，超时报废，严禁冷藏回用。', en: 'Cooked pearls: 4 hours warm holding; discard after — never refrigerate & reuse.', id: 'Boba matang: 4 jam di penghangat; buang setelahnya — jangan disimpan di kulkas & dipakai lagi.' },
          { zh: '开封鲜奶：冷藏 24 小时；开封奶精/炼乳：冷藏 3 天。', en: 'Opened fresh milk: 24 h chilled; opened creamer/condensed milk: 3 days chilled.', id: 'Susu segar dibuka: 24 jam di chiller; creamer/SKM dibuka: 3 hari di chiller.' },
          { zh: '切好的新鲜水果：冷藏 24 小时；打好的奶盖：冷藏 4 小时。', en: 'Cut fresh fruit: 24 h chilled; whipped cheese foam: 4 h chilled.', id: 'Buah potong: 24 jam di chiller; cheese foam: 4 jam di chiller.' },
          { zh: '果酱/糖浆开封：按包装说明，一般冷藏 7–14 天。', en: 'Opened jams/syrups: follow label, usually 7–14 days chilled.', id: 'Selai/sirup dibuka: ikuti label, biasanya 7–14 hari di chiller.' }
        ],
        warning: { zh: '没有标签或超过效期的原料一律报废，不允许"闻一闻还能用"。', en: 'Unlabeled or expired items are discarded — no "smells fine" exceptions.', id: 'Bahan tanpa label atau kedaluwarsa wajib dibuang — tidak ada alasan "masih wangi".' }
      },
      {
        title: { zh: '报损与盘点', en: 'Waste & Stock Count', id: 'Pencatatan Waste & Stok Opname' },
        points: [
          { zh: '所有报废（过期、做错、洒漏）都要在 App 中登记报损，并注明原因。', en: 'Log every waste (expired, wrong drink, spill) in the App with the reason.', id: 'Catat setiap waste (kedaluwarsa, salah buat, tumpah) di App beserta alasannya.' },
          { zh: '闭店时盘点高价值原料（奶盖粉、鲜奶、水果、珍珠），差异超过 5% 立即报告店长。', en: 'At closing, count high-value items; report variance over 5% to the manager.', id: 'Saat tutup, hitung bahan bernilai tinggi; laporkan selisih di atas 5% ke manajer.' }
        ],
        tip: { zh: '按销量预估备料：雨天和工作日下午量少，周末与发薪日量大。', en: 'Prep by forecast: rainy days & weekday afternoons are slower; weekends & paydays are busy.', id: 'Siapkan bahan sesuai prediksi: hari hujan & siang hari kerja sepi; akhir pekan & gajian ramai.' }
      }
    ],
    quiz: [
      {
        q: { zh: '煮好的珍珠最长可保存多久？', en: 'Max holding time for cooked pearls?', id: 'Maksimal waktu simpan boba matang?' },
        options: [
          { zh: '4 小时', en: '4 hours', id: '4 jam' },
          { zh: '12 小时', en: '12 hours', id: '12 jam' },
          { zh: '冷藏到第二天', en: 'Refrigerate until tomorrow', id: 'Simpan di kulkas sampai besok' }
        ],
        answer: 0
      },
      {
        q: { zh: 'FIFO 的意思是？', en: 'FIFO means…', id: 'FIFO artinya…' },
        options: [
          { zh: '先进先出，先用旧货', en: 'First in, first out — use older stock first', id: 'Masuk pertama, keluar pertama — pakai stok lama dulu' },
          { zh: '先用新货，口感更好', en: 'Use new stock first for better taste', id: 'Pakai stok baru dulu agar lebih enak' }
        ],
        answer: 0
      },
      {
        q: { zh: '效期标签不需要写哪一项？', en: 'Which is NOT required on a shelf-life label?', id: 'Mana yang TIDAK wajib di label masa simpan?' },
        options: [
          { zh: '开封时间', en: 'Opened time', id: 'Waktu dibuka' },
          { zh: '到期时间', en: 'Expiry time', id: 'Waktu kedaluwarsa' },
          { zh: '原料进价', en: 'Purchase price', id: 'Harga beli' }
        ],
        answer: 2
      },
      {
        q: { zh: '鲜奶到货温度 9°C，应该？', en: 'Milk arrives at 9°C. You should…', id: 'Susu tiba bersuhu 9°C. Anda harus…' },
        options: [
          { zh: '先放冰箱就好', en: 'Just put it in the fridge', id: 'Masukkan ke kulkas saja' },
          { zh: '拒收并报告店长', en: 'Reject and inform the manager', id: 'Tolak dan laporkan ke manajer' }
        ],
        answer: 1
      }
    ]
  },

  // ==================== 5. 产品制作标准 ====================
  {
    key: 'production',
    icon: '🧋',
    color: 'from-purple-500 to-fuchsia-500',
    title: { zh: '产品制作标准', en: 'Drink Preparation Standards', id: 'Standar Pembuatan Minuman' },
    subtitle: { zh: '泡茶、煮珍珠、糖冰标准、出杯流程', en: 'Tea, pearls, sugar/ice, build order', id: 'Teh, boba, gula/es, urutan racik' },
    minutes: 20,
    sections: [
      {
        title: { zh: '标准出杯流程（所有饮品通用）', en: 'Standard Build Order (all drinks)', id: 'Urutan Racik Standar (semua minuman)' },
        points: [
          { zh: '① 看小票：确认品名、杯型、甜度、冰量、加料。', en: '① Read ticket: drink, size, sugar, ice, toppings.', id: '① Baca struk: minuman, ukuran, gula, es, topping.' },
          { zh: '② 取对应杯型，先加小料（珍珠/椰果/布丁）到杯底。', en: '② Take the right cup; add toppings (pearls/jelly/pudding) to the bottom first.', id: '② Ambil gelas sesuai ukuran; masukkan topping (boba/jelly/puding) di dasar terlebih dulu.' },
          { zh: '③ 按甜度用果糖机定量加糖。', en: '③ Dispense sugar with the fructose machine by sugar level.', id: '③ Tuang gula dengan mesin fruktosa sesuai level gula.' },
          { zh: '④ 用量杯按配方加入茶汤 / 奶 / 果酱（看下方配方手册的克数）。', en: '④ Add tea / milk / jam with jiggers by recipe grams (see Recipe Book).', id: '④ Tambahkan teh / susu / selai dengan gelas takar sesuai gram resep (lihat Buku Resep).' },
          { zh: '⑤ 在雪克杯中加冰，摇匀 10–15 下至杯壁起霜。', en: '⑤ Add ice in the shaker and shake 10–15 times until frosty.', id: '⑤ Masukkan es ke shaker, kocok 10–15 kali hingga dingin berembun.' },
          { zh: '⑥ 倒入杯中，九分满，用封口机封口，贴标签。', en: '⑥ Pour to 90% full, seal with the sealer, apply label.', id: '⑥ Tuang hingga 90% penuh, seal dengan mesin, tempel label.' },
          { zh: '⑦ 自检：封口无漏、标签正确、外观干净，再出杯。', en: '⑦ Self-check: no leaks, correct label, clean cup before handoff.', id: '⑦ Cek mandiri: tidak bocor, label benar, gelas bersih sebelum diserahkan.' }
        ],
        tip: { zh: '一杯标准饮品目标出杯时间：90 秒以内。', en: 'Target time per standard drink: under 90 seconds.', id: 'Target waktu per minuman standar: di bawah 90 detik.' }
      },
      {
        title: { zh: '甜度与冰量标准', en: 'Sugar & Ice Levels', id: 'Standar Level Gula & Es' },
        points: [
          { zh: '甜度：正常糖 100% / 少糖 70% / 半糖 50% / 微糖 30% / 无糖 0%（以配方标准糖量为 100%）。', en: 'Sugar: Normal 100% / Less 70% / Half 50% / Light 30% / None 0% (of recipe sugar).', id: 'Gula: Normal 100% / Less 70% / Half 50% / Sedikit 30% / Tanpa 0% (dari gula resep).' },
          { zh: '冰量：正常冰（冰块到杯身 2/3）/ 少冰（1/3）/ 去冰（不加冰，补足茶奶）。', en: 'Ice: Normal (2/3 of cup) / Less (1/3) / No ice (top up with tea/milk).', id: 'Es: Normal (2/3 gelas) / Less (1/3) / Tanpa es (tambah teh/susu).' },
          { zh: '去冰或少冰不能减少饮品总量，需用茶汤或奶补足至九分满。', en: 'Less/no ice must not reduce volume — top up to 90% with tea or milk.', id: 'Less/tanpa es tidak boleh mengurangi volume — tambah teh/susu hingga 90%.' }
        ]
      },
      {
        title: { zh: '泡茶标准', en: 'Tea Brewing Standard', id: 'Standar Menyeduh Teh' },
        points: [
          { zh: '红茶：茶叶 50g + 95°C 热水 1500ml，焖泡 8 分钟，每 4 分钟搅拌一次。', en: 'Black tea: 50 g leaves + 1500 ml water at 95°C, steep 8 min, stir every 4 min.', id: 'Teh hitam: 50 g daun + 1500 ml air 95°C, seduh 8 menit, aduk tiap 4 menit.' },
          { zh: '绿茶/茉莉：茶叶 40g + 80°C 热水 1500ml，焖泡 6 分钟（水温过高会发苦）。', en: 'Green/jasmine: 40 g + 1500 ml at 80°C, steep 6 min (too hot = bitter).', id: 'Teh hijau/melati: 40 g + 1500 ml air 80°C, seduh 6 menit (terlalu panas = pahit).' },
          { zh: '乌龙：茶叶 45g + 90°C 热水 1500ml，焖泡 7 分钟。', en: 'Oolong: 45 g + 1500 ml at 90°C, steep 7 min.', id: 'Oolong: 45 g + 1500 ml air 90°C, seduh 7 menit.' },
          { zh: '过滤茶渣后加入 500g 冰块急速降温，倒入保温桶并贴时间标签（4 小时效期）。', en: 'Strain, add 500 g ice to cool rapidly, pour into urn, label time (4 h shelf life).', id: 'Saring, tambahkan 500 g es untuk mendinginkan cepat, tuang ke tempat teh, beri label waktu (4 jam).' }
        ],
        tip: { zh: '具体克数以门店配方为准；以上为通用基准，可在后台产品描述中自定义。', en: 'Store recipes take priority; above is a general baseline.', id: 'Resep toko lebih diutamakan; di atas adalah standar umum.' }
      },
      {
        title: { zh: '煮珍珠标准', en: 'Cooking Tapioca Pearls', id: 'Memasak Boba' },
        points: [
          { zh: '水与珍珠比例 8:1（例：4L 水煮 500g 珍珠），水大滚后再下珍珠并立即搅拌防粘底。', en: 'Water:pearl ratio 8:1 (4 L for 500 g); add pearls at rolling boil and stir immediately.', id: 'Rasio air:boba 8:1 (4 L untuk 500 g); masukkan boba saat air mendidih dan langsung aduk.' },
          { zh: '大火煮 25 分钟（期间每 5 分钟搅拌），关火焖 25 分钟。', en: 'Boil on high for 25 min (stir every 5 min), then rest covered 25 min.', id: 'Rebus api besar 25 menit (aduk tiap 5 menit), lalu diamkan tertutup 25 menit.' },
          { zh: '捞出过冷水冲洗表面淀粉，加入黑糖浆/果糖拌匀（500g 珍珠约 100g 糖浆）。', en: 'Rinse in cold water, then mix with brown-sugar syrup (~100 g per 500 g pearls).', id: 'Bilas air dingin, lalu campur sirup gula aren (~100 g per 500 g boba).' },
          { zh: '放入保温桶，贴标签，4 小时内用完。合格标准：外 Q 内软、无白芯。', en: 'Keep in warmer, label, use within 4 h. Good pearls: chewy outside, soft inside, no white core.', id: 'Simpan di penghangat, beri label, habiskan dalam 4 jam. Boba baik: kenyal luar, lembut dalam, tanpa inti putih.' }
        ]
      },
      {
        title: { zh: '设备使用', en: 'Equipment Use', id: 'Penggunaan Peralatan' },
        points: [
          { zh: '果糖机：每天开店先排出 3 次校准出糖量，确保 1 次 = 10ml。', en: 'Fructose machine: purge 3 times at opening; calibrate 1 shot = 10 ml.', id: 'Mesin fruktosa: buang 3 kali saat buka; kalibrasi 1 shot = 10 ml.' },
          { zh: '封口机：温度预热到 180°C，封膜卷用完立即更换，封口后倒置检查不漏。', en: 'Sealer: preheat to 180°C, replace film roll when empty, invert to check leaks.', id: 'Mesin seal: panaskan ke 180°C, ganti roll film saat habis, balik gelas untuk cek bocor.' },
          { zh: '萃茶机/开水器：远离儿童与顾客区域，出水时手不要放在出水口下方。', en: 'Hot water dispenser: keep hands away from the outlet when dispensing.', id: 'Dispenser air panas: jauhkan tangan dari lubang keluar saat mengalirkan air.' }
        ]
      }
    ],
    quiz: [
      {
        q: { zh: '出杯流程中，小料（珍珠）应该什么时候加？', en: 'When are toppings (pearls) added?', id: 'Kapan topping (boba) dimasukkan?' },
        options: [
          { zh: '最先加到杯底', en: 'First, at the bottom of the cup', id: 'Pertama, di dasar gelas' },
          { zh: '封口前最后加', en: 'Last, before sealing', id: 'Terakhir, sebelum seal' }
        ],
        answer: 0
      },
      {
        q: { zh: '"少糖" 是标准糖量的多少？', en: '"Less sugar" equals what % of standard sugar?', id: '"Less sugar" berapa % dari gula standar?' },
        options: [
          { zh: '30%', en: '30%', id: '30%' },
          { zh: '50%', en: '50%', id: '50%' },
          { zh: '70%', en: '70%', id: '70%' }
        ],
        answer: 2
      },
      {
        q: { zh: '顾客点"去冰"，应该怎么做？', en: 'Customer orders "no ice". You should…', id: 'Pelanggan pesan "tanpa es". Anda harus…' },
        options: [
          { zh: '直接少装一些', en: 'Just fill less', id: 'Isi lebih sedikit saja' },
          { zh: '用茶汤或奶补足到九分满', en: 'Top up with tea or milk to 90% full', id: 'Tambah teh atau susu hingga 90% penuh' }
        ],
        answer: 1
      },
      {
        q: { zh: '绿茶用多少度的水冲泡？', en: 'Water temperature for green tea?', id: 'Suhu air untuk teh hijau?' },
        options: [
          { zh: '100°C', en: '100°C', id: '100°C' },
          { zh: '80°C', en: '80°C', id: '80°C' },
          { zh: '60°C', en: '60°C', id: '60°C' }
        ],
        answer: 1
      }
    ]
  },

  // ==================== 6. 安全与应急 ====================
  {
    key: 'safety',
    icon: '🦺',
    color: 'from-red-500 to-orange-600',
    title: { zh: '安全与应急', en: 'Safety & Emergency', id: 'Keselamatan & Darurat' },
    subtitle: { zh: '防烫防滑、用电、消防、现金安全', en: 'Burns, slips, electrical, fire, cash', id: 'Luka bakar, licin, listrik, api, uang' },
    minutes: 10,
    sections: [
      {
        title: { zh: '日常安全', en: 'Daily Safety', id: 'Keselamatan Harian' },
        points: [
          { zh: '防烫：搬运热水或煮锅时大声提醒 "Awas panas!"，使用隔热手套。', en: 'Burns: call "Awas panas!" when carrying hot liquid; use heat gloves.', id: 'Luka bakar: teriakkan "Awas panas!" saat membawa cairan panas; pakai sarung tangan tahan panas.' },
          { zh: '防滑：地面有水立即擦干并放置"小心地滑"警示牌。', en: 'Slips: dry wet floors at once and place a "wet floor" sign.', id: 'Licin: segera keringkan lantai basah dan pasang tanda "lantai licin".' },
          { zh: '用电：湿手不碰插头和开关；设备异常（冒烟、异味）立即断电并报告。', en: 'Electrical: never touch plugs with wet hands; cut power and report if smoke/smell.', id: 'Listrik: jangan sentuh colokan dengan tangan basah; matikan listrik dan lapor jika berasap/bau.' },
          { zh: '刀具：切水果时刀尖朝下，用完立即清洗放回刀架。', en: 'Knives: point down when carrying; wash and return to rack after use.', id: 'Pisau: arahkan ke bawah saat dibawa; cuci dan kembalikan ke rak setelah dipakai.' }
        ]
      },
      {
        title: { zh: '应急处理', en: 'Emergency Response', id: 'Penanganan Darurat' },
        points: [
          { zh: '烫伤：立即用流动冷水冲洗 15–20 分钟，不要涂牙膏或酱油，严重时就医。', en: 'Burn: run cool water 15–20 min; no toothpaste or soy sauce; seek medical help if serious.', id: 'Luka bakar: aliri air dingin 15–20 menit; jangan pakai pasta gigi/kecap; ke dokter jika parah.' },
          { zh: '火灾：先断电，小火用灭火器（拔销-对准-压把-扫射），火势大立即疏散顾客并拨打 113。', en: 'Fire: cut power; small fire use extinguisher (Pull-Aim-Squeeze-Sweep); large fire evacuate and call 113.', id: 'Kebakaran: matikan listrik; api kecil pakai APAR (Tarik-Arahkan-Tekan-Sapu); api besar evakuasi dan telepon 113.' },
          { zh: '顾客突发不适：保持冷静，通知店长，必要时拨打急救电话 118/119。', en: 'Customer feels unwell: stay calm, inform manager, call 118/119 if needed.', id: 'Pelanggan sakit mendadak: tetap tenang, beri tahu manajer, telepon 118/119 jika perlu.' }
        ],
        tip: { zh: '熟记店内灭火器、急救箱、总电闸的位置。', en: 'Know where the fire extinguisher, first-aid kit and main breaker are.', id: 'Hafalkan lokasi APAR, kotak P3K, dan saklar listrik utama.' }
      },
      {
        title: { zh: '现金与财产安全', en: 'Cash & Property Security', id: 'Keamanan Uang & Aset' },
        points: [
          { zh: '收大额现金时当面验钞，钱箱随手关闭。', en: 'Check large notes in front of the customer; close the drawer immediately.', id: 'Cek uang pecahan besar di depan pelanggan; segera tutup laci kas.' },
          { zh: '交接班必须当面点清备用金，并在 POS 中记录。', en: 'Count the float together at shift change and record it in POS.', id: 'Hitung uang kas bersama saat ganti shift dan catat di POS.' }
        ],
        warning: { zh: '遇到抢劫时以人身安全第一，不要反抗，事后立即报警并通知店长。', en: 'In a robbery, personal safety first — do not resist; call police and manager afterwards.', id: 'Saat perampokan, keselamatan diri utama — jangan melawan; lapor polisi dan manajer setelahnya.' }
      }
    ],
    quiz: [
      {
        q: { zh: '被烫伤后第一步应该？', en: 'First step after a burn?', id: 'Langkah pertama setelah luka bakar?' },
        options: [
          { zh: '涂牙膏', en: 'Apply toothpaste', id: 'Oles pasta gigi' },
          { zh: '流动冷水冲 15–20 分钟', en: 'Cool running water for 15–20 min', id: 'Aliri air dingin 15–20 menit' }
        ],
        answer: 1
      },
      {
        q: { zh: '印尼火警电话是？', en: 'Fire emergency number in Indonesia?', id: 'Nomor darurat pemadam kebakaran di Indonesia?' },
        options: [
          { zh: '110', en: '110', id: '110' },
          { zh: '113', en: '113', id: '113' },
          { zh: '911', en: '911', id: '911' }
        ],
        answer: 1
      },
      {
        q: { zh: '地面有水时应该？', en: 'When the floor is wet you should…', id: 'Saat lantai basah Anda harus…' },
        options: [
          { zh: '忙完再擦', en: 'Clean it later', id: 'Bersihkan nanti' },
          { zh: '立即擦干并放警示牌', en: 'Dry it immediately and place a sign', id: 'Segera keringkan dan pasang tanda' }
        ],
        answer: 1
      }
    ]
  }
]

// 开店 / 闭店检查清单
export const CHECKLISTS: { key: string; title: LText; items: LText[] }[] = [
  {
    key: 'opening',
    title: { zh: '☀️ 开店检查清单', en: '☀️ Opening Checklist', id: '☀️ Checklist Buka Toko' },
    items: [
      { zh: '检查并记录冰箱、冷冻柜温度', en: 'Check & log fridge/freezer temperatures', id: 'Cek & catat suhu kulkas/freezer' },
      { zh: '检查原料效期，过期报废并登记', en: 'Check ingredient expiry; discard & log expired', id: 'Cek kedaluwarsa bahan; buang & catat yang kedaluwarsa' },
      { zh: '泡第一桶茶、煮第一锅珍珠', en: 'Brew first tea batch, cook first pearl batch', id: 'Seduh teh pertama, masak boba pertama' },
      { zh: '果糖机排气校准、封口机预热', en: 'Purge & calibrate fructose machine, preheat sealer', id: 'Kalibrasi mesin fruktosa, panaskan mesin seal' },
      { zh: '补齐杯子、杯盖、吸管、封口膜、打包袋', en: 'Restock cups, lids, straws, sealing film, bags', id: 'Isi ulang gelas, tutup, sedotan, film seal, kantong' },
      { zh: '打开 POS、核对备用金、测试小票打印机', en: 'Open POS, count float, test receipt printer', id: 'Buka POS, hitung uang kas, tes printer struk' },
      { zh: '店面与吧台清洁，灯光和音乐打开', en: 'Clean storefront & bar; lights and music on', id: 'Bersihkan toko & bar; nyalakan lampu dan musik' }
    ]
  },
  {
    key: 'closing',
    title: { zh: '🌙 闭店检查清单', en: '🌙 Closing Checklist', id: '🌙 Checklist Tutup Toko' },
    items: [
      { zh: '报废剩余茶汤、珍珠、奶盖并登记报损', en: 'Discard leftover tea, pearls, foam and log waste', id: 'Buang sisa teh, boba, foam dan catat waste' },
      { zh: '盘点高价值原料，在 App 提交盘点', en: 'Count high-value items, submit count in App', id: 'Hitung bahan bernilai tinggi, kirim di App' },
      { zh: '清洗所有器具、茶桶、雪克杯，倒置晾干', en: 'Wash all tools, urns and shakers; air-dry upside down', id: 'Cuci semua alat, tempat teh, shaker; keringkan terbalik' },
      { zh: '清洁冰箱内部、地面、下水道，倒垃圾', en: 'Clean fridge interior, floor, drains; take out trash', id: 'Bersihkan kulkas, lantai, saluran air; buang sampah' },
      { zh: 'POS 交班结算，现金入保险柜', en: 'POS shift close, cash into safe', id: 'Tutup shift POS, uang masuk brankas' },
      { zh: '关闭非必要电源（保留冰箱），锁门', en: 'Switch off non-essential power (keep fridges), lock up', id: 'Matikan listrik yang tidak perlu (kecuali kulkas), kunci pintu' }
    ]
  }
]
