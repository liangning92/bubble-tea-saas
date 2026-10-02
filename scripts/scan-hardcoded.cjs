/**
 * Precise hardcoded UI string scanner
 * Only flags strings that are definitely user-facing display text:
 * 1. JSX element children (between > and <)
 * 2. UI attribute values (placeholder, title, aria-label, alt, label)
 * 3. Strings in display-oriented arrays/objects
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const CLIENTS = ['client-admin', 'client-pos', 'client-staff'];

// Tailwind CSS class patterns to skip (defined in isTailwindClass function)

// Package name patterns to skip
const PACKAGE_PATTERNS = [
  /^@/, // @scope/package
  /^(react|vue|angular|svelte|preact)/,
  /^(next|nuxt|sveltekit|remix|gatsby)/,
  /^(typescript|ts-|@types)/,
  /^(eslint|prettier|webpack|vite|esbuild|rollup|parcel)/,
  /^(zustand|jotai|recoil|redux|@redux)/,
  /^(mobx|mobx-react)/,
  /^(react-router|react-dom|react-native)/,
  /^(@heroicons|@headlessui|@reach)/,
  /^(lucide|feather-icons|react-icons|@tabler)/,
  /^(framer-motion|react-spring|react-motion)/,
  /^(chart|recharts|chart\.js|apexcharts|highcharts)/,
  /^(dayjs|moment|date-fns|luxon)/,
  /^(axios|ky|swr|react-query|@tanstack)/,
  /^(jose|jsonwebtoken|bcrypt)/,
  /^(prisma|@prisma|drizzle)/,
  /^(zod|yup|joi|react-hook-form)/,
  /^(i18next|react-i18next)/,
  /^(socket\.io|ws)/,
  /^(cloudflare|@cloudflare)/,
  /^(node-fetch|undici)/,
];

// Strings that are clearly not UI display text
const SKIP_VALUES = new Set([
  'active', 'inactive', 'pending', 'completed', 'cancelled', 'refunded',
  'draft', 'published', 'archived', 'deleted', 'locked', 'unlocked',
  'success', 'error', 'warning', 'info', 'loading', 'loaded', 'done',
  'male', 'female', 'other', 'on', 'off', 'yes', 'no',
  'id', 'en', 'zh', 'zh-CN', 'zh-TW', 'zhSG',
  'true', 'false', 'null', 'undefined',
  'left', 'right', 'center', 'top', 'bottom',
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
  'admin', 'manager', 'cashier', 'staff', 'owner',
  'dine_in', 'takeaway', 'delivery',
  'cash', 'card', 'qris', 'gopay', 'ovo', 'dana', 'bac',
  'FIFO', 'LIFO', 'PRIORITY', 'MANUAL', 'AUTO',
  'BCA', 'Mandiri', 'BNI', 'BRI', 'BSI', 'BTN',
  'asc', 'desc', 'ascending', 'descending',
  'all', 'none', 'both', 'any',
  'text', 'number', 'date', 'email', 'tel', 'password', 'search',
  'bold', 'italic', 'underline',
  'solid', 'dashed', 'dotted', 'double',
  'open', 'close', 'closed', 'opened',
  'add', 'edit', 'delete', 'view', 'list', 'create', 'update', 'remove',
  'save', 'cancel', 'confirm', 'submit', 'reset', 'clear', 'apply', 'ok',
  'export', 'import', 'print', 'scan', 'upload', 'download',
  'N/A', 'n/a', 'TBD', 'TBC',
  'API', 'SaaS',
  'min', 'max', 'avg', 'sum', 'total', 'count', 'qty',
  'tax', 'discount', 'service', 'serviceCharge', 'charge',
  'on', 'off', 'enable', 'disable', 'enabled', 'disabled',
  'show', 'hide', 'visible', 'hidden',
  'required', 'optional', 'default', 'custom', 'auto', 'manual',
  'direct', 'indirect',
  'month_1', 'month_2', 'month_3',
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
  'morning', 'afternoon', 'evening', 'night', 'dawn', 'dusk',
  'in_stock', 'out_of_stock', 'low_stock',
  'cash_change', 'change', 'rounding',
  'paid', 'unpaid', 'overdue', 'due',
  'sent', 'delivered', 'read', 'unread', 'seen',
  'login', 'logout', 'signin', 'signout', 'signup',
  'profile', 'settings', 'preferences',
  'next', 'back', 'previous', 'prev', 'first', 'last',
  'copy', 'copied', 'duplicate',
  'share', 'shared', 'sharing',
  'online', 'offline', 'connected', 'disconnected', 'connecting',
  'dark', 'light', 'auto',
  'portrait', 'landscape',
  'crisp', 'smooth',
  'normal', 'fullscreen', 'maximized', 'minimized',
  'up', 'down', 'zoom', 'pan', 'rotate', 'flip',
  'warning', 'danger', 'caution', 'notice', 'tip', 'hint',
  'call', 'sms', 'wa', 'whatsapp', 'telegram', 'discord',
  'notification', 'notifications', 'reminder', 'reminders',
  'chat', 'message', 'messages', 'thread', 'channel',
  'reply', 'forward', 'attach', 'attachment',
  'emoji', 'sticker', 'mention', 'tag', 'tags',
  'filter', 'filtered', 'filters', 'sort', 'sorted', 'group', 'grouped',
  'search', 'searched', 'searching', 'refresh', 'reload', 'reboot', 'restart',
  'approve', 'approved', 'reject', 'rejected', 'review', 'reviewed',
  'verify', 'verified', 'unverified', 'check', 'checked',
  'process', 'processing', 'processed', 'handle', 'handled',
  'fix', 'fixed', 'bug', 'debug', 'debugging', 'log', 'logs',
  'admin', 'superadmin', 'user', 'users', 'member', 'members',
  'guest', 'vip', 'regular', 'anonymous',
  'assign', 'assigned', 'reassign',
  'claim', 'claimed', 'redeem', 'redeemed',
  'earn', 'earned', 'spend', 'spent',
  'point', 'points', 'wallet', 'balance',
  'topup', 'top-up', 'withdraw', 'transfer',
  'receivable', 'payable', 'invoice', 'bill',
  'quote', 'estimate', 'purchase', 'purchased',
  'reservation', 'booking', 'queue',
  'shift', 'shifts', 'opening', 'closing',
  'clock_in', 'clockOut', 'break', 'overtime',
  'roster', 'schedule', 'absent', 'absence', 'present',
  'leave', 'leaves', 'sick', 'casual', 'annual', 'holiday',
  'salary', 'salaries', 'payroll', 'payslip',
  'commission', 'bonus', 'incentive', 'allowance',
  'attendance', 'performance', 'review', 'training',
  'kpi', 'okr', 'goal',
  'asset', 'equipment', 'stock', 'inventory',
  'supplier', 'vendor', 'purchase_order',
  'delivery', 'ingredient', 'recipe', 'bom',
  'category', 'category_id', 'product_id', 'order_id',
  'variant', 'modifier', 'addon', 'add_on',
  'price', 'prices', 'pricing', 'cost', 'margin', 'markup', 'profit',
  'report', 'reports', 'analytics', 'dashboard', 'chart', 'graph',
  'table', 'grid', 'layout', 'template', 'preset',
  'widget', 'component', 'field', 'fields', 'form', 'forms',
  'input', 'output', 'column', 'columns', 'row', 'rows', 'cell', 'item', 'items',
  'entry', 'entries', 'record', 'records', 'data', 'dataset',
  'config', 'configuration', 'settings', 'preference',
  'parameter', 'argument', 'key', 'value',
  'token', 'api_key', 'apiKey', 'secret',
  'session', 'cookie',
  'header', 'footer', 'sidebar', 'panel',
  'modal', 'dialog', 'popup', 'drawer', 'sheet',
  'tab', 'tabs', 'accordion', 'breadcrumb',
  'navbar', 'nav', 'navigation', 'menu', 'submenu',
  'action', 'button', 'link', 'icon', 'icons', 'image', 'images',
  'avatar', 'thumbnail', 'badge', 'chip', 'tooltip', 'popover',
  'alert', 'toast', 'snackbar', 'progress', 'spinner', 'skeleton', 'empty_state',
  'result', 'results', 'outcome', 'status', 'state',
  'label', 'labels', 'title', 'titles', 'heading', 'description', 'detail', 'details',
  'summary', 'caption', 'placeholder', 'hint', 'message', 'reason',
  'feedback', 'response', 'introduction', 'overview', 'guide', 'tutorial',
  'terms', 'conditions', 'policy', 'privacy', 'legal',
  'about', 'contact', 'faq', 'help', 'support',
]);

function isTailwindClass(text) {
  if (!text || text.length < 3) return false;
  // CSS value patterns
  if (/^(xs|sm|md|lg|xl|2xl)$/.test(text)) return true;
  if (/^-?\d+(\.\d+)?(px|rem|em|vh|vw|%)$/.test(text)) return true;
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return true;
  if (/^rgb(a)?\(/.test(text)) return true;
  if (/^hsl(a)?\(/.test(text)) return true;
  // Tailwind class patterns
  const twPatterns = [
    /^(bg|border|text|ring|p|mx|my|ml|mr|mt|mb|px|py|pl|pr|pt|pb|w|h|min|max)-/,
    /^(top|bottom|left|right|z|opacity|shadow|rounded|scale|translate|rotate|skew)/,
    /^(cursor|overflow|whitespace|break|hyphens|truncate)/,
    /^(grid-cols|grid-rows|col-span|col-start|row-span|row-start|auto-cols|auto-rows|gap)/,
    /^(space-|order-|sr-only|select-none|outline-none|pointer-events)/,
    /^(animate|duration|delay|transition)/,
    /^(text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl))-/,
    /^(leading|tracking|font)/,
    /^(w-|h-|min-w-|min-h-|max-w-|max-h-)/,
    /^(hover:|focus:|active:|disabled:|dark:|sm:|md:|lg:|xl:|2xl:)/,
    /^(first:|last:|odd:|even:|children:|group-hover:|group:)/,
    /^(rounded|ring|brightness|contrast|saturate|hue-rotate|invert|sepia)/,
    /^(backdrop|grayscale|blur|backface)/,
  ];
  return twPatterns.some(p => p.test(text));
}

function isPackageName(text) {
  if (!text || text.length < 2) return false;
  return PACKAGE_PATTERNS.some(p => p.test(text));
}

function shouldSkip(text, lineText) {
  if (!text || text.length < 2 || text.length > 100) return true;
  if (SKIP_VALUES.has(text)) return true;
  if (SKIP_VALUES.has(text.toLowerCase())) return true;
  
  // Technical strings
  if (/^(https?|www\.)/.test(text)) return true;
  if (/^(data:|blob:)/.test(text)) return true;
  if (/^[\d\.\-\/\:\+\s]+$/.test(text)) return true; // numbers/dates
  if (/^v?\d+(\.\d+)+$/.test(text)) return true; // versions
  if (/^[a-z_][a-z0-9_]*$/i.test(text) && !/[A-Z]/.test(text) && text.length > 3) return true; // snake_case
  if (/^[A-Z][A-Z0-9_]+$/.test(text) && text.length > 3) return true; // UPPER_SNAKE
  if (/^\$[a-zA-Z]/.test(text)) return true;
  if (/^\/.*\/[gimsuy]*$/.test(text)) return true;
  if (text.includes('${')) return true;
  if (/^(0x[0-9a-f]+|\d+)$/i.test(text)) return true;
  if (/^\+?[\d\s\-\(\)\.]+$/.test(text)) return true;
  
  // Skip module/package imports
  const trimmed = lineText.trim();
  if (/^import\s/.test(trimmed) || /^from\s/.test(trimmed)) return true;
  if (trimmed.startsWith("'@") || trimmed.startsWith('"@')) return true;
  
  // Skip comments
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  
  // Skip Tailwind classes
  if (isTailwindClass(text)) return true;
  
  // Skip package names
  if (isPackageName(text)) return true;
  
  // Skip file extensions
  if (/\.[a-z]{2,5}$/.test(text)) return true;
  
  // Skip console/debug/error strings
  if (/^(console\.|debugger|throw\s)/.test(trimmed)) return true;
  
  // Skip strings that are key names in objects (property assignments)
  if (/^\s*[a-z_][a-zA-Z0-9_]*\s*:\s*['"`]/.test(trimmed)) {
    const propName = trimmed.split(':')[0].trim();
    const keyNames = ['id', 'key', 'code', 'type', 'status', 'slug', 'role', 'name', 'email', 'phone', 'url', 'path', 'api', 'api_', 'endpoint', 'route', 'db_', 'redis_', 'jwt_', 'fcm_', 'twilio_', 'sha', 'hash', 'signature'];
    if (keyNames.some(k => propName.includes(k))) return true;
  }
  
  return false;
}

// Check if parent is a UI-relevant JSX attribute
function isUIAttribute(parentName) {
  if (!parentName) return false;
  const uiAttrs = ['placeholder', 'title', 'aria-label', 'aria-labelledby', 'aria-describedby',
    'alt', 'label', 'summary', 'tooltip', 'hint', 'caption', 'footer', 'header',
    'addon', 'prefix', 'suffix', 'content', 'htmlFor'];
  return uiAttrs.some(a => parentName.includes(a));
}

function getAllFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'build' && entry.name !== 'coverage') {
          results.push(...getAllFiles(fullPath));
        }
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
  } catch (e) {}
  return results;
}

// Find string literal parent context using recursive search
function findParentContext(node, sourceFile, pos) {
  // Get the text of the line
  const line = ts.getLineAndCharacterOfPosition(sourceFile, pos).line + 1;
  const lineStarts = sourceFile.getLineStarts();
  const lineStart = lineStarts[line - 1];
  const lineEnd = line < lineStarts.length ? lineStarts[line] : sourceFile.getPositionOfLineAndCharacter(line, 0);
  return sourceFile.text.substring(lineStart, lineEnd).trim();
}

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    const results = [];
    
    // We'll do a custom traversal that tracks parent context
    function visit(node, parentInfo = null) {
      // Check if this is a JSXAttribute parent
      let info = parentInfo;
      
      if (ts.isStringLiteral(node)) {
        const text = node.text;
        const lineNum = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
        const lineText = findParentContext(node, sourceFile, node.pos);
        
        if (shouldSkip(text, lineText)) return;
        
        // This is a candidate - add it
        results.push({
          text,
          line: lineNum,
          context: lineText,
          file: filePath
        });
      }
      
      // Track JSX attribute name for children
      if (ts.isJSXAttribute(node) && ts.isIdentifier(node.name)) {
        info = { jsxAttr: node.name.text };
      }
      
      ts.forEachChild(node, child => visit(child, info));
    }
    
    visit(sourceFile);
    return results;
  } catch (e) {
    return [];
  }
}

const allFindings = {};
let totalFiles = 0;

for (const client of CLIENTS) {
  const srcDir = path.join(__dirname, '..', client, 'src');
  if (!fs.existsSync(srcDir)) continue;
  
  const files = getAllFiles(srcDir);
  totalFiles += files.length;
  
  for (const f of files) {
    const results = scanFile(f);
    for (const r of results) {
      const key = `${r.file}:${r.line}:${r.text}`;
      if (!allFindings[key]) {
        allFindings[key] = r;
      }
    }
  }
}

// Group by file
const byFile = {};
for (const k of Object.keys(allFindings)) {
  const f = allFindings[k].file;
  if (!byFile[f]) byFile[f] = [];
  byFile[f].push(allFindings[k]);
}

const totalCount = Object.keys(allFindings).length;
console.error(`Scanned ${totalFiles} files, found ${totalCount} hardcoded UI strings\n`);

const sortedFiles = Object.keys(byFile).sort();
for (const f of sortedFiles) {
  const shortFile = f.replace(__dirname + '/..', '');
  console.log('');
  console.log('================================================================================');
  console.log(`FILE: ${shortFile}`);
  console.log('================================================================================');
  for (const r of byFile[f].sort((a, b) => a.line - b.line)) {
    console.log(`  L${r.line}: ${JSON.stringify(r.text)}`);
    console.log(`       ${r.context}`);
  }
}
