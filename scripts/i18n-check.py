#!/usr/bin/env python3
"""
i18n 完整检查脚本
检查三类问题:
1. 默认语言/fallbackLng 配置
2. zh 缺失的 key (对比 en)
3. zh 值语言质量（zh locale 含非中文字符）
"""

import re, json, sys
from pathlib import Path

I18N_FILE = Path("client-admin/src/i18n/index.ts")

# ============ 检查1: 默认语言 ============
def check_default_language(content):
    print("【检查1】默认语言配置")
    
    # Find getInitialLanguage
    init_match = re.search(r"return\s+'(\w)'", content)
    if init_match:
        default_lang = init_match.group(1)
        print(f"  getInitialLanguage() 默认: '{default_lang}'")
        if default_lang == 'zh':
            print("  ✅ 默认语言正确 (zh)")
        else:
            print(f"  ❌ 默认语言错误，应为 'zh'，当前为 '{default_lang}'")
    else:
        print("  ⚠️ 未找到 getInitialLanguage")
    
    fb_match = re.search(r"fallbackLng:\s*'(\w)'", content)
    if fb_match:
        fb = fb_match.group(1)
        print(f"  fallbackLng: '{fb}'")
        if fb == 'en':
            print("  ✅ fallbackLng 正确 (en)")
        elif fb == 'id':
            print("  ⚠️ fallbackLng 为 'id'，缺失 key 会 fallback 到印尼语")
        else:
            print(f"  fallbackLng 为 '{fb}'")

# ============ 检查2: 递归提取所有 key ============
def extract_all_keys(text):
    """递归提取所有 key-value 对，用 brace depth 追踪"""
    keys = {}
    stack = []  # (indent, key_name) stack
    lines = text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i]
        indent = len(line) - len(line.lstrip())
        stripped = line.strip()
        
        if not stripped or stripped.startswith('//'):
            i += 1
            continue
        
        if stripped == '},' or stripped == '}':
            # End of object, pop until indent
            while stack and stack[-1][0] >= indent:
                stack.pop()
            i += 1
            continue
        
        if ':' in stripped:
            colon_idx = stripped.index(':')
            key = stripped[:colon_idx].strip().strip("'\"")
            value = stripped[colon_idx+1:].strip().rstrip(',').strip()
            
            if key:
                full_key = '.'.join(s[1] for s in stack) + ('.' if stack else '') + key
                
                if value == '{':
                    # Start of nested object
                    stack.append((indent, key))
                elif value:
                    # Key-value pair
                    val = value.strip("'\"")
                    keys[full_key] = val
        
        i += 1
    
    return keys

def get_locale_section(content, locale_name):
    """Get the content of a specific locale section"""
    # Find the locale start: "locale: { translation: {"
    pattern = locale_name + r":\s*\{\s*translation:\s*\{"
    m = re.search(pattern, content)
    if not m:
        return ""
    
    start = m.end()
    depth = 1
    pos = start
    
    while pos < len(content) and depth > 0:
        if content[pos] == '{':
            depth += 1
        elif content[pos] == '}':
            depth -= 1
        pos += 1
    
    return content[start:pos-1]

# ============ 检查3: 语言质量 ============
def check_language_quality(zh_keys):
    print("\n【检查3】zh 值语言质量（含有非中文字符的值）")
    
    # Acceptable Latin-only values
    ACCEPTABLE_PATTERNS = [
        r'^[A-Z][a-z]+[A-Z]',  # Brand names: GoFood, GrabFood
        r'^YOUME', r'^TikTok', r'^WhatsApp', r'^Tokopedia', r'^Shopee',
        r'^https?://', r'^www\.',  # URLs
        r'^0\d[\d\s\-]+', r'^\d{8,}',  # Phone numbers, IDs
        r'^[A-Z]+$',  # All caps acronyms: API, URL, SMS
        r'^\d+\.\d+$', r'^[A-Za-z0-9\s\.,\-_@]+$',  # Numeric/mixed values
        r'^(OK|Yes|No|Yes|No)$',  # Common words
        r'\d{4}',  # Years like 2026
    ]
    
    suspicious = []
    for key, value in sorted(zh_keys.items()):
        if not isinstance(value, str) or len(value) < 2:
            continue
        
        has_latin = bool(re.search(r'[a-zA-Z]{3,}', value))
        has_cjk = bool(re.search(r'[\u4e00-\u9fff]', value))
        
        if has_latin and not has_cjk:
            # Check if acceptable
            is_acceptable = False
            for pattern in ACCEPTABLE_PATTERNS:
                if re.match(pattern, value):
                    is_acceptable = True
                    break
            
            if not is_acceptable:
                suspicious.append((key, value))
    
    print(f"  可疑值数量: {len(suspicious)}")
    for key, val in suspicious[:15]:
        print(f"    zh.{key} = '{val[:60]}'")
    if len(suspicious) > 15:
        print(f"    ... 还有 {len(suspicious)-15} 个")
    
    if not suspicious:
        print("  ✅ 无明显语言错误")

# ============ 主函数 ============
def main():
    print("=== i18n 完整检查 ===")
    print(f"文件: {I18N_FILE}")
    print()
    
    content = I18N_FILE.read_text()
    
    # 检查1
    check_default_language(content)
    
    # 提取三个 locale 的 key
    print("\n【检查2】递归对比 en vs zh 所有嵌套 key")
    
    en_text = get_locale_section(content, 'en')
    zh_text = get_locale_section(content, 'zh')
    
    en_keys = extract_all_keys(en_text)
    zh_keys = extract_all_keys(zh_text)
    
    print(f"  en 总 key 数: {len(en_keys)}")
    print(f"  zh 总 key 数: {len(zh_keys)}")
    
    # Missing in zh (en has, zh doesn't)
    en_key_set = set(en_keys.keys())
    zh_key_set = set(zh_keys.keys())
    missing = en_key_set - zh_key_set
    
    print(f"  en 有 zh 没有的 key: {len(missing)}")
    
    if missing:
        # Group by section
        by_section = {}
        for k in sorted(missing):
            parts = k.split('.')
            section = parts[1] if len(parts) > 1 else parts[0]
            by_section.setdefault(section, []).append((k, en_keys.get(k, '')))
        
        print()
        for section, keys_vals in sorted(by_section.items()):
            print(f"    {section}: {len(keys_vals)} keys")
            for k, v in sorted(keys_vals)[:3]:
                print(f"      - {k}: '{v}'")
            if len(keys_vals) > 3:
                print(f"      ... 还有 {len(keys_vals)-3} 个")
    
    # 语言质量
    check_language_quality(zh_keys)
    
    # 写入报告
    report = {
        'en_key_count': len(en_keys),
        'zh_key_count': len(zh_keys),
        'missing_in_zh': sorted(en_key_set - zh_key_set),
        'default_lang_correct': 'zh' in content[content.find('return'):content.find('return')+50],
    }
    
    with open('i18n-report.json', 'w') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"\n报告已写入: i18n-report.json")

if __name__ == '__main__':
    main()
