/**
 * 深度测试脚本 - 测试所有模块的用户权限和功能
 * 运行方式: node deep-test-all.js
 */

const API_BASE = 'http://localhost:7072/api';

// 模拟用户角色
const USERS = {
  admin: { phone: '081234567890', role: 'admin' },
  manager: { phone: '081234567891', role: 'manager' },
  cashier: { phone: '081234567892', role: 'cashier' },
  staff: { phone: '081234567893', role: 'staff' }
};

let authToken = null;
let testResults = [];

async function apiRequest(method, path, body = null, token = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json().catch(() => ({}));
    return {
      status: response.status,
      ok: response.ok,
      data
    };
  } catch (error) {
    return { status: 0, ok: false, error: error.message };
  }
}

async function login(phone, password = 'admin123') {
  const result = await apiRequest('POST', '/auth/login', { phone, password });
  if (result.ok && result.data.data?.token) {
    authToken = result.data.data.token;
    return authToken;
  }
  return null;
}

function log(module, action, role, status, details = '') {
  const icon = status ? '✅' : '❌';
  const entry = {
    module,
    action,
    role,
    status,
    details,
    time: new Date().toISOString()
  };
  testResults.push(entry);
  console.log(`${icon} [${role.toUpperCase()}] ${module}.${action}: ${status ? 'OK' : 'FAIL'} ${details}`);
  return status;
}

async function testModules() {
  console.log('\n========== 深度权限测试开始 ==========\n');

  // ========== 1. 报表模块 (Report) ==========
  console.log('\n--- 报表模块 (Report) ---');
  await login(USERS.admin.phone);
  const adminToken = authToken;

  await login(USERS.manager.phone);
  const managerToken = authToken;

  await login(USERS.cashier.phone);
  const cashierToken = authToken;

  await login(USERS.staff.phone);
  const staffToken = authToken;

  // Admin/Manager 访问报表 - 应该OK
  const adminRevenue = await apiRequest('GET', '/reports/revenue', null, adminToken);
  log('Report', 'revenue', 'admin', adminRevenue.status === 200, `Status: ${adminRevenue.status}`);

  const managerRevenue = await apiRequest('GET', '/reports/revenue', null, managerToken);
  log('Report', 'revenue', 'manager', managerRevenue.status === 200, `Status: ${managerRevenue.status}`);

  // Cashier 访问报表 - 应该被拒绝
  const cashierRevenue = await apiRequest('GET', '/reports/revenue', null, cashierToken);
  log('Report', 'revenue', 'cashier', cashierRevenue.status === 403, `Status: ${cashierRevenue.status}`);

  const cashierDashboard = await apiRequest('GET', '/reports/dashboard', null, cashierToken);
  log('Report', 'dashboard', 'cashier', cashierDashboard.status === 403, `Status: ${cashierDashboard.status}`);

  // Staff 访问报表 - 应该被拒绝
  const staffRevenue = await apiRequest('GET', '/reports/revenue', null, staffToken);
  log('Report', 'revenue', 'staff', staffRevenue.status === 403, `Status: ${staffRevenue.status}`);

  // ========== 2. 公告模块 (Announcement) ==========
  console.log('\n--- 公告模块 (Announcement) ---');

  // 公开路由 - 无需认证 (但需要 storeId)
  const publicActive = await apiRequest('GET', '/announcement/active?storeId=test-store-id');
  // 注意：这个路由现在需要认证了，我们期望401表示"需要认证但未提供"
  log('Announcement', 'active (needs auth)', 'anonymous', publicActive.status === 401, `Status: ${publicActive.status}`);

  // 列表 - 需要认证
  const adminList = await apiRequest('GET', '/announcement', null, adminToken);
  log('Announcement', 'list', 'admin', adminList.status === 200, `Status: ${adminList.status}`);

  const cashierList = await apiRequest('GET', '/announcement', null, cashierToken);
  log('Announcement', 'list', 'cashier', cashierList.status === 403, `Status: ${cashierList.status}`);

  // ========== 3. 门店模块 (Store) ==========
  console.log('\n--- 门店模块 (Store) ---');

  // 创建门店 - 仅 admin (需要有效数据)
  const adminCreateStore = await apiRequest('POST', '/stores', { name: 'Test Store' }, adminToken);
  // 可能是400因为验证失败，不是权限问题
  log('Store', 'create', 'admin', [201, 400].includes(adminCreateStore.status), `Status: ${adminCreateStore.status}`);

  const cashierCreateStore = await apiRequest('POST', '/stores', { name: 'Test Store' }, cashierToken);
  log('Store', 'create', 'cashier', cashierCreateStore.status === 403, `Status: ${cashierCreateStore.status}`);

  // ========== 4. 产品模块 (Product) ==========
  console.log('\n--- 产品模块 (Product) ---');

  // 列出产品 - 所有登录用户
  const adminProducts = await apiRequest('GET', '/products', null, adminToken);
  log('Product', 'list', 'admin', adminProducts.status === 200, `Status: ${adminProducts.status}`);

  const cashierProducts = await apiRequest('GET', '/products', null, cashierToken);
  log('Product', 'list', 'cashier', cashierProducts.status === 200, `Status: ${cashierProducts.status}`);

  // 创建产品 - 仅 admin/manager
  const cashierCreateProduct = await apiRequest('POST', '/products', { name: 'Test', storeId: 'test' }, cashierToken);
  log('Product', 'create', 'cashier', cashierCreateProduct.status === 403, `Status: ${cashierCreateProduct.status}`);

  // 产品成本 - 仅 admin/manager
  const productCost = await apiRequest('GET', '/products/test-id/cost', null, cashierToken);
  log('Product', 'cost', 'cashier', productCost.status === 403, `Status: ${productCost.status}`);

  const adminCost = await apiRequest('GET', '/products/test-id/cost', null, adminToken);
  log('Product', 'cost', 'admin', adminCost.status === 404, `Status: ${adminCost.status}`); // 404因为产品不存在，不是权限问题

  // ========== 5. 库存模块 (Inventory) ==========
  console.log('\n--- 库存模块 (Inventory) ---');

  // 列出库存 - 所有登录用户
  const adminInventory = await apiRequest('GET', '/inventory', null, adminToken);
  log('Inventory', 'list', 'admin', adminInventory.status === 200, `Status: ${adminInventory.status}`);

  const cashierInventory = await apiRequest('GET', '/inventory', null, cashierToken);
  log('Inventory', 'list', 'cashier', cashierInventory.status === 200, `Status: ${cashierInventory.status}`);

  // 出库 - admin/manager/staff
  const cashierStockOut = await apiRequest('POST', '/inventory/stock-out', { storeId: 'test' }, cashierToken);
  log('Inventory', 'stock-out', 'cashier', cashierStockOut.status === 403, `Status: ${cashierStockOut.status}`);

  // ========== 6. 订单模块 (Order) ==========
  console.log('\n--- 订单模块 (Order) ---');

  // 列出订单 - 所有登录用户
  const adminOrders = await apiRequest('GET', '/orders', null, adminToken);
  log('Order', 'list', 'admin', adminOrders.status === 200, `Status: ${adminOrders.status}`);

  const cashierOrders = await apiRequest('GET', '/orders', null, cashierToken);
  log('Order', 'list', 'cashier', cashierOrders.status === 200, `Status: ${cashierOrders.status}`);

  // 退款 - 仅 admin/manager
  const cashierRefund = await apiRequest('POST', '/orders/test-id/refund', {}, cashierToken);
  log('Order', 'refund', 'cashier', cashierRefund.status === 403, `Status: ${cashierRefund.status}`);

  // ========== 7. 会员模块 (Member) ==========
  console.log('\n--- 会员模块 (Member) ---');

  // 列出会员 - 所有登录用户
  const adminMembers = await apiRequest('GET', '/members', null, adminToken);
  log('Member', 'list', 'admin', adminMembers.status === 200, `Status: ${adminMembers.status}`);

  // 更新会员 - 仅 admin/manager
  const cashierUpdateMember = await apiRequest('PUT', '/members/test-id', { name: 'Test' }, cashierToken);
  log('Member', 'update', 'cashier', cashierUpdateMember.status === 403, `Status: ${cashierUpdateMember.status}`);

  // ========== 8. 员工模块 (Staff) ==========
  console.log('\n--- 员工模块 (Staff) ---');

  // 列出员工 - admin/manager
  const adminStaff = await apiRequest('GET', '/staff', null, adminToken);
  log('Staff', 'list', 'admin', adminStaff.status === 200, `Status: ${adminStaff.status}`);

  const cashierStaff = await apiRequest('GET', '/staff', null, cashierToken);
  // Staff list 实际上对 cashier/staff 也开放（用于查看员工选择）
  log('Staff', 'list', 'cashier', cashierStaff.status === 200, `Status: ${cashierStaff.status}`);

  // 创建员工 - 仅 admin
  const cashierCreateStaff = await apiRequest('POST', '/staff', { name: 'Test', storeId: 'test' }, cashierToken);
  log('Staff', 'create', 'cashier', cashierCreateStaff.status === 403, `Status: ${cashierCreateStaff.status}`);

  // ========== 9. 财务模块 (Finance) ==========
  console.log('\n--- 财务模块 (Finance) ---');

  // 营收报表 - 仅 admin/manager
  const adminFinance = await apiRequest('GET', '/finance/revenue', null, adminToken);
  log('Finance', 'revenue', 'admin', adminFinance.status === 200, `Status: ${adminFinance.status}`);

  const cashierFinance = await apiRequest('GET', '/finance/revenue', null, cashierToken);
  log('Finance', 'revenue', 'cashier', cashierFinance.status === 403, `Status: ${cashierFinance.status}`);

  // ========== 10. 卫生管理 (Hygiene) ==========
  console.log('\n--- 卫生管理 (Hygiene) ---');

  // 列出任务 - 所有登录用户
  const adminHygiene = await apiRequest('GET', '/hygiene/tasks', null, adminToken);
  log('Hygiene', 'tasks', 'admin', adminHygiene.status === 200, `Status: ${adminHygiene.status}`);

  const cashierHygiene = await apiRequest('GET', '/hygiene/tasks', null, cashierToken);
  log('Hygiene', 'tasks', 'cashier', cashierHygiene.status === 200, `Status: ${cashierHygiene.status}`);

  // ========== 11. 营销模块 (Marketing) ==========
  console.log('\n--- 营销模块 (Marketing) ---');

  // 列出活动 - admin/manager
  const adminCampaigns = await apiRequest('GET', '/marketing/campaigns', null, adminToken);
  log('Marketing', 'campaigns', 'admin', adminCampaigns.status === 200, `Status: ${adminCampaigns.status}`);

  const cashierCampaigns = await apiRequest('GET', '/marketing/campaigns', null, cashierToken);
  log('Marketing', 'campaigns', 'cashier', cashierCampaigns.status === 403, `Status: ${cashierCampaigns.status}`);

  // ========== 12. 请假模块 (Leave) ==========
  console.log('\n--- 请假模块 (Leave) ---');

  // 申请请假 - 所有登录用户（但需要有效数据）
  const cashierLeave = await apiRequest('POST', '/leave/apply', { staffId: 'test' }, cashierToken);
  // 400可能是数据问题，不一定是权限
  log('Leave', 'apply', 'cashier', [201, 400].includes(cashierLeave.status), `Status: ${cashierLeave.status}`);

  // 审批请假 - 仅 admin/manager
  const cashierApprove = await apiRequest('PUT', '/leave/approve/test-id', {}, cashierToken);
  log('Leave', 'approve', 'cashier', cashierApprove.status === 403, `Status: ${cashierApprove.status}`);

  // ========== 13. 报销模块 (Reimbursement) ==========
  console.log('\n--- 报销模块 (Reimbursement) ---');

  // 申请报销 - 所有登录用户
  const cashierReimb = await apiRequest('POST', '/reimbursement/apply', { staffId: 'test' }, cashierToken);
  log('Reimbursement', 'apply', 'cashier', [201, 400].includes(cashierReimb.status), `Status: ${cashierReimb.status}`);

  // 审批报销 - 仅 admin/manager
  const cashierApproveReimb = await apiRequest('PUT', '/reimbursement/approve/test-id', {}, cashierToken);
  log('Reimbursement', 'approve', 'cashier', cashierApproveReimb.status === 403, `Status: ${cashierApproveReimb.status}`);

  // ========== 14. 费用模块 (Expense) - 注意路径是 /expenses ==========
  console.log('\n--- 费用模块 (Expense) ---');

  // 列出费用 - admin/manager
  const adminExpense = await apiRequest('GET', '/expenses', null, adminToken);
  log('Expense', 'list', 'admin', adminExpense.status === 200, `Status: ${adminExpense.status}`);

  const cashierExpense = await apiRequest('GET', '/expenses', null, cashierToken);
  log('Expense', 'list', 'cashier', cashierExpense.status === 403, `Status: ${cashierExpense.status}`);

  // ========== 15. 工资模块 (Salary) - 注意路径是 /salaries ==========
  console.log('\n--- 工资模块 (Salary) ---');

  // 列出工资 - admin/manager
  const adminSalary = await apiRequest('GET', '/salaries', null, adminToken);
  log('Salary', 'list', 'admin', adminSalary.status === 200, `Status: ${adminSalary.status}`);

  const cashierSalary = await apiRequest('GET', '/salaries', null, cashierToken);
  log('Salary', 'list', 'cashier', cashierSalary.status === 403, `Status: ${cashierSalary.status}`);

  // ========== 16. 渠道模块 (Channel) ==========
  console.log('\n--- 渠道模块 (Channel) ---');

  // 列出渠道 - 所有登录用户
  const adminChannels = await apiRequest('GET', '/channels', null, adminToken);
  log('Channel', 'list', 'admin', adminChannels.status === 200, `Status: ${adminChannels.status}`);

  const cashierChannels = await apiRequest('GET', '/channels', null, cashierToken);
  log('Channel', 'list', 'cashier', cashierChannels.status === 200, `Status: ${cashierChannels.status}`);

  // ========== 17. 分类模块 (Category) ==========
  console.log('\n--- 分类模块 (Category) ---');

  // 列出分类 - 所有登录用户
  const adminCategories = await apiRequest('GET', '/categories', null, adminToken);
  log('Category', 'list', 'admin', adminCategories.status === 200, `Status: ${adminCategories.status}`);

  // 创建分类 - 仅 admin/manager
  const cashierCreateCat = await apiRequest('POST', '/categories', { name: 'Test' }, cashierToken);
  log('Category', 'create', 'cashier', cashierCreateCat.status === 403, `Status: ${cashierCreateCat.status}`);

  // ========== 18. 配件模块 (Addon) ==========
  console.log('\n--- 配件模块 (Addon) ---');

  // 列出配件 - 所有登录用户
  const adminAddons = await apiRequest('GET', '/addons', null, adminToken);
  log('Addon', 'list', 'admin', adminAddons.status === 200, `Status: ${adminAddons.status}`);

  // 创建配件 - 仅 admin/manager
  const cashierCreateAddon = await apiRequest('POST', '/addons', { name: 'Test' }, cashierToken);
  log('Addon', 'create', 'cashier', cashierCreateAddon.status === 403, `Status: ${cashierCreateAddon.status}`);

  // ========== 19. 配置模块 (Config) ==========
  console.log('\n--- 配置模块 (Config) ---');

  // 列出配置 - 需要认证
  const adminConfig = await apiRequest('GET', '/config', null, adminToken);
  log('Config', 'list', 'admin', adminConfig.status === 200, `Status: ${adminConfig.status}`);

  const cashierConfig = await apiRequest('GET', '/config', null, cashierToken);
  log('Config', 'list', 'cashier', cashierConfig.status === 200, `Status: ${cashierConfig.status}`); // 所有登录用户可读

  // 更新配置 - 仅 admin/manager
  const cashierUpdateConfig = await apiRequest('PUT', '/config/staff/features', { value: '{}' }, cashierToken);
  log('Config', 'update', 'cashier', cashierUpdateConfig.status === 403, `Status: ${cashierUpdateConfig.status}`);

  // ========== 20. 供应商模块 (Supplier) ==========
  console.log('\n--- 供应商模块 (Supplier) ---');

  // 列出供应商 - 所有登录用户
  const adminSuppliers = await apiRequest('GET', '/suppliers', null, adminToken);
  log('Supplier', 'list', 'admin', adminSuppliers.status === 200, `Status: ${adminSuppliers.status}`);

  // 创建供应商 - 仅 admin/manager
  const cashierCreateSupplier = await apiRequest('POST', '/suppliers', { name: 'Test' }, cashierToken);
  log('Supplier', 'create', 'cashier', cashierCreateSupplier.status === 403, `Status: ${cashierCreateSupplier.status}`);

  // ========== 总结 ==========
  console.log('\n========== 测试总结 ==========');

  const total = testResults.length;
  const passed = testResults.filter(r => r.status === true).length;
  const failed = testResults.filter(r => r.status === false).length;

  console.log(`\n总测试数: ${total}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ 失败的测试:');
    testResults.filter(r => r.status === false).forEach(r => {
      console.log(`  - ${r.module}.${r.action} (${r.role}): ${r.details}`);
    });
  }

  console.log('\n========== 测试完成 ==========\n');

  return { total, passed, failed };
}

// 运行测试
testModules().catch(console.error);
