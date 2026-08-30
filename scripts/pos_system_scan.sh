#!/bin/bash
# Bubble Tea POS 系统扫描 - 精确版
# 旧代码特征：getPrimaryDisplay() + 固定x:0,y:0 或 bounds.x!==0 排除法
# 新代码特征：getAllDisplays() + leftmostDisplay/rightmostDisplay

PROJECT="/Users/liangning/Desktop/Claude_Work/bubble-tea-saas"
LOG="$PROJECT/logs/pos_scan.log"
mkdir -p "$PROJECT/logs"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === POS系统扫描 ===" >> "$LOG"

ISSUES=0

# 检查函数：精确匹配旧代码特征
check_old_logic() {
    local file=$1 label=$2
    # 旧代码的标志：getPrimaryDisplay() 调用存在（即使在注释中）
    # 更精确：getPrimaryDisplay() 调用 且 后续没有 leftmostDisplay/reduce
    local has_old_api=$(grep -n "getPrimaryDisplay()" "$file" 2>/dev/null)
    local has_old_exclude=$(grep -n "bounds\.x !== 0 || bounds\.y !== 0" "$file" 2>/dev/null)
    local has_new_logic=$(grep -n "leftmostDisplay\|rightmostDisplay" "$file" 2>/dev/null)
    
    if [ -n "$has_old_api" ] && [ -z "$has_new_logic" ]; then
        echo "  ❌ $label: 使用了旧版 getPrimaryDisplay() 且无新逻辑" >> "$LOG"
        echo "$has_old_api" >> "$LOG"
        ISSUES=$((ISSUES+1))
        return 1
    fi
    
    if [ -n "$has_old_exclude" ] && [ -z "$has_new_logic" ]; then
        echo "  ❌ $label: 使用了旧版排除法 bounds.x !== 0 且无新逻辑" >> "$LOG"
        echo "$has_old_exclude" >> "$LOG"
        ISSUES=$((ISSUES+1))
        return 1
    fi
    
    echo "  ✅ $label 双屏逻辑正常" >> "$LOG"
    return 0
}

echo "[1/6] 检查双屏逻辑..." >> "$LOG"
check_old_logic "$PROJECT/client-pos/electron/main.ts" "electron/main.ts"
check_old_logic "$PROJECT/client-pos/main.js" "client-pos/main.js"
check_old_logic "$PROJECT/client-pos/dist-electron/electron/main.js" "dist-electron/main.js"

echo "[2/6] 检查electron-builder main入口..." >> "$LOG"
EB_MAIN=$(grep '"main"' "$PROJECT/electron-builder.json" 2>/dev/null)
if echo "$EB_MAIN" | grep -q "dist-electron"; then
    echo "  ✅ main入口: $EB_MAIN" >> "$LOG"
else
    echo "  ❌ main入口异常: $EB_MAIN" >> "$LOG"
    ISSUES=$((ISSUES+1))
fi

echo "[3/6] 检查API配置..." >> "$LOG"
if grep -q "LOCAL_API_URL\|CLOUD_API_URL" "$PROJECT/client-pos/src/config.ts" 2>/dev/null; then
    echo "  ✅ API配置正常" >> "$LOG"
else
    echo "  ❌ API配置缺失" >> "$LOG"
    ISSUES=$((ISSUES+1))
fi

echo "[4/6] 检查副屏路由..." >> "$LOG"
if grep -q 'customer-display' "$PROJECT/client-pos/src/App.tsx" 2>/dev/null; then
    echo "  ✅ 副屏路由正常" >> "$LOG"
else
    echo "  ❌ 副屏路由缺失" >> "$LOG"
    ISSUES=$((ISSUES+1))
fi

echo "[5/6] 检查编译产物..." >> "$LOG"
if grep -q "leftmostDisplay" "$PROJECT/client-pos/dist-electron/electron/main.js" 2>/dev/null; then
    echo "  ✅ 编译产物已更新" >> "$LOG"
else
    echo "  ❌ 编译产物未更新" >> "$LOG"
    ISSUES=$((ISSUES+1))
fi

echo "[6/6] 检查未提交改动..." >> "$LOG"
cd "$PROJECT"
UNCOMMITTED=$(git status --porcelain 2>/dev/null | grep -v "?? server/uploads")
if [ -n "$UNCOMMITTED" ]; then
    echo "  ⚠️  有未提交改动" >> "$LOG"
    echo "$UNCOMMITTED" | head -5 >> "$LOG"
fi

echo "" >> "$LOG"
if [ $ISSUES -gt 0 ]; then
    echo "  🚨 发现 $ISSUES 个问题需处理" >> "$LOG"
else
    echo "  ✅ 系统检查通过" >> "$LOG"
fi
echo "---" >> "$LOG"

cat "$LOG"
