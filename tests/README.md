# Playwright 测试框架

## 快速开始

### 安装浏览器
```bash
npx playwright install
```

### 运行所有测试
```bash
npm run test:playwright
```

### 运行特定测试
```bash
npm run test:playwright:smoke   # 冒烟测试 - 关键流程
npm run test:playwright:i18n    # 国际化测试
npm run test:playwright:pos     # POS 测试
```

### UI 模式（可视化调试）
```bash
npm run test:playwright:ui
```

## 测试文件

| 文件 | 用途 | 运行频率 |
|------|------|----------|
| `smoke.spec.ts` | 冒烟测试 - 每次修改后运行 | 每次 PR |
| `i18n.spec.ts` | 翻译完整性测试 | 每次 PR |
| `pos.spec.ts` | POS 关键流程 | 每次 PR |
| `e2e.spec.ts` | 完整端到端流程 | 上线前 |

## 前置条件

1. 服务必须运行：
```bash
npm run dev  # 启动所有服务
# 或单独启动
npm run dev:admin  # http://localhost:5173
npm run dev:pos    # http://localhost:6065
```

2. 设置环境变量（可选）：
```bash
BASE_URL=http://localhost:5173
POS_URL=http://localhost:6065
```

## 测试覆盖范围

### L1 - 冒烟测试 (Smoke)
- [x] 登录页面加载无错误
- [x] Dashboard 加载无白屏
- [x] 所有主要导航页面加载
- [x] 费用表单可打开
- [x] 离线时显示错误边界

### L2 - 国际化测试 (i18n)
- [ ] 所有页面三种语言加载
- [ ] 无硬编码英文
- [ ] 数字/货币格式正确

### L3 - POS 测试
- [x] POS 页面加载
- [x] 可添加产品到订单
- [x] 订单提交流程
- [x] 历史页面加载
- [ ] 退款按钮缺失（已知问题）

## CI 集成

在 GitHub Actions 中运行：
```yaml
- name: Run Playwright Tests
  run: npm run test:playwright
```

## 调试

### 查看测试报告
```bash
open playwright-report/index.html
```

### 只运行特定测试
```bash
npx playwright test tests/smoke.spec.ts --debug
```

### 查看截图
测试失败时截图保存在 `playwright-report/` 目录
