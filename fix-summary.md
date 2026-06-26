# 表单保存问题修复总结

## 已修复的问题

### 1. 优惠券无法保存 ❌→✅
**文件**: `client-admin/src/pages/marketing/CouponEditPage.tsx`
**问题**: 表单缺少 `storeId` 字段，API返回400错误
**修复**:
- 添加 `useAuthStore` 获取用户storeId
- 在表单state和提交数据中包含storeId

### 2. 活动(Campaign)无法保存 ❌→✅
**文件**: `client-admin/src/pages/marketing/CampaignEditPage.tsx`
**问题**: `actions` 被 `JSON.stringify` 两次，API期望object但收到string
**修复**:
- 移除多余的 `JSON.stringify(form.actions)`
- 直接传递对象

### 3. 自动化规则页面崩溃 ❌→✅
**文件**: `client-admin/src/pages/marketing/AutomationRulePage.tsx`
**问题**: `rules.filter is not a function` - API返回数据结构不符合预期
**修复**:
- 更全面地处理API响应结构 `data?.data?.list || data?.data || []`
- 添加防御性代码处理各种返回格式

## 修复的文件列表

1. `client-admin/src/pages/marketing/CouponEditPage.tsx`
2. `client-admin/src/pages/marketing/CampaignEditPage.tsx`
3. `client-admin/src/pages/marketing/AutomationRulePage.tsx`

## 测试结果

| 表单 | 修复前 | 修复后 |
|------|--------|--------|
| 优惠券 | API 400 (storeId Required) | ✅ API 201 |
| 活动Campaign | API 400 (actions错误) | ✅ API 201 |
| 自动化规则 | 页面崩溃 | ✅ 正常加载 |