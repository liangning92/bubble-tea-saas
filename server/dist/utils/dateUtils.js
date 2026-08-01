"use strict";
// Date utility functions
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOfDay = startOfDay;
exports.startOfTodayJakarta = startOfTodayJakarta;
exports.endOfDay = endOfDay;
exports.startOfWeek = startOfWeek;
exports.endOfWeek = endOfWeek;
exports.startOfMonth = startOfMonth;
exports.endOfMonth = endOfMonth;
exports.addDays = addDays;
exports.subDays = subDays;
exports.addMonths = addMonths;
exports.subMonths = subMonths;
exports.formatDate = formatDate;
exports.getWeekNumber = getWeekNumber;
exports.isSameDay = isSameDay;
exports.isToday = isToday;
exports.getTimeRangeLabel = getTimeRangeLabel;
exports.isHoliday = isHoliday;
exports.isRamadan = isRamadan;
exports.isFriday = isFriday;
function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}
/**
 * Get start of today in Asia/Jakarta (WIB, UTC+7) timezone
 * This ensures consistent "today" calculation regardless of server timezone
 * Used for POS cash management, shift reports, etc.
 */
function startOfTodayJakarta() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const getPart = (type) => parseInt(parts.find(p => p.type === type)?.value || '1');
    const year = getPart('year');
    const month = getPart('month') - 1; // JS months are 0-indexed
    const day = getPart('day');
    const today = new Date(0);
    today.setFullYear(year, month, day);
    today.setHours(0, 0, 0, 0);
    return today;
}
function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}
function startOfWeek(date, startDay = 1) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day < startDay ? 7 : 0) + day - startDay;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
}
function endOfWeek(date, startDay = 1) {
    const d = startOfWeek(date, startDay);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
}
function startOfMonth(date) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}
function endOfMonth(date) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
}
function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}
function subDays(date, days) {
    return addDays(date, -days);
}
function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}
function subMonths(date, months) {
    return addMonths(date, -months);
}
function formatDate(date, format = 'YYYY-MM-DD') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return format
        .replace('YYYY', String(year))
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function isSameDay(date1, date2) {
    return (date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate());
}
function isToday(date) {
    return isSameDay(date, new Date());
}
function getTimeRangeLabel(start, end) {
    if (isSameDay(start, end)) {
        return formatDate(start, 'YYYY-MM-DD');
    }
    return `${formatDate(start, 'YYYY-MM-DD')} to ${formatDate(end, 'YYYY-MM-DD')}`;
}
// Indonesian holidays (simplified)
const INDONESIAN_HOLIDAYS = [
    { name: 'Tahun Baru', month: 0, day: 1 },
    { name: 'Hari Raya Nyepi', month: 2, day: 11 },
    { name: 'Hari Kemerdekaan Indonesia', month: 7, day: 17 },
    { name: 'Natal', month: 11, day: 25 }
];
function isHoliday(date) {
    const holiday = INDONESIAN_HOLIDAYS.find(h => h.month === date.getMonth() && h.day === date.getDate());
    return holiday ? { isHoliday: true, name: holiday.name } : { isHoliday: false };
}
// Ramadan dates (approximate - actual dates vary)
function getApproximateRamadan(year) {
    // Ramadan moves back ~11 days each year
    // 2024: March 11 - April 9
    // 2025: Feb 28 - March 30
    // 2026: Feb 17 - March 18
    const baseYear = 2024;
    const baseStart = new Date(baseYear, 2, 11);
    const daysDiff = Math.floor((year - baseYear) * 354.37 / 365.25 * 365.25) - Math.floor((year - baseYear) * 11);
    const start = new Date(baseStart.getTime() - daysDiff * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 29 * 24 * 60 * 60 * 1000);
    return { start, end };
}
function isRamadan(date) {
    const ramadan = getApproximateRamadan(date.getFullYear());
    return date >= ramadan.start && date <= ramadan.end;
}
function isFriday(date) {
    return date.getDay() === 5; // Friday
}
//# sourceMappingURL=dateUtils.js.map