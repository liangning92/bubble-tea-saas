import re

with open('client-admin/src/i18n/index.ts') as f:
    lines = f.readlines()

# Find zh: line
zh_start = None
for i, line in enumerate(lines):
    if re.match(r'^ {2}zh:\s*\{', line):
        zh_start = i
        break

# Find en: line
en_start = None
for i, line in enumerate(lines):
    if re.match(r'^ {2}en:\s*\{', line):
        en_start = i
        break

print(f"zh starts at line {zh_start+1}, en starts at line {en_start+1}")

def extract_all_keys_recursive(lines, start, end):
    """Extract all key: 'value' pairs recursively from lines[start:end]"""
    keys = {}  # key -> (line_number, value)
    
    i = start
    while i < end:
        stripped = lines[i].strip()
        indent = len(lines[i]) - len(lines[i].lstrip())
        
        # Check for nested object
        if re.match(r"^([a-zA-Z0-9_]+):\s*\{", stripped):
            # This is a subsection - find its end
            subsection_name = re.match(r"^([a-zA-Z0-9_]+):\s*\{", stripped).group(1)
            subsection_depth = 0
            j = i
            while j < end:
                s = lines[j].strip()
                if '{' in s: subsection_depth += s.count('{')
                if '}' in s: subsection_depth -= s.count('}')
                j += 1
                if subsection_depth == 0:
                    break
            # Recurse into subsection
            sub_keys = extract_all_keys_recursive(lines, i+1, j)
            for k, v in sub_keys.items():
                keys[f"{subsection_name}.{k}"] = v
            i = j
        elif re.match(r"^([a-zA-Z0-9_]+):\s*'[^']*'", stripped) or re.match(r"^([a-zA-Z0-9_]+):\s*`[^`]*`", stripped) or re.match(r"^([a-zA-Z0-9_]+):\s*\"[^\"]*\"", stripped):
            # This is a key-value line
            colon_pos = stripped.index(':')
            key = stripped[:colon_pos].strip()
            # Get value
            value_part = stripped[colon_pos+1:].strip().rstrip(',').strip()
            if re.match(r'^[a-zA-Z0-9_]+$', key):
                keys[key] = (i+1, value_part)
            i += 1
        else:
            i += 1
    
    return keys

def extract_section_keys(lines, section_start_line):
    """Extract all keys from a section starting at section_start_line"""
    # Find the section end
    depth = 0
    end = section_start_line
    for i in range(section_start_line, min(section_start_line+5000, len(lines))):
        s = lines[i].strip()
        if s == '{':
            if i == section_start_line:
                depth = 1
            else:
                depth += 1
        elif s in ('}', '},'):
            depth -= 1
            if depth <= 0:
                end = i
                break
    
    # Extract keys recursively
    return extract_all_keys_recursive(lines, section_start_line+1, end)

# Find top-level sections at 6 spaces indent in en
print("\nFinding en sections...")
en_section_starts = {}
for i in range(en_start+1, en_start+10000):
    if i >= len(lines): break
    if re.match(r'^ {6}[a-zA-Z0-9_]+:\s*\{', lines[i]):
        name = lines[i].strip().split(':')[0]
        en_section_starts[name] = i

# Find top-level sections at 6 spaces indent in zh
print("Finding zh sections...")
zh_section_starts = {}
for i in range(zh_start+1, zh_start+10000):
    if i >= len(lines): break
    if re.match(r'^ {6}[a-zA-Z0-9_]+:\s*\{', lines[i]):
        name = lines[i].strip().split(':')[0]
        zh_section_starts[name] = i

print(f"en sections: {list(en_section_starts.keys())}")
print(f"zh sections: {list(zh_section_starts.keys())}")

# Extract keys for each section
print("\nComparing sections...")
for name in sorted(en_section_starts.keys()):
    en_keys_raw = extract_section_keys(lines, en_section_starts[name])
    en_keys = set(en_keys_raw.keys())
    
    if name in zh_section_starts:
        zh_keys_raw = extract_section_keys(lines, zh_section_starts[name])
        zh_keys = set(zh_keys_raw.keys())
    else:
        zh_keys = set()
    
    missing = en_keys - zh_keys
    if missing:
        print(f"\n{name}: MISSING {len(missing)} keys (en={len(en_keys)}, zh={len(zh_keys)})")
        for k in sorted(missing)[:5]:
            en_line, en_val = en_keys_raw[k]
            print(f"  {k}: en line {en_line} = '{en_val}'")
        if len(missing) > 5:
            print(f"  ... and {len(missing)-5} more")
    else:
        print(f"{name}: COMPLETE (en={len(en_keys)}, zh={len(zh_keys)})")
