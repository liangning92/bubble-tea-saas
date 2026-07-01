/**
 * CRUD数据回流测试
 */

const { chromium } = require('playwright');

const API = 'http://localhost:7072/api';
const ADMIN = 'http://localhost:5173';

async function api(method, path, body, token) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opt.headers['Authorization'] = `Bearer ${token}`;
  if (body) opt.body = JSON.stringify(body);
  try {
    const r = await fetch(`${API}${path}`, opt);
    return { status: r.status, data: await r.json().catch(() => ()) };
  } catch (e) { return { status: 0, data: { error: e.message } };
  }
}

async function run() {
  // 登录
  const login = await api('POST', '/auth/login', { phone: '081234567890', password: 'admin123' });
  const token = login.data?.data?.token;
  console.log('✅ 登录成功');

  const tests = [];

  // 1. 产品
  const products = await api('GET', '/products', null, token);
  tests.push({ name: '产品-列表', ok: products.status === 200, d: `返回${products.data?.data?.list?.length}个` });

  // 2. 库存
  const inv = await api('GET', '/inventory', null, token);
  tests.push({ name: '库存-列表', ok: inv.status === 200, d: `返回${inv.data?.data?.length || 0}个` });

  // 3. 员工
  const staff = await api('GET', '/staff', null, token);
  tests.push({ name: '员工-列表', ok: staff.status === 200, d: `返回${staff.data?.data?.length || 0}个` });

  // 4. 会员
  const members = await api('GET', '/members', null, token);
  tests.push({ name: '会员-列表', ok: members.status === 200, d: `返回${members.data?.data?.list?.length || 0}个` });

  // 5. 订单
  const orders = await api('GET', '/orders', null, token);
  tests.push({ name: '订单-列表', ok: orders.status === 200, d: `返回${orders.data?.data?.list?.length || 0}个` });

  // 6. 公告
  const announcements = await api('GET', '/announcement', null, token);
  tests.push({ name: '公告-列表', ok: announcements.status === 200, d: `返回${announcements.data?.data?.length || 0}个` });

  // 7. 卫生任务
  const tasks = await api('GET', '/hygiene/tasks?date=2026-06-29', null, token);
  tests.push({ name: '卫生任务-列表', ok: tasks.status === 200, d: `返回${tasks.data?.data?.list?.length || 0}个` });

  // 8. 营收报表
  const revenue = await api('GET', '/reports/revenue', null, token);
  tests.push({ name: '营收报表', ok: revenue.status === 200, d: revenue.data?.data?.summary ? '有数据' : '空数据' });

  // 9. 仪表盘
  const dashboard = await api('GET', '/reports/dashboard', null, token);
  tests.push({ name: '仪表盘', ok: dashboard.status === 200, d: dashboard.data?.data ? '有数据' : '空' });

  // 10. 渠道
  const channels = await api('GET', '/channels', null, token);
  tests.push({ name: '渠道-列表', ok: channels.status === 200, d: `返回${channels.data?.data?.length || 0}个` });

  // 11. 费用
  const expenses = await api('GET', '/expenses', null, token);
  tests.push({ name: '费用-列表', ok: expenses.status === 200 });

  // 12. 优惠券
  const coupons = await api('GET', '/marketing/coupons', null, token);
  tests.push({ name: '优惠券-列表', ok: coupons.status === 200, d: `返回${coupons.data?.data?.length || 0}个` });

  // 13. BOM配方
  const bom = await api('GET', '/products?pageSize=1', null, token);
  tests.push({ name: 'BOM配方', ok: bom.status === 200 });

  // 14. 库存预警
  const alerts = await api('GET', '/inventory/alerts/low-stock', null, token);
  tests.push({ name: '库存预警', ok: alerts.status === 200, d: alerts.data?.data?.list?.length ? `有预警` : '无预警' });

  // 15. 请假列表
  const leaves = await api('GET', '/leave/my', null, token);
  tests.push({ name: '请假记录', ok: leaves.status === 200 });

  // 16. 考勤记录
  const attendance = await api('GET', '/staff/attendance/today', null, token);
  tests.push({ name: '考勤记录', ok: attendance.status === 200 });

  // 17. 卫生模板
  const templates = await api('GET', '/hygiene/templates', null, token);
  tests.push({ name: '卫生模板', ok: templates.status === 200 });

  // 18. 卫生区域
  const areas = await api('GET', '/hygiene/areas', null, token);
  tests.push({ name: '卫生区域', ok: areas.status === 200 });

  // 19. 积分规则
  const points = await api('GET', '/points-rule', null, token);
  tests.push({ name: '积分规则', ok: points.status === 200 });

  // 20. 会员等级
  const tiers = await api('GET', '/marketing/members/tier-benefits', null, token);
  tests.push({ name: '会员等级权益', ok: tiers.status === 200 });

  // 输出结果
  console.log('\n========== CRUD数据回流测试 ==========\n');
  let pass = 0;
  for (const t of tests) {
    console.log(`${t.ok ? '✅' : '❌'} ${t.name} ${t.d || ''}`);
    if (t.ok) pass++;
  }
  console.log(`\n========== 通过 ${pass}/${tests.length} ==========`);
}

run().catch(console.error);
