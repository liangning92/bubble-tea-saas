import re
import json
import os

with open('client-admin/src/i18n/index.ts', 'r', encoding='utf-8') as f:
    text = f.read()

start = text.find('const resources =')
assert start != -1
res_start = text.find('{', start)
brace_count = 0
in_string = False
escape = False
res_end = -1

for i in range(res_start, len(text)):
    ch = text[i]
    if escape:
        escape = False
        continue
    if ch == '\\':
        escape = True
        continue
    if ch == '"':
        in_string = not in_string
        continue
    if not in_string:
        if ch == '{':
            brace_count += 1
        elif ch == '}':
            brace_count -= 1
            if brace_count == 0:
                res_end = i + 1
                break

json_text = text[res_start:res_end]
data = json.loads(json_text)

id_trans = data.get('id', {}).get('translation', {})
en_trans = data.get('en', {}).get('translation', {})
zh_trans = data.get('zh', {}).get('translation', {})

def flatten(d, prefix=''):
    items = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            items.update(flatten(v, key))
        else:
            items[key] = v
    return items

id_flat = flatten(id_trans)
en_flat = flatten(en_trans)
zh_flat = flatten(zh_trans)

print("=== ALL 36 KEYS MISSING IN ZH ===")
missing_in_zh = [k for k in id_flat if k not in zh_flat]
for k in missing_in_zh:
    print(f"Key: {k}")
    print(f"  ID: {id_flat.get(k)}")
    print(f"  EN: {en_flat.get(k, 'N/A')}")

print("\n=== ALL NON-CHINESE VALUES IN ZH ===")
for k, v in zh_flat.items():
    if isinstance(v, str):
        if not re.search(r'[\u4e00-\u9fff]', v):
            if len(v.strip()) > 1 and not re.match(r'^[0-9\s.,:\/\-_%€$¥#@!?*()+=]+$', v.strip()):
                print(f"{k} => {repr(v)} (ID: {repr(id_flat.get(k))}, EN: {repr(en_flat.get(k))})")

print("\n=== SCANNING TSX FILES FOR HARDCODED INDONESIAN / ENGLISH IN JSX ===")
# Common Indonesian words that might appear hardcoded
id_words = [
    'Pengaturan', 'Toko', 'Struk', 'Kasir', 'Simpan', 'Batal', 'Hapus',
    'Kelola', 'Terkonfigurasi', 'Layar', 'Perangkat', 'Pelanggan', 'Tambah',
    'Daftar', 'Kategori', 'Produk', 'Pesanan', 'Laporan', 'Laci', 'Karyawan',
    'Wajib', 'Semua', 'Aktif', 'Tidak', 'Berhasil', 'Gagal', 'Memuat'
]
id_pattern = re.compile(r'\b(' + '|'.join(id_words) + r')\b', re.IGNORECASE)

hardcoded_findings = []

for root, dirs, files in os.walk('client-admin/src'):
    if 'node_modules' in root:
        continue
    for file in files:
        if file.endswith('.tsx') and file != 'index.tsx':
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            for idx, line in enumerate(lines, 1):
                # Look for t('something', 'Indonesian fallback')
                # If the fallback is in Indonesian or English, and we are in ZH, it might fall back if key is missing
                t_matches = re.findall(r"t\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)", line)
                for key, fallback in t_matches:
                    # check if fallback is Indonesian/English and key is missing in ZH
                    if key not in zh_flat:
                        hardcoded_findings.append(f"{filepath}:{idx} [FALLBACK WITHOUT ZH KEY] t('{key}', '{fallback}')")
                    elif not re.search(r'[\u4e00-\u9fff]', zh_flat[key]) and not re.match(r'^[0-9\s.,:\/\-_%€$¥#@!?*()+=]+$', zh_flat[key]):
                        hardcoded_findings.append(f"{filepath}:{idx} [ZH KEY HAS NON-CHINESE VALUE] t('{key}') => '{zh_flat[key]}'")

                # Also check literal text in JSX: e.g. >Pengaturan< or >Simpan<
                # (exclude comments)
                stripped = line.strip()
                if not stripped.startswith('//') and not stripped.startswith('/*') and not stripped.startswith('*'):
                    # Check for literal Indonesian text in JSX
                    jsx_texts = re.findall(r'>([^<>{}]*)<', line)
                    for jt in jsx_texts:
                        jt_clean = jt.strip()
                        if jt_clean and id_pattern.search(jt_clean):
                            hardcoded_findings.append(f"{filepath}:{idx} [HARDCODED ID IN JSX] >{jt_clean}<")

print(f"\nTotal findings in TSX files: {len(hardcoded_findings)}")
for item in hardcoded_findings[:50]:
    print(item)
