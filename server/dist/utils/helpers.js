"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCurrency = formatCurrency;
exports.parseCurrency = parseCurrency;
exports.formatDate = formatDate;
exports.formatTime = formatTime;
exports.formatDateTime = formatDateTime;
exports.getDayRange = getDayRange;
exports.getMonthRange = getMonthRange;
exports.generateOrderNumber = generateOrderNumber;
exports.generateEmployeeNumber = generateEmployeeNumber;
exports.validatePhone = validatePhone;
exports.formatPhone = formatPhone;
exports.calculatePPN = calculatePPN;
exports.calculateTotalWithTax = calculateTotalWithTax;
exports.paginate = paginate;
exports.successResponse = successResponse;
exports.createdResponse = createdResponse;
exports.percentageChange = percentageChange;
exports.debounce = debounce;
// Format currency to IDR
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}
// Parse currency string to number (in cents)
function parseCurrency(amount) {
    if (typeof amount === 'number')
        return amount;
    const cleaned = amount.replace(/[^\d.-]/g, '');
    return Math.round(parseFloat(cleaned));
}
// Format date to ISO
function formatDate(date, locale = 'id-ID') {
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}
// Format time to locale string
function formatTime(date, locale = 'id-ID') {
    return new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}
// Format datetime to locale string
function formatDateTime(date, locale = 'id-ID') {
    return `${formatDate(date, locale)} ${formatTime(date, locale)}`;
}
// Get start and end of day
function getDayRange(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}
// Get start and end of month
function getMonthRange(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}
// Generate order number
function generateOrderNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${dateStr}-${random}`;
}
// Generate employee number
function generateEmployeeNumber() {
    const year = new Date().getFullYear();
    const random = Math.random().toString().substring(2, 6);
    return `EMP${year}${random}`;
}
// Validate phone number (Indonesian format)
function validatePhone(phone) {
    const cleaned = phone.replace(/[^\d]/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}
// Format phone number for display
function formatPhone(phone) {
    const cleaned = phone.replace(/[^\d]/g, '');
    if (cleaned.startsWith('0')) {
        return `+62 ${cleaned.slice(1)}`;
    }
    return phone;
}
// Calculate PPN (Indonesian tax)
function calculatePPN(amount, rate = 0.11) {
    return Math.round(amount * rate);
}
// Calculate total with PPN
function calculateTotalWithTax(amount, taxRate = 0.11) {
    const tax = calculatePPN(amount, taxRate);
    return {
        subtotal: amount,
        tax,
        total: amount + tax
    };
}
// Pagination helper
function paginate(page, pageSize) {
    const skip = (page - 1) * pageSize;
    return { skip, take: pageSize };
}
// Response wrapper
function successResponse(data, message = 'Success') {
    return {
        code: 200,
        message,
        data,
        timestamp: new Date().toISOString()
    };
}
function createdResponse(data, message = 'Created') {
    return {
        code: 201,
        message,
        data,
        timestamp: new Date().toISOString()
    };
}
// Calculate percentage
function percentageChange(current, previous) {
    if (previous === 0)
        return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}
// Debounce function
function debounce(func, wait) {
    let timeout = null;
    return (...args) => {
        if (timeout)
            clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
//# sourceMappingURL=helpers.js.map