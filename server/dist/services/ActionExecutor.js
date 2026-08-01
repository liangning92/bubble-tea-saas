"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAction = executeAction;
exports.executeCampaignActions = executeCampaignActions;
exports.getActionDefinitions = getActionDefinitions;
const database_1 = __importDefault(require("../config/database"));
const MessageService_1 = require("./MessageService");
const executors = {
    // Send coupon to member
    send_coupon: async (config, ctx) => {
        const { couponId } = config;
        if (!couponId) {
            console.warn('send_coupon action: no couponId provided');
            return;
        }
        // Generate coupon for member
        await database_1.default.memberCoupon.create({
            data: {
                memberId: ctx.memberId,
                couponId,
                status: 'unused'
            }
        });
    },
    // Send message to member
    send_message: async (config, ctx) => {
        const { templateId, channel } = config;
        if (!templateId) {
            console.warn('send_message action: no templateId provided');
            return;
        }
        try {
            const result = await (0, MessageService_1.sendMessageToMember)(ctx.storeId, ctx.memberId, 'campaign', channel || 'sms', templateId);
        }
        catch (error) {
            console.error(`[ActionExecutor] Failed to send message to member ${ctx.memberId}:`, error);
        }
    },
    // Add points to member
    add_points: async (config, ctx) => {
        const { points, note } = config;
        if (!points || points <= 0) {
            console.warn('add_points action: no valid points provided');
            return;
        }
        await database_1.default.member.update({
            where: { id: ctx.memberId },
            data: { points: { increment: points } }
        });
        await database_1.default.pointLog.create({
            data: {
                memberId: ctx.memberId,
                type: 'earn',
                points,
                orderId: ctx.orderId || null,
                note: note || `Campaign: ${ctx.campaignName || 'Unknown'}`
            }
        });
    },
    // Remove points from member
    remove_points: async (config, ctx) => {
        const { points, note } = config;
        if (!points || points <= 0) {
            console.warn('remove_points action: no valid points provided');
            return;
        }
        await database_1.default.member.update({
            where: { id: ctx.memberId },
            data: { points: { decrement: points } }
        });
        await database_1.default.pointLog.create({
            data: {
                memberId: ctx.memberId,
                type: 'adjust',
                points: -points,
                orderId: ctx.orderId || null,
                note: note || `Campaign: ${ctx.campaignName || 'Unknown'}`
            }
        });
    }
};
// Execute a single action
async function executeAction(actionKey, config, ctx) {
    const executor = executors[actionKey];
    if (!executor) {
        console.warn(`[ActionExecutor] Unknown action key: ${actionKey}`);
        return;
    }
    try {
        await executor(config, ctx);
    }
    catch (error) {
        console.error(`[ActionExecutor] Error executing action ${actionKey}:`, error);
    }
}
// Execute multiple actions for a campaign
async function executeCampaignActions(actions, ctx) {
    let executed = 0;
    let failed = 0;
    // Sort by sortOrder
    const sorted = [...actions].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const action of sorted) {
        try {
            const config = typeof action.config === 'string' ? JSON.parse(action.config) : action.config;
            await executeAction(action.actionKey, config, ctx);
            executed++;
        }
        catch (error) {
            console.error(`[ActionExecutor] Failed to execute action ${action.actionKey}:`, error);
            failed++;
        }
    }
    return { executed, failed };
}
// Get all action definitions (for UI)
function getActionDefinitions() {
    return [
        {
            key: 'send_coupon',
            name: 'Send Coupon',
            description: 'Send a coupon to the member',
            configSchema: {
                type: 'object',
                properties: {
                    couponId: { type: 'string', label: 'Select Coupon' }
                },
                required: ['couponId']
            }
        },
        {
            key: 'send_message',
            name: 'Send Message',
            description: 'Send a notification message to the member',
            configSchema: {
                type: 'object',
                properties: {
                    templateId: { type: 'string', label: 'Select Template' },
                    channel: { type: 'string', label: 'Channel', enum: ['sms', 'whatsapp'] }
                },
                required: ['templateId']
            }
        },
        {
            key: 'add_points',
            name: 'Add Points',
            description: 'Add points to the member account',
            configSchema: {
                type: 'object',
                properties: {
                    points: { type: 'number', label: 'Points to Add' },
                    note: { type: 'string', label: 'Note (optional)' }
                },
                required: ['points']
            }
        },
        {
            key: 'remove_points',
            name: 'Remove Points',
            description: 'Remove points from the member account',
            configSchema: {
                type: 'object',
                properties: {
                    points: { type: 'number', label: 'Points to Remove' },
                    note: { type: 'string', label: 'Reason (optional)' }
                },
                required: ['points']
            }
        }
    ];
}
//# sourceMappingURL=ActionExecutor.js.map