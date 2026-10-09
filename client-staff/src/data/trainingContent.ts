// 员工培训学院 - 多语言标准化培训资料
// 包含 WEDRINK 22页完整实操手册（吧台陈列、后厨备料、果茶配方、奶茶配方、圣代咖啡、五大设备维护）与运营通识标准
// 语言支持：zh 中文 / en English / id Bahasa Indonesia

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
// ==================== 1. 不锈钢吧台陈列与动线规范 (WEDRINK Page 3) ====================
  {
    key: 'bar_station',
    icon: '🥤',
    color: 'from-blue-600 to-cyan-500',
    title: {
      zh: '不锈钢吧台陈列与动线规范 (WEDRINK 标准)',
      en: 'Stainless Bar Counter Setup & Workflow (WEDRINK Standard)',
      id: 'Susunan Meja Bar Stainless & Tata Letak Kerja (Standar WEDRINK)'
    },
    subtitle: {
      zh: '保温桶定位、6大分区小料果粉果酱陈列、操作用具规范',
      en: 'Thermos positions, 6 ingredient prep zones, utensils and shaker placement',
      id: 'Penempatan termos, 6 zona topping & selai, alat dan shaker'
    },
    minutes: 15,
    sections: [
      {
        title: {
          zh: '保温桶与核心量具定位标准',
          en: 'Thermos Dispensers & Tool Placement',
          id: 'Penempatan Termos & Timbangan Meja Bar'
        },
        points: [
          {
            zh: '4大保温桶陈列顺序（由左至右）：① 果糖水 (Sirup Buah) -> ② 茉莉绿茶 (Mo Li Cha) -> ③ 经典红茶 (Hong Cha) -> ④ 浓缩咖啡 (Kopi Cair)。',
            en: '4 Thermos order (left to right): ① Fruit Sugar Syrup -> ② Jasmine Green Tea -> ③ Black Tea -> ④ Brewed Coffee.',
            id: 'Urutan 4 Termos (dari paling kiri): ① Sirup Buah -> ② Mo Li Cha (Melati) -> ③ Hong Cha (Teh Hitam) -> ④ Kopi Cair.'
          },
          {
            zh: '称量与调饮基准器具：配备 3000g 精度电子秤 (Timbangan 3.000gr) 与 700cc PC雪克杯 (Shaker 700cc)。',
            en: 'Standard tools: 3000g precision electronic scale and 700cc PC shaker cup.',
            id: 'Alat ukur standar: Timbangan digital 3.000gr dan Shaker 700cc.'
          },
          {
            zh: '不锈钢器具桶标配：水果捣汁压棒 (tumbukan buah)、食品夹 (capitan)、沥水漏勺 (centongan bolong)、珍珠勺 (centongan)、长柄鸡尾酒搅拌匙2支 (sendok cocktail 2pcs)。',
            en: 'Stainless tool holder contents: fruit muddler, tongs, slotted spoon, pearl spoon, 2 cocktail spoons.',
            id: 'Isi Tong Stainless: tumbukan buah, capitan, centongan bolong, centongan, sendok cocktail (2 pcs).'
          }
        ],
        tip: {
          zh: '工具使用完毕必须立即放回工具桶或原位，绝不可直接丢在操作台面或水槽内。',
          en: 'Always return tools to the holder immediately; never leave them on the counter or in the sink.',
          id: 'Alat yang selesai digunakan wajib langsung dikembalikan ke wadahnya, jangan diletakkan sembarangan di atas meja atau wastafel.'
        },
        warning: {
          zh: '保温桶盖必须盖紧，龙头出水口保持清洁无滴漏；严禁调换保温桶位置以免调饮出错！',
          en: 'Thermos lids must be closed tight; never swap thermos positions to avoid recipe mistakes!',
          id: 'Tutup termos harus selalu rapat; dilarang keras menukar urutan termos agar racikan minuman tidak salah!'
        }
      },
      {
        title: {
          zh: '6 大小料与原料分区陈列规范',
          en: '6 Ingredient & Topping Zones Standard',
          id: '6 Zona Bahan & Susunan Rak Meja Bar'
        },
        points: [
          {
            zh: 'Area 1 (小型不锈钢果酱槽)：百香果酱 (Selai Markisa)、芒果酱 (Selai Mangga)、草莓酱 (Selai Strawberry)、蜜桃酱 (Selai Peach)、红柚粒 (Jeruk Bali)、橙子果酱 (Selai Jeruk)。',
            en: 'Area 1 (Small Stainless): Passion Fruit Jam, Mango Jam, Strawberry Jam, Peach Jam, Grapefruit, Orange Jam.',
            id: 'Area 1 (Stainless kecil): Selai Markisa, Selai Mangga, Selai Strawberry, Selai Peach, Jeruk Bali, Selai Jeruk.'
          },
          {
            zh: 'Area 2 (果粉与干料盒)：花生碎 (Kacang tumbuk)、奥利奥碎 (Oreo Hancur)、酸梅粉 (Bubuk Sour plum)、芒果粉 (Bubuk Mangga)、提子干 (Kismis)、拿铁粉 (Bubuk Latte)、卡布奇诺粉 (Bubuk Cappucino)。',
            en: 'Area 2 (Powder Box): Crushed Peanuts, Crushed Oreo, Sour Plum Powder, Mango Powder, Raisins, Latte Powder, Cappuccino Powder.',
            id: 'Area 2 (Kotak bubuk buah): Kacang tumbuk, Oreo Hancur, Bubuk Sour plum, Bubuk Mangga, Kismis, Bubuk Latte, Bubuk Cappucino.'
          },
          {
            zh: 'Area 3 (中型不锈钢小料盒)：烧仙草 (Cincau)、椰果 (Coconut Jelly)、黑糖珍珠 (Boba)、蜜桃冻 (Jelly Peach)。',
            en: 'Area 3 (Medium Stainless): Grass Jelly, Coconut Jelly, Boba, Peach Jelly.',
            id: 'Area 3 (Stainless besi): Cincau, Coconut Jelly, Boba, Jelly Peach.'
          },
          {
            zh: 'Area 4 (调味糖浆瓶)：葡萄糖浆/紫色 (Sirup Anggur)、树莓糖浆/红色 (Sirup Raspberry)、黑糖浆 (Gula Merah)。',
            en: 'Area 4 (Syrup Bottles): Grape Syrup (Purple), Raspberry Syrup (Red), Brown Sugar Syrup.',
            id: 'Area 4 (Botol Sirup): Sirup Anggur (Ungu), Sirup Raspberry (Merah), Gula Merah.'
          },
          {
            zh: 'Area 5 (杯架)：500ml 规格杯、700ml 规格杯、U型胖胖杯 (Gelas U)。',
            en: 'Area 5 (Cup Rack): 500ml Cups, 700ml Cups, U-Shape Cups.',
            id: 'Area 5 (Rak Gelas): Gelas 500ml, Gelas 700ml, Gelas U.'
          },
          {
            zh: 'Area 6 (水槽上方)：巧克力淋酱 (Saus Coklat)。',
            en: 'Area 6 (Above Sink): Chocolate Sauce.',
            id: 'Area 6 (Diatas wastafel): Saus Coklat.'
          }
        ],
        tip: {
          zh: '随手复位是出杯速度与卫生的生命线；每款果酱与果粉取用后必须随手盖严盖子。',
          en: 'Returning items to their spots immediately is key to speed and hygiene; always close lids after use.',
          id: 'Mengembalikan barang ke posisi semula adalah kunci kecepatan dan kebersihan; selalu tutup wadah setelah dipakai.'
        },
        warning: {
          zh: '严禁将 Area 2 果粉盒靠近水槽，防止水珠溅入造成原料结块霉变！',
          en: 'Never place Area 2 powder boxes near the sink to prevent water splashes from causing caking and mold!',
          id: 'Dilarang meletakkan kotak bubuk Area 2 dekat wastafel agar tidak terkena cipratan air yang memicu jamur dan gumpalan!'
        }
      }
    ],
    quiz: [
      {
        q: {
          zh: '吧台保温桶从左到右的正确陈列顺序是？',
          en: 'What is the correct order of thermos dispensers from left to right?',
          id: 'Apa urutan penempatan termos yang benar dari paling kiri?'
        },
        options: [
          { zh: '果糖水 -> 茉莉绿茶 -> 经典红茶 -> 咖啡', en: 'Syrup -> Jasmine -> Black Tea -> Coffee', id: 'Sirup Buah -> Mo Li Cha -> Hong Cha -> Kopi' },
          { zh: '咖啡 -> 红茶 -> 茉莉茶 -> 果糖水', en: 'Coffee -> Black Tea -> Jasmine -> Syrup', id: 'Kopi -> Hong Cha -> Mo Li Cha -> Sirup Buah' },
          { zh: '茉莉茶 -> 红茶 -> 果糖水 -> 咖啡', en: 'Jasmine -> Black Tea -> Syrup -> Coffee', id: 'Mo Li Cha -> Hong Cha -> Sirup Buah -> Kopi' }
        ],
        answer: 0
      },
      {
        q: {
          zh: 'Area 3 不锈钢小料盒中应该放置哪一组原料？',
          en: 'Which group of ingredients belongs in Area 3?',
          id: 'Bahan apa sajakah yang ditempatkan di Area 3?'
        },
        options: [
          { zh: '花生碎、奥利奥、芒果粉', en: 'Peanuts, Oreo, Mango powder', id: 'Kacang tumbuk, Oreo, Bubuk mangga' },
          { zh: '烧仙草、椰果、黑糖珍珠、蜜桃冻', en: 'Grass jelly, Coconut jelly, Boba, Peach jelly', id: 'Cincau, Coconut Jelly, Boba, Jelly Peach' },
          { zh: '葡萄糖浆、树莓糖浆、黑糖浆', en: 'Grape syrup, Raspberry syrup, Brown sugar', id: 'Sirup anggur, Sirup raspberry, Gula merah' }
        ],
        answer: 1
      }
    ]
  },

  // ==================== 2. 后厨原料配比与保质期规范 (WEDRINK Page 4, 5, 6) ====================
  {
    key: 'backcourt_prep',
    icon: '🍵',
    color: 'from-amber-500 to-orange-500',
    title: {
      zh: '后厨核心原料配比标准与保质期规范',
      en: 'Backcourt Raw Materials Standard Ratios & Shelf Life',
      id: 'Rasio Standar Bahan Baku Backcourt & Masa Penyimpanan'
    },
    subtitle: {
      zh: '果糖水、茉莉茶、红茶、咖啡、珍珠、仙草、冰淇淋浆制作及保质期表',
      en: 'Sugar syrup, Jasmine/Black tea, coffee, boba, cincau, ice cream base & shelf life',
      id: 'Sirup buah, teh melati/hitam, kopi, boba, cincau, adonan es krim & masa simpan'
    },
    minutes: 20,
    sections: [
      {
        title: {
          zh: '果糖水、茉莉绿茶与经典红茶标准泡法',
          en: 'Sugar Syrup, Jasmine Tea & Black Tea Brewing',
          id: 'SOP Pembuatan Sirup Buah, Mo Li Cha & Hong Cha'
        },
        points: [
          {
            zh: '【果糖水】：纯净水 4,400g + 果糖 960g，搅拌均匀后倒入保温桶。',
            en: '【Fruit Syrup】: 4,400g water + 960g fruit syrup, stir well and pour into thermos.',
            id: '【Sirup Buah】: Air 4.400gr + Sirup Buah 960gr, aduk rata lalu tuang ke termos.'
          },
          {
            zh: '【茉莉绿茶 (Mo Li Cha)】：热水 2,500g，水温必须精确测至 70°C；投入 1包 (100g) 茶叶搅拌浸没，不加盖 (tidak ditutup) 静置浸泡 7 分钟；保温桶预置 1,500g 冰块，套布滤网将茶汤冲入冰块中快速降温锁香。',
            en: '【Jasmine Tea】: 2,500g water at strictly 70°C; 1 pack (100g) tea, immerse, steep uncovered for 7 min; filter into 1,500g ice in thermos.',
            id: '【Mo Li Cha】: Air 2.500gr suhu wajib 70°C; 1 bungkus (100gr) teh, aduk rata, diamkan 7 menit kondisi TIDAK DITUTUP; saring ke termos berisi 1.500gr es batu.'
          },
          {
            zh: '【经典红茶 (Hong Cha)】：热水 2,500g，水温 90°C；投入 1包 (100g) 茶叶搅拌浸透，加盖 (ditutup) 焖泡 10 分钟；保温桶预置 1,500g 冰块，通过细布滤网冲入冰块中快速锁香。',
            en: '【Black Tea】: 2,500g water at 90°C; 1 pack (100g) tea, steep covered for 10 min; filter into 1,500g ice in thermos.',
            id: '【Hong Cha】: Air 2.500gr suhu 90°C; 1 bungkus (100gr) teh, diamkan 10 menit kondisi TERTUTUP; saring ke termos berisi 1.500gr es batu.'
          }
        ],
        tip: {
          zh: '茉莉茶水温严禁超过 70°C（水温过高会导致茶多酚过度释放，茶汤发苦发涩且香气挥发）；红茶必须加盖焖泡出醇厚感。',
          en: 'Jasmine tea must stay at 70°C (higher temperature makes it bitter and loses aroma); Black tea must be covered.',
          id: 'Suhu teh melati tidak boleh melebihi 70°C agar tidak pahit; teh hitam wajib ditutup rapat saat diseduh.'
        },
        warning: {
          zh: '茶汤必须在投入茶包的瞬间启动计时器，严禁凭经验猜测泡茶时间！',
          en: 'Always start the timer the exact moment the tea bag enters the water!',
          id: 'Timer wajib dinyalakan tepat saat kantong teh dimasukkan ke air, dilarang menebak waktu seduh!'
        }
      },
      {
        title: {
          zh: '浓缩咖啡水、现煮珍珠与手工仙草冻',
          en: 'Brewed Coffee, Boba & Grass Jelly SOP',
          id: 'SOP Kopi Cair, Boba & Cincau'
        },
        points: [
          {
            zh: '【浓缩咖啡水 (Kopi Cair)】：纯咖啡粉 : 热水 = 1 : 40（如 50g 纯咖啡粉配 2,000g 水），搅拌均匀倒入保温桶。',
            en: '【Brewed Coffee】: Pure coffee powder : Water = 1 : 40 (e.g. 50g coffee + 2000g water), stir well into thermos.',
            id: '【Kopi Cair】: Rasio Kopi : Air = 1 : 40 (contoh: 50gr kopi + 2.000gr air), aduk rata, tuang ke termos.'
          },
          {
            zh: '【黑糖波霸珍珠 (Boba)】：珍珠 : 煮水 = 1 : 7（500g 珍珠配 3,500g 水）；自动珍珠机蜂鸣后投料，煮好后取出用带冰块的不锈钢漏勺冲冷水沥干胶质；糖蜜比例为 珍珠 : 糖 = 1 : 1/5（500g 珍珠配 100g 糖蜜），拌匀恒温保存。',
            en: '【Boba】: Boba : Water = 1 : 7 (500g boba + 3500g water). Rinse with cold ice water; sugar ratio is 1 : 0.2 (500g boba + 100g sugar).',
            id: '【Boba】: Rasio Boba : Air = 1 : 7 (500gr boba + 3.500gr air). Bilas dengan air es; Rasio Boba : Gula = 1 : 1/5 (500gr boba + 100gr gula).'
          },
          {
            zh: '【手工黑仙草冻 (Cincau)】：① 调浆：165g 水 + 50g 木薯粉搅匀；② 煮液：1,835g 热水 + 500g 仙草汁 + 275g 白糖煮沸；③ 勾芡：小火慢倒木薯粉浆，顺时针快速搅匀至表面顺滑发亮；双层布滤网滤入方盘，常温冷却后入冷柜。',
            en: '【Cincau】: ① 165g water + 50g tapioca starch; ② Boil 1,835g water + 500g cincau juice + 275g sugar; ③ Pour starch, stir clockwise until shiny and smooth; filter into tray.',
            id: '【Cincau】: ① Aduk 165gr air + 50gr tapioka; ② Masak 1.835gr air panas + 500gr jus cincau + 275gr gula hingga mendidih; ③ Tuang tapioka, aduk searah jarum jam hingga mengkilap halus; saring ke wadah simpan.'
          }
        ],
        tip: {
          zh: '珍珠过冷水清洗是去除表面多余糊精并锁住外弹内糯口感的核心操作；蜜糖后严禁冷藏，否则珍珠中心变硬。',
          en: 'Rinsing boba with cold water gives it chewy texture; never refrigerate cooked boba or it turns rock hard.',
          id: 'Membilas boba dengan air es mengunci kekenyalan; boba matang dilarang disimpan di kulkas agar tidak keras.'
        }
      },
      {
        title: {
          zh: '软冰淇淋奶浆配制与芒果冰沙基底',
          en: 'Ice Cream Mix & Mango Smoothie Prep',
          id: 'SOP Adonan Es Krim & Smoothie Mangga'
        },
        points: [
          {
            zh: '【软冰淇淋浆 (Es Krim)】：纯水 7,800g + 冰淇淋粉 1包 (3,000g / 3kg)。必须先水后粉，蛋抽搅拌 3 分钟，静置消泡 10 分钟，再次剧烈搅拌 3 分钟；经细滤网滤入储料缸（先牛奶后抹茶）；开机前出料口接出 150ml 浆料倒回料缸排除管内气泡。',
            en: '【Ice Cream Mix】: 7,800g water + 3,000g powder. Always water first, whisk 3 min, rest 10 min, whisk 3 min; strain into tank; drain 150ml to clear air pockets.',
            id: '【Adonan Es Krim】: Air 7.800gr + Bubuk Es Krim 3.000gr (3kg). Tambah air dulu, aduk 3 menit, diamkan 10 menit, aduk lagi 3 menit; saring ke tangki (susu dulu, lalu matcha); keluarkan 150ml cairan lalu tuang kembali.'
          },
          {
            zh: '【芒果冰沙基底 (Smoothie Mangga - 2杯量)】：沙冰机内加入 200ml 热水 + 80g 芒果专用粉，高速打 3 秒溶解；加 460g 冰块，点动破冰打 10 秒；若有残冰，辅助搅拌后再点击击打 3 秒至绵密无颗粒。',
            en: '【Mango Smoothie Base】: 200ml hot water + 80g mango powder, blend 3 sec; add 460g ice, blend 10 sec until smooth.',
            id: '【Smoothie Mangga】: Air panas 200ml + bubuk mangga 80gr blender 3 detik kecepatan tinggi; tambah 460gr es batu, blender 10 detik sambil diaduk.'
          }
        ],
        warning: {
          zh: '调制冰淇淋浆绝对不能先放粉后倒水，否则桶底必定死粉结块，损坏冰淇淋机进浆阀！',
          en: 'Never add powder before water when mixing ice cream, as it will clump at the bottom and clog the machine!',
          id: 'Dilarang keras memasukkan bubuk sebelum air karena akan menggumpal di dasar wadah dan merusak mesin!'
        }
      },
      {
        title: {
          zh: '半成品原料保质期与储存规范全表',
          en: 'Prepared Ingredients Shelf Life Table',
          id: 'Tabel Standar Masa Penyimpanan Bahan'
        },
        points: [
          {
            zh: '果糖水 (Sirup Buah)：常温保温桶 12 小时 (12 Jam)，每日闭店必须排空清洗。',
            en: 'Fruit Syrup: 12 Hours at room temperature; empty and wash nightly.',
            id: 'Sirup Buah: 12 Jam di suhu ruang; wajib dikosongkan dan dicuci tiap tutup toko.'
          },
          {
            zh: '红茶 & 茉莉绿茶 (Hong Cha & Moli Cha)：常温保温桶 4 小时 (4 Jam)，超时茶多酚氧化变酸苦，必须废弃倒掉！',
            en: 'Black Tea & Jasmine Tea: 4 Hours at room temperature; discard immediately after 4h.',
            id: 'Hong Cha & Moli Cha: 4 Jam di suhu ruang; lewat 4 jam teh basi dan wajib dibuang!'
          },
          {
            zh: '浓缩咖啡水 (Kopi Cair)：常温密封保温桶 12 小时 (12 Jam)。',
            en: 'Brewed Coffee: 12 Hours in sealed thermos at room temperature.',
            id: 'Kopi Cair: 12 Jam di dalam termos tertutup.'
          },
          {
            zh: '黑糖波霸珍珠 (Boba)：常温蜜糖保存 4 小时 (4 Jam)，严禁冷藏；超时发硬报损。',
            en: 'Boba: 4 Hours at room temperature; never refrigerate; discard if hard.',
            id: 'Boba: 4 Jam suhu ruang; dilarang masuk kulkas; lewat 4 jam wajib dibuang.'
          },
          {
            zh: '手工仙草冻 (Cincau)：冷藏保存 3 天 (3 Hari)，必须提前一天制作凝固。',
            en: 'Cincau: 3 Days chilled; must be prepared one day in advance.',
            id: 'Cincau: 3 Hari di kulkas; wajib dibuat sehari sebelumnya.'
          },
          {
            zh: '冰淇淋浆料 (Es Krim)：料缸常温 6 小时 (Matcha 易氧化为 4 小时)；存入冰箱冷藏可延长 1 小时。',
            en: 'Ice Cream Mix: 6 Hours in tank (Matcha 4h); stored in chiller extends 1h.',
            id: 'Adonan Es Krim: 6 Jam di tangki (Matcha 4 jam); jika ditaruh di kulkas tahan lebih lama 1 jam.'
          },
          {
            zh: '杨枝甘露芒果西米浆 (Cairan sagu mangga pomelo)：冷藏保存 2 小时，全程必须放冰箱 (wajib ditaruh di dalam kulkas)。',
            en: 'Mango Sago Pomelo: 2 Hours chilled; must stay in refrigerator.',
            id: 'Cairan sagu mangga pomelo: 2 Jam (wajib ditaruh di dalam kulkas).'
          }
        ],
        warning: {
          zh: '所有分装备料盒表面必须贴上【品名、制作时间、废弃时间、责任人】效期贴纸！',
          en: 'All ingredient containers must have an expiry label: item, prep time, expiry time, prep staff!',
          id: 'Semua wadah bahan wajib ditempeli label: nama produk, jam dibuat, jam kedaluwarsa, dan inisial staf!'
        }
      }
    ],
    quiz: [
      {
        q: {
          zh: '冲泡茉莉绿茶的标准水温和加盖状态是？',
          en: 'What is the brewing temperature and lid condition for Jasmine Tea?',
          id: 'Berapakah suhu air dan kondisi tutup saat menyeduh Mo Li Cha?'
        },
        options: [
          { zh: '90°C，加盖焖泡 10 分钟', en: '90°C, covered for 10 min', id: '90°C, ditutup 10 menit' },
          { zh: '70°C，不加盖浸泡 7 分钟', en: '70°C, uncovered for 7 min', id: '70°C, tidak ditutup 7 menit' },
          { zh: '100°C 沸水，不加盖 5 分钟', en: '100°C boiling, uncovered 5 min', id: '100°C mendidih, tidak ditutup 5 menit' }
        ],
        answer: 1
      },
      {
        q: {
          zh: '常温保温桶中的红茶与茉莉绿茶茶汤，保质期是几个小时？',
          en: 'What is the shelf life of Black Tea & Jasmine Tea in the thermos?',
          id: 'Berapa jam masa simpan teh Hong Cha & Mo Li Cha di dalam termos?'
        },
        options: [
          { zh: '4 小时 (4 Jam)', en: '4 Hours', id: '4 Jam' },
          { zh: '8 小时 (8 Jam)', en: '8 Hours', id: '8 Jam' },
          { zh: '12 小时 (12 Jam)', en: '12 Hours', id: '12 Jam' }
        ],
        answer: 0
      },
      {
        q: {
          zh: '调制软冰淇淋浆料时，正确的投料顺序与比例是？',
          en: 'What is the correct sequence and ratio when preparing ice cream mix?',
          id: 'Bagaimana urutan dan rasio yang benar saat membuat adonan es krim?'
        },
        options: [
          { zh: '先放 3kg 冰淇淋粉，再倒 7800g 纯水', en: 'Powder 3kg first, then 7800g water', id: 'Bubuk 3kg dulu, baru tuang air 7.800gr' },
          { zh: '先称取 7800g 水，再分批加入 3kg 冰淇淋粉并搅拌', en: 'Weigh 7800g water first, then add 3kg powder gradually', id: 'Siapkan air 7.800gr terlebih dahulu, lalu tambahkan bubuk 3.000gr (3kg) sambil diaduk' }
        ],
        answer: 1
      }
    ]
  },

  // ==================== 3. 水果茶系列标准制作配方 (WEDRINK Page 7) ====================
  {
    key: 'fruit_tea',
    icon: '🍋',
    color: 'from-emerald-500 to-green-600',
    title: {
      zh: '水果茶系列标准制作配方与 SOP (Teh Buah)',
      en: 'Fruit Tea Series Standard Recipes & SOP (Teh Buah)',
      id: 'SOP Resep & Pembuatan Seri Teh Buah (Teh Buah 500ml & 700ml)'
    },
    subtitle: {
      zh: '鲜榨柠檬水、柠檬红茶、百香双拼、超级水果桶等 12 款热门饮品配方',
      en: 'Lemonade, Passion fruit, Super Fruit Bucket, 12 popular fruit tea recipes',
      id: 'Lemonade, Markisa, Super Fruit Bucket, 12 resep teh buah populer'
    },
    minutes: 25,
    sections: [
      {
        title: {
          zh: '500ml 规格水果茶标准制作配方',
          en: '500ml Fruit Tea Recipes',
          id: 'Resep Standar Teh Buah Gelas 500ml'
        },
        points: [
          {
            zh: '【椰果芒果冰沙 (Mango Smoothies with Coconut Jelly)】：芒果酱 25g + 西柚粒 15g + 椰果 3平勺 (Coconut Jelly 3 sdk) + 注入调制好的芒果冰沙基底。',
            en: '【Mango Smoothie Coconut Jelly】: 25g mango jam + 15g grapefruit + 3 scoops coconut jelly + mango smoothie base.',
            id: '【Mango Smoothies with Coconut Jelly】: Selai mangga 25gr + Jeruk Bali 15gr + Coconut Jelly 3 sdk + Smoothie Mangga.'
          },
          {
            zh: '【六颗葡萄水果茶 (Six Grapes Fruit Tea)】：鲜葡萄 6颗放入杯中捣碎果肉 (Anggur 6 butir ditumbuk) + 蜜桃酱 20g + 葡萄糖浆 35g + 果糖 11g + 茉莉绿茶汤 60ml + 椰果 1平勺 + 满冰摇匀。',
            en: '【Six Grapes Fruit Tea】: 6 crushed grapes + 20g peach jam + 35g grape syrup + 11g fructose + 60ml Jasmine tea + 1 scoop coconut jelly + ice.',
            id: '【Six Grapes Fruit Tea】: Anggur 6 butir (ditumbuk) + Selai Peach 20gr + Sirup Anggur 35gr + Gula 11gr + Mo Li Cha 60ml + Coconut Jelly 1 sdk.'
          }
        ],
        tip: {
          zh: '鲜葡萄捣汁时只需压裂果肉渗出汁水即可，不可过度暴力捣烂葡萄皮，以免单宁酸析出导致茶汤发涩。',
          en: 'Crush grapes gently to release juice; avoid over-muddling the skin which causes astringency.',
          id: 'Tumbuk anggur secukupnya agar airnya keluar; jangan terlalu hancur agar kulit tidak pahit.'
        }
      },
      {
        title: {
          zh: '700ml 经典水果茶制作配方 (Part 1)',
          en: '700ml Classic Fruit Tea Recipes (Part 1)',
          id: 'Resep Standar Teh Buah Gelas 700ml (Bagian 1)'
        },
        points: [
          {
            zh: '【鲜榨柠檬水 (Fresh-Squeezed Lemonade)】：雪克杯加入鲜切柠檬片 40g 捣出足量汁水 (Irisan Lemon 40gr ditumbuk) + 果糖水 250ml + 加满冰块打满雪克。',
            en: '【Fresh Lemonade】: 40g fresh lemon slices muddled + 250ml fruit syrup + ice to top, shake well.',
            id: '【Fresh-Squeezed Lemonade】: Irisan Lemon 40gr (ditumbuk) + Sirup Buah 250ml + es batu penuh.'
          },
          {
            zh: '【柠檬红茶 (Lemon Black Tea)】：鲜切柠檬片 35g 捣出汁 (Irisan Lemon 35gr ditumbuk) + 果糖 70g + 经典红茶汤 140ml + 冰块加满雪克。',
            en: '【Lemon Black Tea】: 35g lemon slices muddled + 70g fructose + 140ml Black Tea + ice to top.',
            id: '【Lemon Black Tea】: Irisan Lemon 35gr (ditumbuk) + Gula 70gr + Hong Cha 140ml + es batu penuh.'
          },
          {
            zh: '【百香果双拼茶 (Passion Fruit Pearl & Jelly Tea)】：百香果酱 45g + 果糖 5g + 果糖水 40ml + 茉莉绿茶 100ml + 黑糖珍珠 75g + 椰果 2平勺 + 加冰雪克。',
            en: '【Passion Fruit Pearl & Jelly】: 45g passion fruit jam + 5g sugar + 40ml syrup + 100ml Jasmine tea + 75g boba + 2 scoops coconut jelly.',
            id: '【Passion Fruit Pearl & Jelly Tea】: Selai markisa 45gr + Gula 5gr + Sirup Buah 40ml + Mo Li Cha 100ml + Boba 75gr + Coconut Jelly 2 sdk.'
          },
          {
            zh: '【冰鲜百香果茶 (Ice Fresh Passion Fruit Tea)】：百香果酱 40g + 果糖水 160ml + 冰块加满雪克。',
            en: '【Ice Fresh Passion Fruit】: 40g passion fruit jam + 160ml fruit syrup + ice to top.',
            id: '【Ice Fresh Passion Fruit Tea】: Selai Markisa 40gr + Sirup Buah 160ml + es batu penuh.'
          },
          {
            zh: '【澳洲香橙汁 (Australia Orange Juice)】：橙子果酱 35g + 果糖水 120ml + 椰果 3平勺 + 冰块加满雪克。',
            en: '【Australia Orange Juice】: 35g orange jam + 120ml fruit syrup + 3 scoops coconut jelly + ice.',
            id: '【Australia Orange Juice】: Selai Jeruk 35gr + Sirup Buah 120ml + Coconut Jelly 3 sdk + es batu.'
          },
          {
            zh: '【老北京酸梅汤 (Sweet and Sour Plum)】：雪克杯加热水 100ml 彻底化开酸梅粉 50g (Bubuk Sour Plum 50gr) + 果糖水 20ml + 椰果 1平勺 + 加冰雪克。',
            en: '【Sweet & Sour Plum】: 100ml hot water + 50g plum powder + 20ml syrup + 1 scoop coconut jelly + ice.',
            id: '【Sweet and Sour Plum】: Air Panas 100ml + [Bubuk Sour Plum 50gr] + Sirup Buah 20ml + Coconut Jelly 1 sdk.'
          }
        ]
      },
      {
        title: {
          zh: '超级水果桶与风味大杯制作配方 (Part 2)',
          en: 'Super Fruit Bucket & Signature Fruit Teas (Part 2)',
          id: 'Super Fruit Bucket & Resep Buah Spesial (Bagian 2)'
        },
        points: [
          {
            zh: '【超级水果桶 (Super Fruit Bucket - 1000ml桶)】：大桶预置 冰块 200g + 鲜切新奇士橙片 40g + 鲜凤梨丁 50g + 鲜西瓜丁 100g + 小金桔 1颗切4瓣 (Jeruk Kumquat 1 buah dibagi 4) + 注入调配好的果茶汤底。',
            en: '【Super Fruit Bucket】: 200g ice + 40g sunkist orange + 50g pineapple + 100g watermelon + 1 kumquat quartered + fruit tea base.',
            id: '【Super Fruit Bucket】: Es 200gr + Irisan Jeruk sunkist 40gr + Nanas 50gr + Semangka 100gr + Jeruk Kumquat 1 buah (dibagi 4).'
          },
          {
            zh: '【鲜树莓香橙 (Fresh Raspberry Oranges)】：鲜橙丁 50-60g 捣汁 + 树莓糖浆 40g + 果糖水 100ml + 椰果 2平勺 + 加冰雪克。',
            en: '【Fresh Raspberry Orange】: 50-60g orange diced muddled + 40g raspberry syrup + 100ml syrup + 2 scoops coconut jelly.',
            id: '【Fresh Raspberry Oranges】: Jeruk Potong Dadu 50-60gr (ditumbuk) + Sirup Raspberry 40gr + Sirup buah 100ml + Coconut Jelly 2 sdk.'
          },
          {
            zh: '【蜜桃果茶 (Peach Fruit Tea)】：雪克杯加入 蜜桃酱 80g + 果糖 25g + 红茶汤 80ml + 冰块 100g + 加常温水至 500cc 刻度线充分雪克。',
            en: '【Peach Fruit Tea】: 80g peach jam + 25g sugar + 80ml Black Tea + 100g ice + water to 500cc mark.',
            id: '【Peach (shaker)】: Selai Peach 80gr + Gula 25gr + Hong Cha 80ml + Es 100gr + Air sampai (500cc).'
          },
          {
            zh: '【百香果果茶 (Passion Fruit Tea)】：雪克杯加入 百香果酱 65g + 果糖 15g + 果糖水 60ml + 茉莉绿茶汤 150ml + 冰块 100g + 加常温水至 500cc 标线充分雪克。',
            en: '【Passion Fruit Tea】: 65g passion fruit jam + 15g sugar + 60ml syrup + 150ml Jasmine tea + 100g ice + water to 500cc.',
            id: '【Passion Fruit (shaker)】: Selai Markisa 65gr + Gula 15gr + Sirup Buah 60ml + Mo Li Cha 150ml + Es 100gr + Air sampai (500cc).'
          }
        ],
        warning: {
          zh: '超级水果桶的水果必须每日清晨鲜切，表面发干、出水或有发酵气味的水果绝对严禁出品！',
          en: 'Fruit for the Super Bucket must be cut fresh daily; dried or fermented fruit is strictly prohibited!',
          id: 'Buah untuk Super Fruit Bucket wajib dipotong segar setiap hari; dilarang keras memakai buah layu atau berbau asam!'
        }
      }
    ],
    quiz: [
      {
        q: {
          zh: '鲜榨柠檬水 (Fresh-Squeezed Lemonade) 中柠檬片的称重标准是？',
          en: 'What is the standard weight of lemon slices for Fresh-Squeezed Lemonade?',
          id: 'Berapakah gram irisan lemon yang ditumbuk untuk Fresh-Squeezed Lemonade?'
        },
        options: [
          { zh: '20g', en: '20g', id: '20gr' },
          { zh: '40g', en: '40g', id: '40gr' },
          { zh: '80g', en: '80g', id: '80gr' }
        ],
        answer: 1
      },
      {
        q: {
          zh: '超级水果桶 (Super Fruit Bucket) 包含哪些标准水果切块？',
          en: 'Which fresh fruits are included in the Super Fruit Bucket?',
          id: 'Buah apa sajakah yang dimasukkan ke dalam Super Fruit Bucket?'
        },
        options: [
          { zh: '新奇士橙40g、菠萝50g、西瓜100g、金桔1颗切4瓣', en: 'Sunkist 40g, Pineapple 50g, Watermelon 100g, 1 Kumquat quartered', id: 'Jeruk sunkist 40gr, Nanas 50gr, Semangka 100gr, Jeruk Kumquat 1 buah (dibagi 4)' },
          { zh: '草莓、葡萄、青苹果、香蕉', en: 'Strawberry, Grape, Apple, Banana', id: 'Strawberry, Anggur, Apel, Pisang' },
          { zh: '只有西瓜和柠檬', en: 'Only Watermelon and Lemon', id: 'Hanya Semangka dan Lemon' }
        ],
        answer: 0
      }
    ]
  },

  // ==================== 4. 经典浓郁奶茶系列标准制作配方 (WEDRINK Page 8, 9) ====================
  {
    key: 'milk_tea',
    icon: '🧋',
    color: 'from-amber-600 to-yellow-600',
    title: {
      zh: '经典浓郁奶茶系列标准制作配方 (Teh Susu)',
      en: 'Classic Milk Tea Series Standard Recipes (Teh Susu)',
      id: 'SOP Resep & Pembuatan Seri Teh Susu (Teh Susu 500ml, 700ml & Ember)'
    },
    subtitle: {
      zh: '原味奶茶、白桃乌龙、黑糖珍珠、双拼、超级仙草奶茶与大桶配方',
      en: 'Original, Peach Oolong, Brown Sugar Pearl, 2Topping, Grass Jelly, Super Bucket',
      id: 'Original, Peach Oolong, Brown Sugar Boba, 2Topping, Cincau & Super Milk Tea Bucket'
    },
    minutes: 20,
    sections: [
      {
        title: {
          zh: '500ml 规格经典奶茶标准制作配方',
          en: '500ml Classic Milk Tea Recipes',
          id: 'Resep Standar Teh Susu Gelas 500ml'
        },
        points: [
          {
            zh: '【原味奶茶 (Original Milk Tea)】：雪克杯加入 热水 100ml + 奶茶专用粉 45g 彻底化开 + 红茶汤 120ml + 果糖 30g + 加冰雪克出杯。',
            en: '【Original Milk Tea】: 100ml hot water + 45g milk tea powder dissolve + 120ml Black Tea + 30g fructose + ice.',
            id: '【Original Milk Tea】: Air Panas 100ml + [Bubuk Milk Tea 45gr] + Hong Cha 120ml + Gula 30gr.'
          },
          {
            zh: '【椰果奶茶 (Coconut Jelly Milk Tea)】：雪克杯 热水 100ml + 奶茶粉 40g + 红茶汤 120ml + 果糖 20g + 加冰雪克；出杯加入 椰果 2平勺。',
            en: '【Coconut Jelly Milk Tea】: 100ml hot water + 40g powder + 120ml Black Tea + 20g fructose + ice; add 2 scoops coconut jelly.',
            id: '【Coconut Jelly Milk Tea】: Air Panas 100ml + [Bubuk Milk Tea 40gr] + Hong Cha 120ml + Gula 20gr + Coconut Jelly 2 sdk.'
          },
          {
            zh: '【白桃乌龙奶茶 (Peach Oolong Milk Tea)】：雪克杯 热水 100ml + 奶茶粉 40g + 红茶汤 140ml + 果糖 10g + 蜜桃酱 40g + 蜜桃冻 40g + 椰果 2平勺。',
            en: '【Peach Oolong Milk Tea】: 100ml hot water + 40g powder + 140ml Black Tea + 10g sugar + 40g peach jam + 40g peach jelly + 2 scoops coconut jelly.',
            id: '【Peach Oolong Milk Tea】: Air Panas 100ml + [Bubuk Milk Tea 40gr] + Hong Cha 140ml + Gula 10gr + Selai Peach 40gr + Jelly Peach 40gr + Coconut Jelly 2 sdk.'
          },
          {
            zh: '【黑糖珍珠奶茶 (Brown Sugar Pearl Milk Tea)】：【杯底】黑糖浆 30g 顺杯壁均匀挂壁 + 波霸珍珠 70g；【雪克杯】热水 100ml + 奶茶粉 40g + 红茶汤 100ml + 果糖 5g + 加冰雪克倒入杯中。',
            en: '【Brown Sugar Boba】: Cup: 30g brown sugar drizzle + 70g boba; Shaker: 100ml hot water + 40g powder + 100ml Black Tea + 5g sugar + ice.',
            id: '【Brown Sugar Pearl Milk Tea】: Gelas: Boba 70gr + Sirup Gula Merah 30gr; Shaker: Air Panas 100ml + [Bubuk Milk Tea 40gr] + Hong Cha 100ml + Gula 5gr.'
          },
          {
            zh: '【自选双拼奶茶 (Milk Tea with 2Topping)】：【杯底选2种小料】波霸 50g / 椰果 2平勺 / 仙草冻 80g / 蜜红豆 60g；【雪克杯】热水 100ml + 奶茶粉 40g + 红茶汤 120ml + 果糖 20g + 加冰雪克。',
            en: '【2Topping Milk Tea】: Cup: choose 2 (Boba 50g / Coconut jelly 2 sdk / Cincau 80g / Red bean 60g); Shaker: 100ml hot water + 40g powder + 120ml Black Tea + 20g sugar.',
            id: '【Milk Tea with 2Topping】: Gelas pilih 2 (Boba 50gr / Coconut Jelly 2 sdk / Cincau 80gr / Kacang Merah 60gr); Shaker: Air Panas 100ml + [Bubuk Milk Tea 40gr] + Hong Cha 120ml + Gula 20gr.'
          }
        ],
        tip: {
          zh: '必须严格遵循【100ml 热水先融化奶茶粉】原则！切勿先倒冷茶汤或冷水，否则粉剂必定结块无法化解。',
          en: 'Always dissolve milk tea powder in 100ml hot water first! Never add cold tea first or it will clump.',
          id: 'Wajib larutkan bubuk milk tea dengan 100ml air panas dulu! Jangan tuang teh dingin lebih dulu agar tidak menggumpal.'
        }
      },
      {
        title: {
          zh: '700ml 大杯与大桶装超级奶茶制作配方',
          en: '700ml Large & Super Bucket Milk Tea Recipes',
          id: 'Resep Standar Teh Susu Gelas 700ml & Super Bucket'
        },
        points: [
          {
            zh: '【700ml 椰果奶茶】：雪克杯 热水 100ml + 奶茶粉 50g + 红茶汤 180ml + 果糖 30g + 椰果 3平勺。',
            en: '【700ml Coconut Jelly】: 100ml hot water + 50g powder + 180ml Black Tea + 30g sugar + 3 scoops coconut jelly.',
            id: '【700ml Coconut Jelly】: Air Panas 100ml + [Bubuk Milk Tea 50gr] + Hong Cha 180ml + Gula 30gr + Coconut Jelly 3 sdk.'
          },
          {
            zh: '【700ml 白桃乌龙奶茶】：热水 100ml + 奶茶粉 45g + 红茶汤 180ml + 果糖 10g + 蜜桃酱 50g + 蜜桃冻 50g + 椰果 3平勺。',
            en: '【700ml Peach Oolong】: 100ml hot water + 45g powder + 180ml Black Tea + 10g sugar + 50g peach jam + 50g peach jelly + 3 scoops coconut jelly.',
            id: '【700ml Peach Oolong】: Air Panas 100ml + [Bubuk Milk Tea 45gr] + Hong Cha 180ml + Gula 10gr + Selai Peach 50gr + Jelly Peach 50gr + Coconut Jelly 3 sdk.'
          },
          {
            zh: '【700ml 黑糖珍珠奶茶】：杯底黑糖浆 35g 挂壁 + 波霸珍珠 140g；雪克杯：热水 100ml + 奶茶粉 50g + 红茶汤 160ml + 果糖 5g + 加冰雪克。',
            en: '【700ml Brown Sugar Boba】: Cup: 35g brown sugar + 140g boba; Shaker: 100ml hot water + 50g powder + 160ml Black Tea + 5g sugar + ice.',
            id: '【700ml Brown Sugar Boba】: Gelas: Boba 140gr + Sirup Gula Merah 35gr; Shaker: Air Panas 100ml + [Bubuk Milk Tea 50gr] + Hong Cha 160ml + Gula 5gr.'
          },
          {
            zh: '【700ml 双拼奶茶】：杯底自选2种（波霸 75g / 椰果 3平勺 / 仙草 120g / 红豆 60g）；雪克杯：热水 100ml + 奶茶粉 50g + 红茶汤 180ml + 果糖 20g。',
            en: '【700ml 2Topping】: Cup: choose 2 (Boba 75g / Coconut jelly 3 sdk / Cincau 120g / Red bean 60g); Shaker: 100ml hot water + 50g powder + 180ml Black Tea + 20g sugar.',
            id: '【700ml 2Topping】: Gelas pilih 2 (Boba 75gr / Coconut Jelly 3 sdk / Cincau 120gr / Kacang Merah 60gr); Shaker: Air Panas 100ml + [Bubuk Milk Tea 50gr] + Hong Cha 180ml + Gula 20gr.'
          },
          {
            zh: '【700ml 超级仙草奶茶 (Super Grass Jelly Milk Tea)】：杯中小料丰富配置：椰果 1平勺 + 蜜红豆 25g + 波霸 35g + 花生碎 10g + 提子干 10g + 仙草冻 130g；雪克杯：热水 100ml + 奶茶粉 40g + 红茶汤 140ml + 果糖 23g。',
            en: '【700ml Super Grass Jelly】: Cup: 1 scoop coconut jelly + 25g red bean + 35g boba + 10g peanuts + 10g raisins + 130g cincau; Shaker: 100ml hot water + 40g powder + 140ml Black Tea + 23g sugar.',
            id: '【Super Grass Jelly Milk Tea (700ml)】: Gelas: Coconut Jelly 1 sdk + Kacang Merah 25gr + Boba 35gr + Kacang Tumbuk 10gr + Kismis 10gr + Cincau 130gr; Shaker: Air Panas 100ml + [Bubuk Milk Tea 40gr] + Hong Cha 140ml + Gula 23gr.'
          },
          {
            zh: '【超级三拼奶茶大桶 (Super Milk Tea Bucket with 3Toppings)】：大桶预置小料：仙草冻 100g + 珍珠 100g + 椰果 6平勺；雪克杯：热水 100ml + 奶茶粉 50g + 红茶汤 160ml + 果糖 25g + 冰块打满至 650cc 刻度线雪克均匀冲入大桶。',
            en: '【Super Milk Tea Bucket 3Toppings】: Bucket: 100g cincau + 100g boba + 6 scoops coconut jelly; Shaker: 100ml hot water + 50g powder + 160ml Black Tea + 25g sugar + ice to 650cc.',
            id: '【Super Milk Tea Bucket with 3Toppings】: Ember: Cincau 100gr + Boba 100gr + Coconut Jelly 6 sdk; Shaker: Air Panas 100ml + [Bubuk Milk Tea 50gr] + Hong Cha 160ml + Gula 25gr + Es sampai 650cc.'
          }
        ],
        warning: {
          zh: '黑糖珍珠奶茶的黑糖挂壁动作必须贴紧杯内壁缓缓转圈淋下，严禁直接倾倒在杯底失去挂壁纹理效果。',
          en: 'Brown sugar must be drizzled along the inside cup wall slowly while rotating; do not pour straight to the bottom.',
          id: 'Sirup gula merah wajib dituangkan melingkari dinding gelas bagian dalam, jangan langsung dituangkan ke dasar gelas.'
        }
      }
    ],
    quiz: [
      {
        q: {
          zh: '溶解奶茶专用粉的第一步标准动作是？',
          en: 'What is the first standard step to dissolve milk tea powder?',
          id: 'Langkah pertama yang benar untuk melarutkan bubuk milk tea adalah?'
        },
        options: [
          { zh: '先加入 100ml 热水充分搅拌至完全化开', en: 'Add 100ml hot water first and stir until dissolved', id: 'Tambahkan 100ml air panas terlebih dahulu dan aduk hingga larut' },
          { zh: '加入冷红茶茶汤和冰块一起摇晃', en: 'Shake with cold black tea and ice', id: 'Kocok dengan teh hitam dingin dan es batu' },
          { zh: '直接干粉倒入杯中', en: 'Pour dry powder directly into cup', id: 'Tuang bubuk kering langsung ke gelas' }
        ],
        answer: 0
      },
      {
        q: {
          zh: '700ml 超级仙草奶茶中，仙草冻 (Cincau) 的标准称重克数是？',
          en: 'What is the standard weight of Cincau in 700ml Super Grass Jelly Milk Tea?',
          id: 'Berapakah takaran Cincau standar untuk Super Grass Jelly Milk Tea 700ml?'
        },
        options: [
          { zh: '50g', en: '50g', id: '50gr' },
          { zh: '130g', en: '130g', id: '130gr' },
          { zh: '200g', en: '200g', id: '200gr' }
        ],
        answer: 1
      }
    ]
  },

  // ==================== 5. 现调咖啡、软冰圣代与雪顶奶昔 (WEDRINK Page 9, 10) ====================
  {
    key: 'dessert_coffee',
    icon: '🍦',
    color: 'from-purple-500 to-pink-500',
    title: {
      zh: '现调咖啡、软冰圣代与雪顶奶昔标准制作配方',
      en: 'Coffee, Sundae, Milkshake & Snow Top Standard Recipes',
      id: 'SOP Resep Kopi, Es Krim Sundae, Milkshake & Snow Top'
    },
    subtitle: {
      zh: '冰美式/拿铁、7款圣代冰淇淋圈数、6款奶昔与4款雪顶冰沙',
      en: 'Americano/Latte, 7 sundaes (4 loops), 6 milkshakes, 4 snow top smoothies',
      id: 'Americano/Latte, 7 sundae (4 lingkaran), 6 milkshake, 4 snow top'
    },
    minutes: 20,
    sections: [
      {
        title: {
          zh: '现调咖啡系列标准制作 (500ml)',
          en: '500ml Coffee Series Recipes',
          id: 'Resep Standar Kopi (500ml)'
        },
        points: [
          {
            zh: '【冰美式 (Iced Americano Coffee)】：浓缩咖啡液 220ml + 果糖 28g + 冰块加至满杯搅拌均匀。',
            en: '【Iced Americano】: 220ml brewed coffee + 28g fructose + ice to full cup, stir well.',
            id: '【Iced Americano Coffee】: Kopi Cair 220ml + Gula 28gr + es batu penuh.'
          },
          {
            zh: '【卡布奇诺 (Cappucino)】：热水 100ml + 卡布奇诺粉 55g 化开 + 补冰块水出杯。',
            en: '【Cappuccino】: 100ml hot water + 55g cappuccino powder + ice/water.',
            id: '【Cappucino】: Air Panas 100ml + Bubuk Cappucino 55gr + es/air.'
          },
          {
            zh: '【咖啡拿铁 (Coffee Latte)】：热水 100ml + 拿铁专用粉 55g 化开 + 补冰块水出杯。',
            en: '【Coffee Latte】: 100ml hot water + 55g latte powder + ice/water.',
            id: '【Coffee Latte】: Air Panas 100ml + Bubuk Latte 55gr + es/air.'
          }
        ]
      },
      {
        title: {
          zh: '冰淇淋圣代系列 (Es Krim Sundae - Gelas U 打4圈)',
          en: 'Sundae Series (U Cup - 4 Ice Cream Loops)',
          id: 'Resep Standar Sundae (Gelas U - 4 Lingkaran Es Krim)'
        },
        points: [
          {
            zh: '圣代出杯基准：统一使用 U型胖胖杯，软冰淇淋标准打 4 圈 (Es Cream: 4 Lingkaran)。',
            en: 'Sundae Standard: U-Shape cup, dispensed with exactly 4 ice cream loops.',
            id: 'Standar Sundae: Menggunakan Gelas U, cetak es krim tepat 4 lingkaran.'
          },
          {
            zh: '【红豆抹茶圣代 (Red Bean Matcha Sundae)】：抹茶冰淇淋 230g + 顶层蜜红豆 50g。',
            en: '【Matcha Red Bean】: 230g Matcha ice cream + 50g sweet red bean on top.',
            id: '【Red Bean Matcha Sundae】: 230gr Matcha + Kacang Merah 50gr di atas.'
          },
          {
            zh: '【草莓圣代 (Strawberry Sundae)】：牛奶冰淇淋 230g + 顶层淋草莓酱 50g。',
            en: '【Strawberry Sundae】: 230g Vanilla ice cream + 50g strawberry jam on top.',
            id: '【Strawberry Sundae】: 230gr Susu + Selai Strawberry 50gr di atas.'
          },
          {
            zh: '【芒果圣代 (Mango Sundae)】：牛奶冰淇淋 230g + 顶层淋芒果酱 35g。',
            en: '【Mango Sundae】: 230g Vanilla ice cream + 35g mango jam on top.',
            id: '【Mango Sundae】: 230gr Susu + Selai Mangga 35gr di atas.'
          },
          {
            zh: '【黑糖珍珠圣代 (Brown Sugar Pearl Sundae)】：杯底淋黑糖浆 15g + 牛奶冰淇淋 230g + 顶层波霸珍珠 50g。',
            en: '【Brown Sugar Boba Sundae】: 15g brown sugar bottom + 230g ice cream + 50g boba top.',
            id: '【Brown Sugar Pearl Sundae】: Gula Merah 15gr di bawah + 230gr Susu + Boba 50gr di atas.'
          },
          {
            zh: '【巧脆奥利奥圣代 (Chocolate Oreo Sundae)】：杯底淋巧克力酱 10g + 牛奶冰淇淋 230g + 顶层巧克力酱 10g + 撒奥利奥碎 10g。',
            en: '【Chocolate Oreo Sundae】: 10g chocolate bottom + 230g ice cream + 10g chocolate & 10g Oreo top.',
            id: '【Chocolate Oreo Sundae】: Saus Coklat 10gr di bawah + 230gr Susu + Saus Coklat 10gr & Remah Oreo 10gr di atas.'
          },
          {
            zh: '【超级仙草圣代 (Super Grass Jelly Sundae)】：杯底放蛋筒脆片 15g (无蛋筒可用仙草冻 120g 替代) + 牛奶冰淇淋 150g + 顶层椰果 25g + 芒果酱 25g。',
            en: '【Super Grass Jelly Sundae】: 15g cone crushed (or 120g cincau) bottom + 150g ice cream + 25g coconut jelly & 25g mango jam.',
            id: '【Super Grass Jelly Sundae】: Cone 15gr (atau cincau 120gr) di bawah + 150gr Susu + Coconut Jelly 25gr & Selai mangga 25gr di atas.'
          }
        ],
        tip: {
          zh: '打冰淇淋时压下手柄要果断，手腕匀速平缓转动杯身，最后顺势向上迅速收尖提杯，确保造型圆润挺拔。',
          en: 'Pull handle decisively, rotate cup steadily, lift quickly at the top for a sharp peak.',
          id: 'Tarik tuas dengan mantap, putar gelas stabil, angkat cepat di ujung untuk membentuk puncak rapi.'
        }
      },
      {
        title: {
          zh: '奶昔系列与雪顶冰沙系列制作配方',
          en: 'Milkshake & Snow Top Smoothie Recipes',
          id: 'Resep Standar Milkshake & Snow Top'
        },
        points: [
          {
            zh: '【奶昔规格基准】：标准打 2 圈冰淇淋 (2 Lingkaran)。',
            en: '【Milkshake Standard】: Dispense exactly 2 ice cream loops.',
            id: '【Standar Milkshake】: Es Cream tepat 2 Lingkaran.'
          },
          {
            zh: '【波霸奶昔 (Boba Milk Shake)】：珍珠 50g + 黑糖浆 15g + 牛奶冰淇淋 120g (2圈) + 满冰 + 红茶汤 100ml。',
            en: '【Boba Milkshake】: 50g boba + 15g brown sugar + 120g ice cream (2 loops) + ice + 100ml Black Tea.',
            id: '【Boba Milk Shake】: Boba 50gr + Gula Merah 15gr + Es Krim Susu 120gr + Hong Cha 100ml + es batu penuh.'
          },
          {
            zh: '【树莓奶昔 (Raspberry Milk Shake)】：椰果 1勺 + 树莓糖浆 25g + 草莓酱 20g + 牛奶冰淇淋 120g + 满冰 + 茉莉绿茶 150ml。',
            en: '【Raspberry Milkshake】: 1 scoop jelly + 25g raspberry syrup + 20g strawberry jam + 120g ice cream + 150ml Jasmine tea.',
            id: '【Raspberry Milk Shake】: Coconut Jelly 1 sdk + Syrup Raspberry 25gr + Selai Strawberry 20gr + Es Krim Susu 120gr + Mo Li Cha 150ml.'
          },
          {
            zh: '【雪顶规格基准】：标准打 1 圈冰淇淋 (1 Lingkaran)。',
            en: '【Snow Top Standard】: Dispense exactly 1 ice cream loop on top.',
            id: '【Standar Snow Top】: Es Cream tepat 1 Lingkaran di atas.'
          },
          {
            zh: '【草莓雪顶 (Strawberry Snow Top)】：沙冰机加冰块 100g + 草莓酱 35g + 果糖 25g + 茉莉绿茶 80ml 打顺滑出杯，顶部打 1 圈牛奶冰淇淋 + 淋草莓酱 20g。',
            en: '【Strawberry Snow Top】: Blend 100g ice + 35g jam + 25g sugar + 80ml tea; top with 1 loop ice cream + 20g jam.',
            id: '【Strawberry Ice Smoothie Snow Top】: Blender (Es 100gr + Selai Strawberry 35gr + Gula 25gr + Mo Li Cha 80ml); Topping: Es Krim 1 Lingkaran + Selai Strawberry 20gr.'
          },
          {
            zh: '【巧脆奥利奥雪顶 (Chocolate Oreo Snow Top)】：沙冰机加冰块 100g + 奥利奥碎 20g + 巧克力酱 25g + 果糖 25g + 水 100ml 打沙冰，顶部打 1 圈牛奶冰淇淋 + 撒奥利奥碎 5g。',
            en: '【Chocolate Oreo Snow Top】: Blend 100g ice + 20g oreo + 25g chocolate + 25g sugar + 100ml water; top with 1 loop ice cream + 5g oreo.',
            id: '【Chocolate Oreo Smoothie Snow Top】: Blender (Es 100gr + Oreo 20gr + Saus Cokelat 25gr + Gula 25gr + Air 100ml); Topping: Es Krim 1 Lingkaran + Oreo 5gr.'
          }
        ],
        warning: {
          zh: '严禁违规多打冰淇淋圈数！圣代4圈、奶昔2圈、雪顶1圈，超圈会导致成本失控且杯盖无法封紧溢出。',
          en: 'Strictly adhere to loops: Sundae 4, Milkshake 2, Snow Top 1; extra loops cause spills and cost overrun.',
          id: 'Dilarang menambah lingkaran es krim! Sundae 4, Milkshake 2, Snow Top 1; melebihi standar membuat tumpah dan boros bahan.'
        }
      }
    ],
    quiz: [
      {
        q: {
          zh: '标准圣代 (Sundae) 与奶昔 (Milkshake) 分别需要打几圈冰淇淋？',
          en: 'How many loops of ice cream are dispensed for Sundae and Milkshake?',
          id: 'Berapa lingkaran es krim standar untuk Sundae dan Milkshake?'
        },
        options: [
          { zh: '圣代 4 圈，奶昔 2 圈', en: 'Sundae 4 loops, Milkshake 2 loops', id: 'Sundae 4 Lingkaran, Milkshake 2 Lingkaran' },
          { zh: '圣代 2 圈，奶昔 4 圈', en: 'Sundae 2 loops, Milkshake 4 loops', id: 'Sundae 2 Lingkaran, Milkshake 4 Lingkaran' },
          { zh: '全部打 3 圈', en: 'All 3 loops', id: 'Semuanya 3 Lingkaran' }
        ],
        answer: 0
      },
      {
        q: {
          zh: '黑糖珍珠圣代 (Brown Sugar Pearl Sundae) 的黑糖浆应该加在哪个位置？',
          en: 'Where should brown sugar syrup be added in a Brown Sugar Pearl Sundae?',
          id: 'Di manakah sirup gula merah ditambahkan pada Brown Sugar Pearl Sundae?'
        },
        options: [
          { zh: '加在杯子最底部 (15g)，然后再打冰淇淋', en: 'At the bottom of the cup (15g) before ice cream', id: 'Di bagian dasar gelas (15gr) sebelum es krim' },
          { zh: '淋在冰淇淋最顶层', en: 'Drizzled on top of ice cream', id: 'Dituang di paling atas es krim' }
        ],
        answer: 0
      }
    ]
  },

  // ==================== 6. 门店五大核心设备操作保养与故障排查 (WEDRINK Page 11-22) ====================
  {
    key: 'machines_troubleshooting',
    icon: '⚙️',
    color: 'from-slate-700 to-indigo-900',
    title: {
      zh: '门店五大核心设备操作规范、保养维护与故障排查 (SOP)',
      en: '5 Core Store Machines Operation, Maintenance & Troubleshooting',
      id: 'SOP Pengoperasian, Pemeliharaan & Troubleshooting 5 Mesin Inti'
    },
    subtitle: {
      zh: '软冰机(电流/冻缸代码)、果糖机(FL/FP校准)、封口机(电眼)、开水机与制冰机',
      en: 'Ice cream machine (freeze code), fructose (calib), sealer (sensor), boiler & ice maker',
      id: 'Mesin es krim (arus/beku), mesin gula (kalibrasi), sealer, air panas & es batu'
    },
    minutes: 30,
    sections: [
      {
        title: {
          zh: '设备日常清洁与维护排程周期表',
          en: 'Equipment Cleaning Schedule Table',
          id: 'Jadwal Pembersihan Mesin-Mesin'
        },
        points: [
          {
            zh: '每日清洗 (Setiap Hari)：软冰淇淋机 (Mesin Es Krim) 必须每晚彻底拆洗消杀！',
            en: 'Daily: Soft ice cream machine must be cleaned and disinfected nightly!',
            id: 'Setiap Hari: Mesin Es Krim wajib dibongkar, dicuci dan disinfeksi tiap malam!'
          },
          {
            zh: '2天清洗一次 (2 Hari Sekali)：全自动封口机 (Mesin Seal)。',
            en: 'Every 2 Days: Cup Sealer machine.',
            id: '2 Hari Sekali: Mesin Seal Gelas.'
          },
          {
            zh: '每周清洗一次 (1 Minggu Sekali)：果糖定量机 (Mesin Gula)、吧台冰箱冷柜 (Kulkas Bar)。',
            en: 'Weekly: Fructose machine, Bar undercounter refrigerators.',
            id: '1 Minggu Sekali: Mesin Gula, Kulkas Bar.'
          },
          {
            zh: '每月深度维护一次 (1 Bulan Sekali)：步进式开水机 (Mesin Air Panas)、自动制冰机 (Mesin Es Batu)、水果冷藏柜 (Kulkas Buah)、吧台吊顶与不锈钢死角 (Bagian atas Bar)。',
            en: 'Monthly: Water boiler, Ice maker, Fruit chiller, Bar top ceiling.',
            id: '1 Bulan Sekali: Mesin Air Panas, Mesin Es Batu, Kulkas Buah, Bagian atas Bar.'
          }
        ]
      },
      {
        title: {
          zh: '软冰淇淋机安装调试、运行电流与故障代码 (Mesin Es Krim)',
          en: 'Ice Cream Machine Current, Cleaning & Error Codes',
          id: 'Instalasi, Arus Listrik & Kode Error Mesin Es Krim'
        },
        points: [
          {
            zh: '【工作电流设置】：使用 380V 三相电；首次注水测试基础空载电流（通常 2.5A 左右），在此基础上加 0.4-0.8A，工作电流调至 2.9 - 3.3A（严禁超过 3.5A，否则易过载烧毁电机）。',
            en: '【Operating Current】: 380V 3-phase. Base water clean current ~2.5A; set operating current to 2.9 - 3.3A (never exceed 3.5A).',
            id: '【Arus Listrik】: Listrik 380V. Tuang air klik Clean lihat arus dasar (mis. 2.5), tambahkan 0.4-0.8 disesuaikan ke 2.9-3.3 (jangan melebihi 3.5).'
          },
          {
            zh: '【双缸制冷进浆平衡原则】：两缸由同一套压缩机并联制冷，两缸必须同时注浆！若单缸长时间不出料将造成该缸过度冷冻而结冰抱死（冻缸）。只出单种口味时必须从中间把手双拼出料。',
            en: '【Twin Cylinder Balance】: Both cylinders share 1 compressor. Never run one cylinder dry or it will freeze solid! For single flavor, pull middle handle.',
            id: '【Keseimbangan 2 Silinder】: Didinginkan bersamaan. Dilarang mengambil hanya satu sisi terus menerus agar tidak beku; ambil dari bagian tengahnya.'
          },
          {
            zh: '【故障代码速查】：① CC: 传感器故障损坏；② JJ: 冻缸停机保护！处置：停机 30 分钟自然解冻化冰，严禁硬扳手柄折断零件，化开后按 Clean 排出清洗；③ CU: 三相电缺相；④ CE: 供电相序错位；⑤ UH: 电压过高报警（需装稳压器）；⑥ UL: 电压过低报警。',
            en: '【Error Codes】: ① CC: Sensor fault; ② JJ: Freeze locked! Stop 30 min to thaw, press Clean; ③ CU: Phase loss; ④ CE: Phase error; ⑤ UH: High voltage; ⑥ UL: Low voltage.',
            id: '【Kode Error】: ① CC: Sensor rusak; ② JJ: Silinder membeku! Stop 30 menit, klik Clean; ③ CU: Kekurangan daya/kabel lepas; ④ CE: Kesalahan fase listrik; ⑤ UH: Tegangan terlalu tinggi; ⑥ UL: Tegangan terlalu rendah.'
          },
          {
            zh: '【冻缸 6 大根源】：① 偏边单缸出料；② 原料水粉比例失调加水过多；③ 电压不稳；④ 进气孔膨化管堵塞；⑤ 左右料缸温差过大；⑥ 传动三角皮带松弛打滑。',
            en: '【6 Causes of Freezing】: ① Single side dispensing; ② Too much water in mix; ③ Voltage unstable; ④ Air tube clogged; ⑤ Temp difference; ⑥ Belt loose.',
            id: '【6 Penyebab Silinder Membeku】: ① Tuas tunggal terus; ② Bahan tidak sesuai proporsi; ③ Tegangan tidak stabil; ④ Lubang pompa tidak tepat; ⑤ Beda suhu kedua sisi; ⑥ Belt kendor.'
          }
        ],
        warning: {
          zh: '严禁向未化冻的冰淇淋机强行扳动出料把手，否则会导致搅拌轴齿轮断裂、密封圈撕裂报废！',
          en: 'Never force the dispensing handle while the cylinder is frozen solid!',
          id: 'Dilarang keras memaksa menarik tuas saat silinder masih membeku keras!'
        }
      },
      {
        title: {
          zh: '果糖定量机安装、校准 (FL/FP/FC) 与每周清洗 (Mesin Gula)',
          en: 'Fructose Dispenser Calibration (FL/FP/FC) & Cleaning',
          id: 'Kalibrasi (FL/FP/FC) & Pembersihan Mingguan Mesin Gula'
        },
        points: [
          {
            zh: '【按键与指示灯】：补给灯（缺糖提示）；加热灯（必须保持常闭 0 状态，严禁开启）；连续出糖/停止键；设定键；存储键（长按3秒自洁）。',
            en: '【Panel & Lights】: Refill light (low sugar); Heating light (must stay OFF 0); Continuous dispense; Set; Save/Clean.',
            id: '【Tombol & Lampu】: Lampu pasokan (gula habis); Lampu pemanas (wajib OFF 0); Tombol continue; Tombol setting (设定); Tombol simpan (存储).'
          },
          {
            zh: '【核心代码】：FL 全局出糖校准；FP 最大出糖量 (100g) 校准；FC 最小出糖量 (5g) 校准；FH 加热温控 (禁用)。',
            en: '【Codes】: FL General calibration; FP Max 100g calibration; FC Min 5g calibration; FH Heating (do not use).',
            id: '【Kode Setting】: FL (setting umum); FP (ukuran terbesar 100gr); FC (ukuran terkecil 5gr); FH (suhu - tidak digunakan).'
          },
          {
            zh: '【首次出糖三步校准】：准备 300ml 量杯与电子秤。① Setting FL：按设定键进入 FL，检查各键数字与面板一致后按存储；② Setting FP (100g)：按 100g 称重，不足按向上键，超重按向下键，反复调试至误差小于 0.5g；③ Setting FC (5g)：微调最小量。',
            en: '【3-Step Calibration】: Use 300ml cup & scale. ① FL general; ② FP 100g test & adjust arrows until error < 0.5g; ③ FC 5g test & adjust.',
            id: '【3 Langkah Kalibrasi】: Siapkan gelas 300ml & timbangan. ① Setting FL; ② Setting FP (100gr) uji & tekan panah hingga error < 0.5gr; ③ Setting FC (5gr).'
          },
          {
            zh: '【每周清洗步骤】：① 拆卸出糖口三件套（白色活塞、弹簧、金色螺母，顺序严禁搞反）；② 抽空残糖；③ 倒温水；④ 长按存储键 3 秒冲洗管路；⑤ 擦干装回。',
            en: '【Weekly Cleaning】: ① Remove nozzle 3 parts (white piston, spring, gold nut); ② Empty sugar; ③ Warm water; ④ Long press Save 3s to flush; ⑤ Reassemble.',
            id: '【Pembersihan Mingguan】: ① Lepas 3 bagian outlet (putih, per, emas); ② Kosongkan gula; ③ Air hangat lap dalam; ④ Tekan tombol simpan 3 detik untuk bilas; ⑤ Pasang kembali.'
          }
        ],
        tip: {
          zh: '若果糖机持续滴糖不绝：重点排查出糖口内部复位弹簧是否疲劳失灵，以及加热灯是否误开启导致糖浆过热变稀。',
          en: 'If sugar keeps dripping: inspect if the nozzle spring is fatigued, and ensure heating light is turned off.',
          id: 'Jika gula terus menetes: periksa apakah per pegas masih elastis, dan pastikan tombol pemanas tidak menyala.'
        }
      },
      {
        title: {
          zh: '封口机安装、穿膜防呆、电眼与日常维护 (Mesin Seal Gelas)',
          en: 'Cup Sealer Setup, Film Threading, Sensor & Maintenance',
          id: 'Instalasi, Pasang Plastik Seal, Sensor & Perawatan Sealer'
        },
        points: [
          {
            zh: '【参数与温度设置】：支持 500ml/700ml 托盘高度调整；正常封口温度必须设定在 170°C - 180°C 之间。',
            en: '【Temperature】: Set sealer temperature between 170°C - 180°C.',
            id: '【Suhu Sealer】: Suhu harus diatur antara 170-180 derajat Celcius.'
          },
          {
            zh: '【胶膜穿装防呆顺序】：后挡盘 -> 胶膜卷 (LOGO文字朝上) -> 垫片 (ring) -> 弹簧 (pegas) -> 锁扣 (klip)；胶膜必须穿过光电感应眼凹槽。',
            en: '【Film Assembly Order】: Back plate -> Film (Logo facing up) -> Ring -> Spring -> Clip; pass through sensor slot.',
            id: '【Urutan Pasang Plastik】: Ring -> Pegas -> Klip; Logo harus menghadap ke atas; Plastik seal harus terjepit di antara sensor.'
          },
          {
            zh: '【电眼调节】：前后滑动绿色电眼传感器，使红外光斑精确对准胶膜边缘的黑标定位色块，防止切边断字。',
            en: '【Sensor Alignment】: Slide sensor to align red beam with the black mark on the film edge.',
            id: '【Setting Sensor】: Geser sensor hijau ke atas/bawah agar sejajar tepat dengan tanda hitam (black mark).'
          },
          {
            zh: '【按键操作与补漏】：每天早晨长按清零键 (清零) 重置计数；杯口漏封按红色防漏补漏键 (OK) 补压；按暂停键 5 秒可进入清洁模式。',
            en: '【Keys】: Reset counter daily; press red OK button for reseal leaks; hold Pause 5s for cleaning mode.',
            id: '【Tombol】: Reset hitungan tiap pagi; Tombol merah OK (防漏补漏) untuk reseal; Tahan Pause 5 detik untuk mode cuci.'
          }
        ]
      },
      {
        title: {
          zh: '开水机与制冰机安装维护与除垢 (Air Panas & Es Batu)',
          en: 'Water Boiler & Ice Maker Setup & Descaling',
          id: 'Instalasi & Perawatan Mesin Air Panas & Mesin Es Batu'
        },
        points: [
          {
            zh: '【步进式开水机 (Air Panas)】：使用 380V / 6000W 电源；进水管必须接过滤净水；每月按比例加入柠檬酸，加热保温浸泡 3 小时除垢，彻底排水并冲洗 2-3 次。',
            en: '【Water Boiler】: 380V/6000W; filtered water only; monthly citric acid soak for 3 hours to descale.',
            id: '【Mesin Air Panas】: Daya 380V/6000W; wajib air filter; sebulan sekali tuang deterjen lemon rendam 3 jam untuk bersihkan kerak.'
          },
          {
            zh: '【自动制冰机 (Es Batu)】：调平四脚；出冰周期约为 14 - 17 分钟；冰块厚度调节：长按“Yu Yue (预约)”键 7 秒，按调整键设定为 03 档（推荐标准档位）。',
            en: '【Ice Maker】: Level the legs; ice cycle 14-17 min; adjust thickness by holding "Yu Yue" 7s and setting to 03 level.',
            id: '【Mesin Es Batu】: Pasang 4 kaki datar; siklus es 14-17 menit; atur ketebalan dengan tahan tombol Yu Yue 7 detik, atur ke angka 03.'
          },
          {
            zh: '【制冰机故障排查】：① 进水不停：浮球水位卡滞；② 制冰变慢/不制冰：检查缺氟、水槽缺水、喷水孔堵塞、蒸发器结垢；每月柠檬酸循环清洗一次。',
            en: '【Troubleshooting】: ① Water won’t stop: float stuck; ② Slow ice: check freon, water level, spray nozzle, scale.',
            id: '【Penyelesaian Masalah】: ① Air mengalir terus: pelampung macet; ② Es lambat: freon kurang, tekanan air, pipa semprot tersumbat, kerak.'
          }
        ],
        tip: {
          zh: '水质硬度高是设备第一杀手，开水机与制冰机必须每月定期柠檬酸除垢，延长发热管与水泵寿命。',
          en: 'Hard water scale is the #1 killer; always descale boilers and ice machines monthly with citric acid.',
          id: 'Kerak air adalah musuh utama mesin; rutin bersihkan kerak sebulan sekali agar pemanas dan pompa awet.'
        }
      }
    ],
    quiz: [
      {
        q: {
          zh: '软冰淇淋机 (Mesin Es Krim) 的标准运行工作电流应调节在多少范围内？',
          en: 'What is the standard operating current range for the soft ice cream machine?',
          id: 'Berapakah rentang arus pengoperasian yang disarankan untuk mesin es krim?'
        },
        options: [
          { zh: '2.9 - 3.3A（严禁超过 3.5A）', en: '2.9 - 3.3A (never exceed 3.5A)', id: '2.9 - 3.3A (disarankan tidak melebihi 3.5A)' },
          { zh: '1.0 - 1.5A', en: '1.0 - 1.5A', id: '1.0 - 1.5A' },
          { zh: '5.0 - 6.0A', en: '5.0 - 6.0A', id: '5.0 - 6.0A' }
        ],
        answer: 0
      },
      {
        q: {
          zh: '冰淇淋机出现 JJ 代码报警表示什么故障，应当如何处置？',
          en: 'What does error code JJ mean on the ice cream machine, and how to resolve it?',
          id: 'Apa arti kode error JJ pada mesin es krim dan bagaimana solusinya?'
        },
        options: [
          { zh: '缺电断电，立即换电池', en: 'Low power, change battery', id: 'Kurang daya, ganti baterai' },
          { zh: '严重冻缸保护停机！停机 30 分钟自然解冻化冰后，按 Clean 排出清洗', en: 'Cylinder frozen! Stop for 30 min to thaw, then press Clean', id: 'Silinder membeku! Stop selama 30 menit, lalu tekan tombol Clean untuk pembersihan' },
          { zh: '冰淇淋太热，立即加冰块', en: 'Too hot, add ice', id: 'Terlalu panas, tambah es' }
        ],
        answer: 1
      },
      {
        q: {
          zh: '制冰机 (Mesin Es Batu) 调节冰块厚度时，长按哪个按键并推荐调至几档？',
          en: 'Which button is held to adjust ice thickness and what level is recommended?',
          id: 'Tombol apa yang ditahan untuk mengatur ketebalan es batu dan angka berapa yang disarankan?'
        },
        options: [
          { zh: '长按 Yu Yue (预约) 键 7 秒，推荐调至 03 档', en: 'Hold Yu Yue 7 sec, set to level 03', id: 'Menahan tombol Yu Yue selama 7 detik, disarankan di angka 03' },
          { zh: '按开关机键调至 99 档', en: 'Press power to 99', id: 'Tekan power ke angka 99' }
        ],
        answer: 0
      }
    ]
  },

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

