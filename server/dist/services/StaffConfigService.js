"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_STAFF_CONFIG = void 0;
exports.getStaffConfig = getStaffConfig;
exports.saveStaffConfig = saveStaffConfig;
exports.isFeatureEnabled = isFeatureEnabled;
const database_1 = __importDefault(require("../config/database"));
// 默认配置
exports.DEFAULT_STAFF_CONFIG = {
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
};
// 获取门店的员工配置
async function getStaffConfig(storeId) {
    const config = await database_1.default.config.findUnique({
        where: {
            storeId_key: {
                storeId,
                key: 'staff.features'
            }
        }
    });
    if (!config) {
        return exports.DEFAULT_STAFF_CONFIG;
    }
    try {
        return { ...exports.DEFAULT_STAFF_CONFIG, ...JSON.parse(config.value) };
    }
    catch {
        return exports.DEFAULT_STAFF_CONFIG;
    }
}
// 保存员工配置
async function saveStaffConfig(storeId, config) {
    const existing = await database_1.default.config.findUnique({
        where: {
            storeId_key: {
                storeId,
                key: 'staff.features'
            }
        }
    });
    const currentConfig = existing ? JSON.parse(existing.value) : exports.DEFAULT_STAFF_CONFIG;
    const newConfig = { ...currentConfig, ...config };
    await database_1.default.config.upsert({
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
    });
    return newConfig;
}
// 检查某项功能是否启用
async function isFeatureEnabled(storeId, feature) {
    const config = await getStaffConfig(storeId);
    return config[feature];
}
//# sourceMappingURL=StaffConfigService.js.map