#!/bin/bash
# i18n 完整检查脚本
# 检查三类问题：缺失key、语言质量、默认语言配置

set -e

I18N_FILE="client-admin/src/i18n/index.ts"
OUTPUT_JSON="i18n-report.json"

echo "=== i18n 完整检查 ==="
echo "文件: $I18N_FILE"
echo ""

# 检查1: 默认语言
echo "【检查1】默认语言配置"
DEFAULT_LANG=$(grep -o "return '[a-z][a-z]'" "$I18N_FILE" | head -1 | grep -o '[a-z][a-z]')
FALLBACK=$(grep -o "fallbackLng:[ ]*'[a-z][a-z]'" "$I18N_FILE" | grep -o '[a-z][a-z]')
echo "  getInitialLanguage() 默认: '$DEFAULT_LANG'"
echo "  fallbackLng: '$FALLBACK'"
if [ "$DEFAULT_LANG" = "zh" ]; then
    echo "  ✅ 默认语言正确"
else
    echo "  ❌ 默认语言错误，应为 'zh'"
fi
echo ""

# 检查2: 用 Python 做完整的 key 递归对比 + 语言质量分析
echo "【检查2】递归对比 en vs zh 所有嵌套 key"
python3 << 'PYEOF'
import re, json, sys

with open('client-admin/src/i18n/index.ts', 'r') as f:
    content = f.read()

def extract_all_keys(text, section_name):
    """递归提取所有嵌套 key，区分层级"""
    result = {}
    lines = text.split('\n')
    stack = [{'indent': -1, 'key': section_name, 'children': {}}]
    
    for line in lines:
        if not line.strip() or line.strip().startswith('//'):
            continue
        indent = len(line) - len(line.lstrip())
        content_stripped = line.strip()
        
        if content_stripped == '},':
            # End of object
            while stack and stack[-1]['indent'] >= indent:
                stack.pop()
            continue
        
        if ':' in content_stripped and not content_stripped.startswith('{'):
            parts = content_stripped.split(':', 1)
            key = parts[0].strip().strip("'\"")
            value_part = parts[1].strip().rstrip(',').strip()
            
            if value_part == '{':
                # New section
                new_section = {'indent': indent, 'key': key, 'children': {}, 'values': {}}
                stack[-1]['children'][key] = new_section
                stack.append(new_section)
            elif key and not value_part.startswith('{'):
                # Key-value pair
                value = value_part.strip("'\"")
                full_key = '.'.join(s['key'] for s in stack) + '.' + key
                result[full_key] = value
    
    return result

# Find each locale
locale_pattern = re.compile(r"(\w+):\s*\{\s*translation:\s*\{")
locale_sections = {}
for m in locale_pattern.finditer(content):
    locale = m.group(1)
    locale_sections[locale] = m.start()

en_start = locale_sections.get('en', 0)
id_start = locale_sections.get('id', 0)
zh_start = locale_sections.get('zh', 0)

# Extract keys for each locale (simplified - extract top-level section keys)
def get_locale_keys(content, start_pos):
    """Get all keys from a locale section"""
    keys = {}
    depth = 0
    in_translation = False
    section_stack = []
    i = start_pos
    
    while i < len(content) and i < start_pos + 500000:
        c = content[i]
        
        if content[i:i+15] == 'translation: {':
            in_translation = True
            i += 15
            continue
        
        if not in_translation:
            i += 1
            continue
        
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                break
            if section_stack and depth == section_stack[-1][1]:
                section_stack.pop()
        elif c == '\n':
            # Read a line
            line_end = content.find('\n', i)
            if line_end == -1:
                break
            line = content[i:line_end].strip()
            i = line_end + 1
            
            if not line or line.startswith('//'):
                continue
            
            if ':' in line:
                parts = line.split(':', 1)
                key = parts[0].strip().strip("'\"")
                value_part = parts[1].strip().rstrip(',')
                
                if not key:
                    continue
                
                if value_part == '{':
                    # New section
                    section_stack.append((key, depth))
                    full_key = '.'.join(s[0] for s in section_stack) if section_stack else key
                    keys[full_key] = {}
                elif value_part:
                    full_key = '.'.join(s[0] for s in section_stack) + '.' + key if section_stack else key
                    value = value_part.strip("'\"")
                    keys[full_key] = value
            continue
        i += 1
    
    return keys

en_keys = get_locale_keys(content, en_start)
id_keys = get_locale_keys(content, id_start)
zh_keys = get_locale_keys(content, zh_start)

print(f"  en keys: {len(en_keys)}")
print(f"  id keys: {len(id_keys)}")
print(f"  zh keys: {len(zh_keys)}")
print()

# Find missing in zh
en_only = set(en_keys.keys()) - set(zh_keys.keys())
print(f"  en 有 zh 没有的 key: {len(en_only)}")
if en_only:
    by_section = {}
    for k in sorted(en_only):
        section = k.split('.')[1] if '.' in k else k
        by_section.setdefault(section, []).append(k)
    for section, keys in sorted(by_section.items()):
        print(f"    {section}: {len(keys)} keys")
        for k in sorted(keys)[:3]:
            print(f"      - {k}: '{en_keys[k]}'")
        if len(keys) > 3:
            print(f"      ... and {len(keys)-3} more")

# Language quality: check zh values that are Latin-only (suspicious)
print()
print("【检查3】zh 值语言质量（zh locale 含有 Latin 而非 CJK）")
suspicious_values = []
# Known acceptable Latin-only values
ACCEPTABLE = {
    'YOUME', 'GoFood', 'GrabFood', 'ShopeeFood', 'Tokopedia', 'TikTok Shop',
    'WhatsApp', 'Whatsapp', 'Telegram', 'SMS', 'LINE', 'WeChat', 'API',
    'http', 'https', 'www', 'com', 'io', 'app', 'id', 'en', 'zh',
    'admin', 'staff', 'POS', 'B2B', 'B2C', 'SaaS', 'PDF', 'PNG', 'JPG', 'JPEG',
    'CSV', 'Excel', 'JSON', 'XML', 'HTML', 'CSS', 'JS', 'URL', 'IP', 'localhost',
    'admin123', 'password', 'pin', 'code', 'ok', 'id', 'en', 'zh',
    '08xxxxxxxxxx', '12.34', '10.5', '0.0', 'null', 'undefined',
    '2026', '2025', '2024',
    'BOM', 'FIFO', 'LIFO', 'POS', 'KDS', 'CRM', 'ERP', 'HRM',
}

for key, value in sorted(zh_keys.items()):
    if not isinstance(value, str) or len(value) < 2:
        continue
    # Has Latin letters
    if re.search(r'[a-zA-Z]{3,}', value):
        # No CJK characters
        if not re.search(r'[\u4e00-\u9fff]', value):
            # Not in acceptable list
            if value not in ACCEPTABLE and not any(acc in value for acc in ACCEPTABLE):
                # Check if it's a brand/product name (capitalized words)
                if not re.match(r'^[A-Z][a-z]+[A-Z]', value) and value != value.upper():
                    suspicious_values.append((key, value))

print(f"  可疑值数量: {len(suspicious_values)}")
for key, val in suspicious_values[:10]:
    print(f"    zh.{key} = '{val[:60]}'")
if len(suspicious_values) > 10:
    print(f"    ... and {len(suspicious_values)-10} more")

if len(en_only) == 0 and len(suspicious_values) == 0:
    print("  ✅ 无问题")

# Write summary to JSON
report = {
    'default_lang': DEFAULT_LANG if 'DEFAULT_LANG' in dir() else None,
    'fallback': FALLBACK if 'FALLBACK' in dir() else None,
    'en_keys': len(en_keys),
    'zh_keys': len(zh_keys),
    'missing_in_zh': sorted(en_only),
    'suspicious_values': [(k, v) for k, v in suspicious_values],
}

with open('i18n-report.json', 'w') as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
print()
print(f"报告已写入: i18n-report.json")

PYEOF

echo ""
echo "=== 检查完成 ==="
