#!/bin/bash
# electron-builder.json 完整性检查脚本
# 每次修改 electron-builder.json 后、打包前必须运行
# 用法: bash scripts/packaging-check.sh

CONFIG="electron-builder.json"
LAST_GOOD_COMMIT="d6db058"  # 2026-07-26 上次成功打包的配置

echo "========================================"
echo "  Electron 打包完整性检查"
echo "========================================"
echo ""

FAILED=0

# 1. asar 模式
BASELINE_ASAR=$(git show ${LAST_GOOD_COMMIT}:$CONFIG 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('asar'))")
CURRENT_ASAR=$(cat $CONFIG | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('asar'))")
echo "1. asar 模式"
echo "   基准: $BASELINE_ASAR | 当前: $CURRENT_ASAR"
[ "$BASELINE_ASAR" != "$CURRENT_ASAR" ] && echo "   ❌ 模式已改变！" && FAILED=1
echo ""

# 2. 关键模块
FILES=$(cat $CONFIG | python3 -c "import json,sys; d=json.load(sys.stdin); print('\n'.join(d.get('files',[])))")
UNPACK=$(cat $CONFIG | python3 -c "import json,sys; d=json.load(sys.stdin); print('\n'.join(d.get('asarUnpack',[])))")

echo "2. 关键模块检查"
for mod in electron-log electron-updater electron-printer .prisma "server/uploads"; do
    COUNT=$(echo "$FILES$UNPACK" | grep -c "$mod" || echo 0)
    [ "$COUNT" -gt 0 ] && echo "   ✅ $mod" || { echo "   ❌ 缺失: $mod"; FAILED=1; }
done
echo ""

# 3. seed.db
echo "3. seed.db"
echo "$FILES" | grep -q "seed.db" && echo "   ✅ 在 files[] 中" || { echo "   ❌ 缺失"; FAILED=1; }
echo ""

# 4. node_modules 覆盖模式
echo "4. node_modules 覆盖模式"
if echo "$FILES" | grep -q "node_modules/\*\*/\*"; then
    echo "   ✅ 全覆盖模式 (node_modules/**/*)"
elif echo "$FILES" | grep -q "node_modules/@prisma/client" && echo "$FILES" | grep -q "node_modules/electron-log"; then
    echo "   ✅ 细粒度覆盖"
else
    echo "   ⚠️  覆盖不完整"
fi
echo ""

# 5. files[] 数量对比（快速指标）
BASELINE_COUNT=$(git show ${LAST_GOOD_COMMIT}:$CONFIG 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('files',[])))")
CURRENT_COUNT=$(cat $CONFIG | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('files',[])))")
echo "5. files[] 数量"
echo "   基准: $BASELINE_COUNT patterns | 当前: $CURRENT_COUNT patterns"
if [ "$CURRENT_COUNT" -lt "$BASELINE_COUNT" ]; then
    echo "   ⚠️  patterns 比基准少，可能遗漏"
fi
echo ""

# 6. Prisma windows engine
echo "6. Prisma Windows 引擎"
grep -q "windows" server/prisma/schema.prisma && echo "   ✅ binaryTargets 包含 windows" || echo "   ⚠️  缺少 windows target"
echo ""

echo "========================================"
[ "$FAILED" -eq 1 ] && echo "❌ 检查未通过" || echo "✅ 检查通过"
echo "========================================"
exit $FAILED
