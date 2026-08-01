"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateCondition = evaluateCondition;
exports.findMatchingMembers = findMatchingMembers;
exports.memberMatchesConditions = memberMatchesConditions;
exports.getConditionDefinitions = getConditionDefinitions;
const database_1 = __importDefault(require("../config/database"));
const dateUtils_1 = require("../utils/dateUtils");
const evaluators = {
    // Member has not visited in X days
    'member.inactive_days': (value, ctx) => {
        const days = parseInt(value, 10);
        if (isNaN(days) || !ctx.member.lastVisit)
            return false;
        return (0, dateUtils_1.subDays)(new Date(), days) > ctx.member.lastVisit;
    },
    // Member birthday is today
    'member.birthday_today': (value, ctx) => {
        if (!ctx.member.birthday)
            return false;
        return (0, dateUtils_1.isSameDay)(ctx.member.birthday, new Date());
    },
    // Member points > value
    'member.points_gt': (value, ctx) => {
        const threshold = parseInt(value, 10);
        return ctx.member.points > threshold;
    },
    // Member points < value
    'member.points_lt': (value, ctx) => {
        const threshold = parseInt(value, 10);
        return ctx.member.points < threshold;
    },
    // Member points >= value
    'member.points_gte': (value, ctx) => {
        const threshold = parseInt(value, 10);
        return ctx.member.points >= threshold;
    },
    // Member level equals value
    'member.level_eq': (value, ctx) => {
        return ctx.member.level === value;
    },
    // Member status equals value
    'member.status_eq': (value, ctx) => {
        return ctx.member.status === value;
    },
    // Member total spent > value
    'member.total_spent_gt': (value, ctx) => {
        const threshold = parseInt(value, 10);
        return ctx.member.totalSpent > threshold;
    },
    // Member created after X days ago
    'member.created_after_days': (value, ctx) => {
        const days = parseInt(value, 10);
        if (isNaN(days))
            return false;
        return (0, dateUtils_1.subDays)(new Date(), days) < ctx.member.createdAt;
    },
    // Always true (for testing)
    'member.always': () => true
};
// Evaluate a single condition
function evaluateCondition(conditionKey, operator, value, ctx) {
    const evaluator = evaluators[conditionKey];
    if (!evaluator) {
        console.warn(`Unknown condition key: ${conditionKey}`);
        return false;
    }
    const result = evaluator(value, ctx);
    // Handle operator negation for "not" operators
    if (operator === 'not_eq') {
        return !result;
    }
    return result;
}
// Find members matching campaign conditions
async function findMatchingMembers(storeId, conditions) {
    // For simple single-condition queries, build Prisma where clause
    // For complex AND/OR conditions, fetch all active members and filter in memory
    const members = await database_1.default.member.findMany({
        where: { storeId, status: 'active' },
        select: {
            id: true,
            name: true,
            phone: true,
            level: true,
            points: true,
            totalSpent: true,
            birthday: true,
            lastVisit: true,
            status: true,
            createdAt: true
        }
    });
    return members;
}
// Check if member matches all campaign conditions
function memberMatchesConditions(conditions, ctx) {
    if (!conditions.length)
        return false;
    let result = false;
    for (let i = 0; i < conditions.length; i++) {
        const cond = conditions[i];
        const condResult = evaluateCondition(cond.conditionKey, cond.operator, cond.value, ctx);
        if (i === 0) {
            result = condResult;
        }
        else {
            if (cond.logicalOperator === 'AND') {
                result = result && condResult;
            }
            else {
                result = result || condResult;
            }
        }
    }
    return result;
}
// Get all condition definitions (for UI)
function getConditionDefinitions() {
    return [
        {
            key: 'member.inactive_days',
            name: 'Inactive for X days',
            description: 'Member has not visited in X days',
            fieldType: 'number',
            operators: ['eq', 'gt', 'lt', 'gte', 'lte']
        },
        {
            key: 'member.birthday_today',
            name: 'Birthday is today',
            description: 'Member birthday is today',
            fieldType: 'boolean',
            operators: ['eq']
        },
        {
            key: 'member.points_gt',
            name: 'Points greater than',
            description: 'Member points is greater than X',
            fieldType: 'number',
            operators: ['eq', 'gt', 'lt', 'gte', 'lte']
        },
        {
            key: 'member.points_lt',
            name: 'Points less than',
            description: 'Member points is less than X',
            fieldType: 'number',
            operators: ['eq', 'gt', 'lt', 'gte', 'lte']
        },
        {
            key: 'member.points_gte',
            name: 'Points at least',
            description: 'Member points is at least X',
            fieldType: 'number',
            operators: ['eq', 'gt', 'lt', 'gte', 'lte']
        },
        {
            key: 'member.level_eq',
            name: 'Member level is',
            description: 'Member level equals X',
            fieldType: 'enum',
            operators: ['eq'],
            valueOptions: ['bronze', 'silver', 'gold', 'diamond']
        },
        {
            key: 'member.status_eq',
            name: 'Member status is',
            description: 'Member status equals X',
            fieldType: 'enum',
            operators: ['eq'],
            valueOptions: ['active', 'inactive', 'blocked']
        },
        {
            key: 'member.total_spent_gt',
            name: 'Total spent greater than',
            description: 'Member total spending is greater than X',
            fieldType: 'number',
            operators: ['eq', 'gt', 'lt', 'gte', 'lte']
        },
        {
            key: 'member.created_after_days',
            name: 'Member for at least X days',
            description: 'Member registered after X days ago',
            fieldType: 'number',
            operators: ['eq', 'gt', 'lt', 'gte', 'lte']
        }
    ];
}
//# sourceMappingURL=TriggerEngine.js.map