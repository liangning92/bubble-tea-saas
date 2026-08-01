"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAutomationTime = getAutomationTime;
exports.setAutomationTime = setAutomationTime;
exports.startMarketingScheduler = startMarketingScheduler;
exports.stopMarketingScheduler = stopMarketingScheduler;
exports.triggerMarketingAutomationNow = triggerMarketingAutomationNow;
const database_1 = __importDefault(require("../config/database"));
const MarketingService = __importStar(require("./MarketingAutomationService"));
const CHECK_INTERVAL = 60 * 1000; // 1 minute
const CONFIG_KEY = 'marketing.automation_time';
const DEFAULT_TIME = '00:00';
let schedulerInterval = null;
let lastRunTime = 0;
/**
 * 获取配置的营销自动化执行时间
 */
async function getAutomationTime(storeId) {
    try {
        const config = await database_1.default.config.findUnique({
            where: { storeId_key: { storeId, key: CONFIG_KEY } }
        });
        return config?.value || DEFAULT_TIME;
    }
    catch {
        return DEFAULT_TIME;
    }
}
/**
 * 设置营销自动化执行时间
 */
async function setAutomationTime(storeId, time) {
    await database_1.default.config.upsert({
        where: { storeId_key: { storeId, key: CONFIG_KEY } },
        create: { storeId, key: CONFIG_KEY, value: time, category: 'marketing' },
        update: { value: time }
    });
}
/**
 * 执行营销自动化检查
 */
async function runMarketingAutomation() {
    try {
        const stores = await database_1.default.store.findMany({
            where: {}
        });
        for (const store of stores) {
            //1. 生日触发
            try {
                await MarketingService.checkBirthdayCampaign(store.id);
            }
            catch (e) {
                console.error(`[MarketingScheduler] Birthday campaign error for store ${store.id}:`, e);
            }
            // 2. 重新激活 (7天未消费)
            try {
                await MarketingService.checkReactivationCampaign(store.id);
            }
            catch (e) {
                console.error(`[MarketingScheduler] Reactivation campaign error for store ${store.id}:`, e);
            }
            // 3. 积分过期提醒
            try {
                await MarketingService.checkPointsExpiringCampaign(store.id);
            }
            catch (e) {
                console.error(`[MarketingScheduler] Points expiring campaign error for store ${store.id}:`, e);
            }
            // 4. 季节性活动
            try {
                await MarketingService.checkSeasonalCampaign(store.id);
            }
            catch (e) {
                console.error(`[MarketingScheduler] Seasonal campaign error for store ${store.id}:`, e);
            }
            // 5. 新客欢迎
            try {
                await MarketingService.checkWelcomeCampaign(store.id);
            }
            catch (e) {
                console.error(`[MarketingScheduler] Welcome campaign error for store ${store.id}:`, e);
            }
        }
    }
    catch (error) {
        console.error('[MarketingScheduler] Error running marketing automation:', error);
    }
}
/**
 * 启动营销自动化调度器
 */
function startMarketingScheduler() {
    if (schedulerInterval) {
        return;
    }
    schedulerInterval = setInterval(async () => {
        const now = new Date();
        const currentMinute = now.getTime();
        // Skip if we already ran in this minute
        if (currentMinute - lastRunTime < 60000)
            return;
        // Get automation time from first active store (or default)
        const store = await database_1.default.store.findFirst();
        if (!store)
            return;
        const automationTime = await getAutomationTime(store.id);
        const timeParts = automationTime.split(':');
        const targetHour = parseInt(timeParts[0], 10);
        const targetMin = parseInt(timeParts[1], 10);
        // Validate parsed values
        if (isNaN(targetHour) || isNaN(targetMin)) {
            console.warn('[MarketingScheduler] Invalid automation time configured:', automationTime);
            return;
        }
        // Check if current time matches configured time
        if (now.getHours() === targetHour && now.getMinutes() === targetMin) {
            lastRunTime = currentMinute;
            await runMarketingAutomation();
        }
    }, CHECK_INTERVAL);
}
/**
 * 停止营销自动化调度器
 */
function stopMarketingScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
    }
}
/**
 * 手动触发一次营销自动化 (用于测试)
 */
async function triggerMarketingAutomationNow() {
    await runMarketingAutomation();
}
//# sourceMappingURL=MarketingSchedulerService.js.map