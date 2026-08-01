"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceVariables = replaceVariables;
exports.getAvailableVariables = getAvailableVariables;
exports.createMessageChannel = createMessageChannel;
exports.getMessageChannels = getMessageChannels;
exports.getDefaultChannel = getDefaultChannel;
exports.updateMessageChannel = updateMessageChannel;
exports.deleteMessageChannel = deleteMessageChannel;
exports.createMessageTemplate = createMessageTemplate;
exports.getMessageTemplates = getMessageTemplates;
exports.getTemplateByTypeAndChannel = getTemplateByTypeAndChannel;
exports.updateMessageTemplate = updateMessageTemplate;
exports.deleteMessageTemplate = deleteMessageTemplate;
exports.sendMessageToMember = sendMessageToMember;
exports.broadcastMessage = broadcastMessage;
exports.getMessageLogs = getMessageLogs;
exports.getMessageStats = getMessageStats;
exports.createDefaultTemplates = createDefaultTemplates;
const database_1 = __importDefault(require("../config/database"));
// Variable placeholders for message templates
const AVAILABLE_VARIABLES = [
    'member_name',
    'member_phone',
    'coupon_code',
    'coupon_value',
    'coupon_expiry',
    'points',
    'points_value',
    'expiry_date',
    'store_name',
    'store_phone',
    'order_number',
    'order_amount',
    'campaign_name',
    'referral_code',
    'tier_name',
    'tier_benefits'
];
// Replace variables in message body
function replaceVariables(body, variables) {
    let result = body;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
    return result;
}
// Get available variables
function getAvailableVariables() {
    return AVAILABLE_VARIABLES;
}
// Create message channel
async function createMessageChannel(data) {
    return database_1.default.messageChannel.create({
        data: {
            storeId: data.storeId,
            type: data.type,
            name: data.name,
            provider: data.provider,
            config: JSON.stringify(data.config),
            enabled: data.enabled ?? true,
            priority: data.priority ?? 0,
            costPerSms: data.costPerSms ?? 0,
            dailyLimit: data.dailyLimit ?? 1000,
            monthlyLimit: data.monthlyLimit ?? 10000,
            isDefault: data.isDefault ?? false
        }
    });
}
// Get message channels for store
async function getMessageChannels(storeId) {
    return database_1.default.messageChannel.findMany({
        where: { storeId },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
    });
}
// Get default channel for type
async function getDefaultChannel(storeId, type) {
    return database_1.default.messageChannel.findFirst({
        where: { storeId, type, enabled: true },
        orderBy: [{ isDefault: 'desc' }, { priority: 'desc' }]
    });
}
// Update message channel
async function updateMessageChannel(id, data) {
    const updateData = { ...data };
    if (data.config) {
        updateData.config = JSON.stringify(data.config);
    }
    return database_1.default.messageChannel.update({
        where: { id },
        data: updateData
    });
}
// Delete message channel
async function deleteMessageChannel(id) {
    return database_1.default.messageChannel.delete({ where: { id } });
}
// Create message template
async function createMessageTemplate(data) {
    return database_1.default.messageTemplate.create({
        data: {
            storeId: data.storeId,
            type: data.type,
            name: data.name,
            channel: data.channel,
            subject: data.subject,
            body: data.body,
            variables: JSON.stringify(data.variables || []),
            enabled: data.enabled ?? true,
            isDefault: data.isDefault ?? false,
            sortOrder: data.sortOrder ?? 0
        }
    });
}
// Get message templates for store
async function getMessageTemplates(storeId, type) {
    const where = { storeId };
    if (type)
        where.type = type;
    return database_1.default.messageTemplate.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }]
    });
}
// Get template by type and channel
async function getTemplateByTypeAndChannel(storeId, type, channel) {
    // First try to find template matching both type and channel
    let template = await database_1.default.messageTemplate.findFirst({
        where: {
            storeId,
            type,
            channel: { in: [channel, 'all'] },
            enabled: true
        },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }]
    });
    // Fallback to 'all' channel template
    if (!template) {
        template = await database_1.default.messageTemplate.findFirst({
            where: { storeId, type, channel: 'all', enabled: true },
            orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }]
        });
    }
    return template;
}
// Update message template
async function updateMessageTemplate(id, data) {
    const updateData = { ...data };
    if (data.variables) {
        updateData.variables = JSON.stringify(data.variables);
    }
    return database_1.default.messageTemplate.update({
        where: { id },
        data: updateData
    });
}
// Delete message template
async function deleteMessageTemplate(id) {
    return database_1.default.messageTemplate.delete({ where: { id } });
}
// Mock SMS Provider (for development/testing)
class MockSMSProvider {
    async send(phone, message) {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
            success: true,
            messageId: `mock_sms_${Date.now()}`,
            cost: 150 // 150 IDR per SMS
        };
    }
}
// Mock WhatsApp Provider
class MockWhatsAppProvider {
    async send(phone, templateName, variables) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
            success: true,
            messageId: `mock_wa_${Date.now()}`,
            cost: 500 // 500 IDR per WhatsApp message
        };
    }
}
// Get provider instance based on type
function getProvider(provider, config) {
    switch (provider) {
        case 'twilio':
            // In production, implement actual Twilio integration
            // const twilio = require('twilio')(config.accountSid, config.authToken)
            return new MockSMSProvider();
        case 'nexmo':
            // In production, implement actual Nexmo/Vonage integration
            return new MockSMSProvider();
        case 'whatsapp':
            return new MockWhatsAppProvider();
        default:
            return new MockSMSProvider();
    }
}
// Send message to member
async function sendMessageToMember(storeId, memberId, type, channelType, templateId, customBody) {
    // Get member info
    const member = await database_1.default.member.findUnique({
        where: { id: memberId }
    });
    if (!member) {
        return { success: false, error: 'Member not found' };
    }
    // Get store info
    const store = await database_1.default.store.findUnique({
        where: { id: storeId }
    });
    // Get channel
    const channel = await getDefaultChannel(storeId, channelType);
    if (!channel) {
        return { success: false, error: `No enabled ${channelType} channel configured` };
    }
    // Get template if not custom
    let template = null;
    let body = customBody || '';
    if (templateId) {
        template = await database_1.default.messageTemplate.findUnique({
            where: { id: templateId }
        });
        if (template) {
            body = template.body;
        }
    }
    // Prepare variables
    const variables = {
        member_name: member.name,
        member_phone: member.phone,
        store_name: store?.name || '',
        store_phone: store?.phone || '',
        tier_name: member.level
    };
    // Replace variables in body
    const finalBody = replaceVariables(body, variables);
    // Get provider and send
    const provider = getProvider(channel.provider, JSON.parse(channel.config));
    let result;
    if (channelType === 'whatsapp' && template) {
        // Convert all variables to strings for WhatsApp
        const stringVars = {};
        for (const [key, value] of Object.entries(variables)) {
            stringVars[key] = String(value);
        }
        result = await provider.send(member.phone, template.name, stringVars);
    }
    else {
        result = await provider.send(member.phone, finalBody);
    }
    // Log the message
    await database_1.default.messageLog.create({
        data: {
            storeId,
            memberId,
            channelId: channel.id,
            templateId,
            type,
            channelType,
            recipient: member.phone,
            subject: template?.subject,
            body: finalBody,
            status: result.success ? 'sent' : 'failed',
            providerId: result.messageId,
            errorMessage: result.error,
            cost: result.cost ?? 0,
            sentAt: result.success ? new Date() : null
        }
    });
    return result;
}
// Broadcast message to multiple members
async function broadcastMessage(storeId, memberIds, type, channelType, templateId, customBody) {
    const results = [];
    let success = 0;
    let failed = 0;
    for (const memberId of memberIds) {
        const result = await sendMessageToMember(storeId, memberId, type, channelType, templateId, customBody);
        results.push(result);
        if (result.success) {
            success++;
        }
        else {
            failed++;
        }
    }
    return { success, failed, results };
}
// Get message logs
async function getMessageLogs(storeId, options = {}) {
    const where = { storeId };
    if (options.memberId)
        where.memberId = options.memberId;
    if (options.type)
        where.type = options.type;
    if (options.channelType)
        where.channelType = options.channelType;
    if (options.status)
        where.status = options.status;
    if (options.startDate || options.endDate) {
        where.createdAt = {};
        if (options.startDate)
            where.createdAt.gte = options.startDate;
        if (options.endDate)
            where.createdAt.lte = options.endDate;
    }
    const [logs, total] = await Promise.all([
        database_1.default.messageLog.findMany({
            where,
            include: {
                member: { select: { name: true, phone: true } },
                channel: { select: { name: true, type: true } },
                template: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: options.limit ?? 50,
            skip: options.offset ?? 0
        }),
        database_1.default.messageLog.count({ where })
    ]);
    return { logs, total };
}
// Get message statistics
async function getMessageStats(storeId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const [todayLogs, monthLogs, pendingLogs, failedLogs] = await Promise.all([
        database_1.default.messageLog.aggregate({
            where: { storeId, createdAt: { gte: today } },
            _count: true,
            _sum: { cost: true }
        }),
        database_1.default.messageLog.aggregate({
            where: { storeId, createdAt: { gte: monthStart } },
            _count: true,
            _sum: { cost: true }
        }),
        database_1.default.messageLog.count({ where: { storeId, status: 'pending' } }),
        database_1.default.messageLog.count({ where: { storeId, status: 'failed' } })
    ]);
    return {
        today: {
            count: todayLogs._count,
            cost: todayLogs._sum.cost || 0
        },
        month: {
            count: monthLogs._count,
            cost: monthLogs._sum.cost || 0
        },
        pending: pendingLogs,
        failed: failedLogs
    };
}
// Create default templates for a store
async function createDefaultTemplates(storeId) {
    const templates = [
        {
            type: 'birthday',
            name: 'Birthday Greeting (SMS)',
            channel: 'sms',
            subject: null,
            body: 'Selamat ulang tahun {member_name}! 🎂 Nikmati minuman GRATIS hari ini dengan menunjukkan pesan ini. Berlaku 1x di {store_name}. Selamat berbelanja! 🧋',
            isDefault: true
        },
        {
            type: 'birthday',
            name: 'Birthday Greeting (WhatsApp)',
            channel: 'whatsapp',
            subject: '🎂 Happy Birthday!',
            body: 'Selamat ulang tahun {member_name}! 🎂\n\nDapatkan minuman GRATIS hari ini di {store_name}!\n\nTunjukkan pesan ini ke kasir.\n\nSemoga harimu menyenangkan! 🧋',
            isDefault: true
        },
        {
            type: 'reactivation',
            name: 'Reactivation Reminder (SMS)',
            channel: 'sms',
            subject: null,
            body: 'Hai {member_name}! Kami rindu kamu! 🧋 Kunjungi {store_name} dan dapatkan kupon spesial 20% untuk minuman favoritmu. Berlaku sampai akhir bulan ini!',
            isDefault: true
        },
        {
            type: 'points_expiring',
            name: 'Points Expiring Warning (SMS)',
            channel: 'sms',
            subject: null,
            body: 'Hai {member_name}! Poin kamu ({points} poin) akan segera kadaluarsa dalam 14 hari. Segera tukarkan dengan hadiah menarik di {store_name}! 🏪',
            isDefault: true
        },
        {
            type: 'seasonal',
            name: 'Ramadan Promotion (SMS)',
            channel: 'sms',
            subject: null,
            body: 'Selamat Ramadan {member_name}! 🌙 Dapatkan DISKON 15% untuk semua minuman di {store_name} sepanjang bulan suci ini. Berlaku setiap hari. Selamat beribadah! 🕌',
            isDefault: true
        },
        {
            type: 'welcome',
            name: 'Welcome Message (SMS)',
            channel: 'sms',
            subject: null,
            body: 'Selamat {member_name}! 🎉 Anda sekarang adalah member {tier_name} di {store_name}. Kumpulkan poin setiap pembelian dan tukarkan dengan minuman GRATIS! 🧋',
            isDefault: true
        },
        {
            type: 'referral',
            name: 'Referral Success (SMS)',
            channel: 'sms',
            subject: null,
            body: '{member_name}, teman Anda telah mendaftar menggunakan kode referral Anda! 🎉 Anda mendapatkan {points} poin. Terima kasih sudah mengajak teman! 🧋',
            isDefault: true
        }
    ];
    const created = [];
    for (const t of templates) {
        const existing = await database_1.default.messageTemplate.findFirst({
            where: { storeId, type: t.type, channel: t.channel }
        });
        if (!existing) {
            const createdTemplate = await database_1.default.messageTemplate.create({
                data: {
                    storeId,
                    ...t,
                    variables: JSON.stringify(['member_name', 'store_name', 'tier_name', 'points', 'coupon_code'])
                }
            });
            created.push(createdTemplate);
        }
    }
    return created;
}
//# sourceMappingURL=MessageService.js.map