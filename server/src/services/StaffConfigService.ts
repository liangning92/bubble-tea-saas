import prisma from '../config/database'

// 员工模块功能配置
export interface StaffFeatureConfig {
  // 排班管理
  customShifts: boolean           // 自定义班次
  shiftSwapConfirmation: boolean  // 调班需要双方确认

  // 考勤管理
  gpsCheckIn: boolean             // GPS打卡
  attendanceRuleActive: boolean   // 考勤规则生效
  autoLeaveBalance: boolean       // 自动计算年假余额
  leaveScheduleLinkage: boolean   // 请假与排班联动

  // 薪资管理
  salesPerformance: boolean       // 销售业绩统计
  attendanceBonus: boolean        // 全勤奖
  salaryPdfExport: boolean        // 工资条PDF导出

  // 积分管理
  pointRedemptionStock: boolean   // 积分兑换扣库存
}

// 默认配置
export const DEFAULT_STAFF_CONFIG: StaffFeatureConfig = {
  customShifts: true,
  shiftSwapConfirmation: true,
  gpsCheckIn: false,
  attendanceRuleActive: false,
  autoLeaveBalance: true,
  leaveScheduleLinkage: true,
  salesPerformance: false,
  attendanceBonus: false,
  salaryPdfExport: false,
  pointRedemptionStock: false,
}

// 获取门店的员工配置
export async function getStaffConfig(storeId: string): Promise<StaffFeatureConfig> {
  const config = await prisma.config.findUnique({
    where: {
      storeId_key: {
        storeId,
        key: 'staff.features'
      }
    }
  })

  if (!config) {
    return DEFAULT_STAFF_CONFIG
  }

  try {
    return { ...DEFAULT_STAFF_CONFIG, ...JSON.parse(config.value) }
  } catch {
    return DEFAULT_STAFF_CONFIG
  }
}

// 保存员工配置
export async function saveStaffConfig(storeId: string, config: Partial<StaffFeatureConfig>): Promise<StaffFeatureConfig> {
  const existing = await prisma.config.findUnique({
    where: {
      storeId_key: {
        storeId,
        key: 'staff.features'
      }
    }
  })

  const currentConfig = existing ? JSON.parse(existing.value) : DEFAULT_STAFF_CONFIG
  const newConfig = { ...currentConfig, ...config }

  await prisma.config.upsert({
    where: {
      storeId_key: {
        storeId,
        key: 'staff.features'
      }
    },
    create: {
      storeId,
      key: 'staff.features',
      value: JSON.stringify(newConfig),
      category: 'staff'
    },
    update: {
      value: JSON.stringify(newConfig)
    }
  })

  return newConfig
}

// 检查某项功能是否启用
export async function isFeatureEnabled(storeId: string, feature: keyof StaffFeatureConfig): Promise<boolean> {
  const config = await getStaffConfig(storeId)
  return config[feature]
}