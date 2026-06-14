# Bubble Tea SaaS 项目规范

## 项目概述
- **项目名称**: 珍珠奶茶 SaaS 系统 (Bubble Tea POS)
- **位置**: `~/Desktop/Claude_Work/bubble-tea-saas`
- **技术栈**: Next.js (前端), Node.js/Express (后端), Prisma (数据库), SQLite
- **包管理**: npm

## 应用端口
- **Server API**: `http://localhost:3000`
- **Admin 管理端**: `http://localhost:5173`
- **POS 收银端**: `http://localhost:6065`

## 语言规范 (i18n) ⚠️ 关键规则

### 必须遵守的翻译规则

**所有新增的页面、组件、功能，必须同步添加翻译：**

1. **翻译文件位置**:
   - Admin 端: `client-admin/src/i18n/index.ts`
   - POS 端: `client-pos/src/i18n/index.ts`

2. **翻译命名空间结构**:
   ```typescript
   const resources = {
     id: { translation: { ... } },  // 印尼语
     en: { translation: { ... } },  // 英语
     zh: { translation: { ... } }    // 中文
   }
   ```

3. **添加新翻译的步骤**:
   - 在 `en` (英语) 中添加 key 和英文值
   - 在 `zh` (中文) 中添加对应的中文翻译
   - 在 `id` (印尼语) 中添加对应的印尼语翻译
   - **三者必须同步添加，key 必须完全一致**

4. **翻译 key 命名规范**:
   - 格式: `section.specificKey` (如 `orders.orderNumber`)
   - 使用小写字母和点号分隔
   - section 使用单数形式 (如 `order` 而非 `orders`)

5. **禁止的行为**:
   - ❌ 只添加英语翻译，不添加中文
   - ❌ 使用硬编码字符串而不使用翻译 key
   - ❌ 在一个语言中添加 key 而在其他语言中留空

### 示例

```typescript
// 正确示例
orders: {
  title: '订单',      // zh
  title: 'Orders',    // en
  title: 'Pesanan',    // id
  orderNumber: '订单号',
  orderNumber: 'Order Number',
  orderNumber: 'Nomor Pesanan',
}

// 错误示例 - 不要这样做！
orders: {
  title: '订单',      // zh ✓
  // en 和 id 缺失 ✗
}
```

## 开发命令

```bash
cd ~/Desktop/Claude_Work/bubble-tea-saas

# 后端
cd server && npm run dev

# Admin 管理端
cd client-admin && npm run dev

# POS 收银端
cd client-pos && npm run dev
```

## 代码风格

- 使用 TypeScript
- 使用 zustand 管理状态
- 使用 @tanstack/react-query 管理数据获取
- 使用 Tailwind CSS 样式
- 使用 lucide-react 图标

## 数据库

- 使用 Prisma ORM
- SQLite 数据库
- Schema 文件: `server/prisma/schema.prisma`

## 备注

- Admin 管理端支持 3 种语言: 印尼语 (id)、英语 (en)、中文 (zh)
- 默认语言是印尼语 (id)
- 用户可以在设置中切换语言，设置保存在浏览器 localStorage
- fallback 语言是英语 (en)
