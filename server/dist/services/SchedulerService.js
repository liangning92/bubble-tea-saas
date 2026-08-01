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
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHygieneScheduler = startHygieneScheduler;
exports.stopHygieneScheduler = stopHygieneScheduler;
exports.triggerHygieneTasksNow = triggerHygieneTasksNow;
const HygieneService = __importStar(require("./HygieneService"));
// 调度器定时检查间隔 (毫秒)
const CHECK_INTERVAL = 60 * 1000; // 1分钟
const isDev = process.env.NODE_ENV !== 'production';
let schedulerInterval = null;
/**
 * 启动卫生任务调度器
 * 每分钟检查一次是否有模板需要触发
 */
function startHygieneScheduler() {
    if (schedulerInterval) {
        if (isDev)
            console.log('[Scheduler] Hygiene scheduler already running');
        return;
    }
    if (isDev)
        console.log('[Scheduler] Starting hygiene task scheduler (every 60s)');
    // 立即执行一次
    processHygieneTasks();
    //定时执行
    schedulerInterval = setInterval(processHygieneTasks, CHECK_INTERVAL);
}
/**
 * 停止调度器
 */
function stopHygieneScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        if (isDev)
            console.log('[Scheduler] Hygiene scheduler stopped');
    }
}
/**
 * 处理到期的卫生任务模板
 */
async function processHygieneTasks() {
    try {
        const count = await HygieneService.processDueTemplates();
        if (isDev && count > 0) {
            console.log(`[Scheduler] Created ${count} hygiene tasks`);
        }
    }
    catch (error) {
        console.error('[Scheduler] Error processing hygiene tasks:', error);
    }
}
/**
 * 手动触发一次任务生成 (用于测试或手动补救)
 */
async function triggerHygieneTasksNow() {
    return processHygieneTasks();
}
//# sourceMappingURL=SchedulerService.js.map