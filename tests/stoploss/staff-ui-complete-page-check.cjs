const { expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function staffUI(browser) {
  const output = path.resolve(process.env.STAFF_UI_EVIDENCE_DIR || 'output/staff-ui-regression');
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  const errors = [], writes = [];
  await context.addInitScript(() => {
    localStorage.setItem('bubble-tea-language', 'en');
    sessionStorage.setItem('staff-auth-storage', JSON.stringify({ state: { token: 'synthetic-ui-only', user: { id: 'u', staffId: 'e', storeId: 's', name: 'UI Employee', role: 'admin' }, isAuthenticated: true }, version: 0 }));
  });
  const materials = [{ id: 'm', name: 'Test Water', unit: 'ml', category: 'raw_material', currentStock: 88799.99999999994, safetyStock: 100, updatedAt: '2026-10-15T00:00:00Z' }];
  const purchase = { id: 'p', orderNumber: 'UI-PURCHASE', status: 'awaiting_receipt', totalAmount:10000, updatedAt:'2026-10-15T00:00:00Z', createdAt: '2026-10-15T00:00:00Z', items: [{ id: 'pi', inventoryId:'m', inventory: materials[0], quantity: 10, unitCost:1000, inputQuantity:10, inputUnit:'ml', inputUnitCost:1000, lineAmount:10000 }] };
  const course = { key: 'onboarding', reviewed: true, title: { en: 'UI Course', id: 'UI Course', zh: '测试课程' }, subtitle: { en: 'UI subtitle', id: 'UI subtitle', zh: '测试说明' }, minutes: 5, sections: [{ title: { en: 'Section', id: 'Section' }, points: [{ en: 'Step', id: 'Step' }] }], quiz: [], practical: [], sources: [] };
  let failInventory = false, failOvertime = false, confirmedSwap = false, swapTestEnabled = false, declinedSwap = false, editSwapTestEnabled = false, failLeaveRules = false;
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
    let data = [], extra = {};
    if (method !== 'GET') writes.push({ p, method, data:req.postDataJSON() });
    if (failInventory && p === '/api/inventory') return route.fulfill({ status: 503, json: { code: 503, message: 'Synthetic inventory failure' } });
    if (failOvertime && p === '/api/overtime') return route.fulfill({ status: 503, json: { code: 503, message: 'Synthetic overtime failure' } });
    const invitation={id:'swap-invite',staffId:'sender',targetStaffId:'e',staff:{name:'UI Applicant'},targetStaff:{name:'UI Employee'},updatedAt:'2026-10-18T10:00:00.000Z',originalDate:'2026-10-15',targetDate:'2026-10-16',originalShift:'morning',targetShift:'evening',originalShiftName:'Morning',targetShiftName:'Evening',status:declinedSwap?'peer_rejected':'pending',targetConfirmed:confirmedSwap,reason:'UI swap invitation'};
    if (p === '/api/shift-swap/pending-confirm') data = !swapTestEnabled || confirmedSwap || declinedSwap ? [] : [invitation];
    else if (p === '/api/shift-swap/colleagues') data = [{id:'colleague',name:'UI Colleague',employeeNumber:'UI-2'}];
    else if (p === '/api/shift-swap/my') data = editSwapTestEnabled ? [{...invitation,id:'edit-swap',staffId:'e',targetStaffId:'colleague',targetStaff:{name:'UI Colleague'},originalDate:'2026-10-14T17:00:00.000Z',targetDate:'2026-10-15T17:00:00.000Z',targetConfirmed:false}] : swapTestEnabled ? [invitation] : [];
    else if (p === '/api/shift-swap/swap-invite/confirm') { const reply=req.postDataJSON(); confirmedSwap = reply.agree; declinedSwap = !reply.agree; data = {...invitation,targetConfirmed:confirmedSwap,status:declinedSwap?'peer_rejected':'pending'}; }
    else if (p === '/api/staff-permissions/me') data = { role: { version: 2, modes: {} } };
    else if (p === '/api/auth/me') data = { staff: { name: 'UI Employee', position: 'cashier' }, store: { name: 'UI Store' } };
    else if (p === '/api/staff/overview/monthly') data = { schedule: {}, attendance: {}, announcements: [] };
    else if (p === '/api/staff/attendance/today') data = null;
    else if (p === '/api/staff/salary/my') { data = null; extra = { unavailableReason: 'STAFF_BASE_SALARY_REQUIRED' }; }
    else if (p === '/api/shifts') data = [{ key: 'morning', name: 'Morning', startTime: '09:00', endTime: '18:00' }, {key:'evening',name:'Evening',startTime:'15:00',endTime:'23:00'}];
    else if (p === '/api/staff/schedule/my') data = { monday: 'morning' };
    else if (p === '/api/staff-work/my/dashboard') data = { tasks: [], reminders: [], pendingRequests: [], reviews: [] };
    else if (p === '/api/staff-work/my/attendance') data = { records: [], appeals: [], payrollIssues: [] };
    else if (p === '/api/staff-work/my/profile-submissions') data = { official: {ktp:{data:{number:'synthetic-id'},files:['ui-file']}}, submissions: [] };
    else if (p === '/api/staff-work/files/ui-file') return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});
    else if (p === '/api/staff-work/my/checklist') data = {};
    else if (p === '/api/staff-work/my/late-rule') data = { enabled: false };
    else if (p === '/api/inventory') data = { list: materials };
    else if (p === '/api/purchase-orders') data = { list: [purchase] };
    else if (p === '/api/inventory-counts') data = { list: [] };
    else if (p.includes('/inventory/logs/')) data = { list: [] };
    else if (p === '/api/suppliers') data = { list: [{id:'supplier',name:'UI Supplier'}] };
    else if (p === '/api/suppliers/dropdown') return route.fulfill({status:403,json:{code:403,message:'Not an employee work endpoint'}});
    else if (p === '/api/process-recipes') data = { list: [] };
    else if (p === '/api/hygiene/tasks/my') data = { list: [] };
    else if (p === '/api/training/library') data = { revision: 'ui-test', modules: [course], checklists: [], standardsToConfirm: [] };
    else if (p === '/api/training/my') data = [{ id: 'training', title: 'Official UI Training', trainingType: 'onboarding', startDate: '2026-10-15', status: 'completed', passed: true }];
    else if (p === '/api/training/categories') data = [{ key: 'onboarding', label: 'Onboarding' }];
    else if (p === '/api/leave-types') data = [{ code: 'annual', name: 'Annual Leave', deductBalance: true, requiresProof: false }];
    else if (p === '/api/leave/rules') data = failLeaveRules ? [] : {blockedLeaveWeekdays:[],allowHalfDayLeave:true};
    else if (p === '/api/leave/balance') data = { annualLeave: 12, sickLeave: 12, unpaidLeave: 0, usedLeave: 0 };
    else if (p === '/api/reimbursement-types') data = [{ code: 'transportation', name: 'Transportation', maxAmount: 100000, requiresReceipt: false }];
    else if (p === '/api/staff-points/my') data = { currentPoints: 0, lifetimePoints: 0 };
    else if (p === '/api/staff-points/logs/my') data = { list: [] };
    else if (p === '/api/deposit/staff/my') data = null;
    else if (p === '/api/notifications') data = { list: [] };
    else if (p === '/api/attendance-qr/verify') return route.fulfill({ status: 400, json: { code: 400, message: 'Synthetic invalid QR' } });
    return route.fulfill({ json: { code: method === 'POST' ? 201 : 200, data, ...extra } });
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const origin = 'http://127.0.0.1:5179';
  const routes = ['/', '/inventory', '/inventory?action=in', '/inventory?action=out', '/inventory?action=purchase', '/inventory?action=history', '/inventory?action=process', '/inventory/count', '/hygiene', '/attendance', '/schedule', '/overtime', '/shift-swap', '/attendance/correction', '/attendance/appeals', '/attendance/rules', '/leave', '/reimbursement', '/salary', '/deposit', '/deposit/rules', '/points', '/profile', '/profile/documents', '/announcements', '/training', '/training?tab=records', '/training/library', '/approvals'];
  try {
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      for (const route of routes) {
        await page.goto(origin + route);
        await expect(page.locator('.employee-bottom-nav')).toBeVisible();
        await expect(page.locator('.employee-shell h1, .employee-shell h2, .employee-shell [role=alert]').first()).toBeVisible();
        await expect(page.locator('[role=status]').filter({ hasText: /^Loading\.\.\.$/ })).toHaveCount(0);
        if (['/leave', '/reimbursement', '/overtime', '/attendance/correction', '/shift-swap', '/announcements', '/inventory/count'].includes(route)) {
          await expect(page.locator('.employee-parent-link')).toHaveCount(1);
          await expect(page.locator('header').getByRole('button', {name:'Back',exact:true})).toHaveCount(0);
        }
        await expect.poll(() => page.locator('.employee-shell').innerText()).not.toMatch(/Unexpected Application Error|TypeError|undefined/);
        assert.ok(await page.locator('.employee-shell').evaluate(el => el.scrollWidth <= innerWidth + 1), `${width} ${route}: horizontal overflow`);
      }
      await page.screenshot({ path: path.join(output, `training-library-${width}.jpg`) });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(origin + '/');
    await page.locator('.employee-bottom-nav').getByRole('button', { name: 'Attendance', exact: true }).click();
    await expect(page).toHaveURL(origin + '/attendance');
    await expect(page.locator('a[href="/attendance/correction"]')).toHaveCount(1);
    await expect(page.locator('a[href="/overtime"]')).toHaveCount(1);
    await expect(page.getByText('Jakarta, Indonesia', { exact: true })).toHaveCount(0);
    await expect(page.getByText('00:00', {exact:true})).toBeVisible();
    // Branded primary action and rounded control size, tested against generated CSS.
    await page.goto(origin + '/inventory?action=purchase');
    await expect(page.getByRole('option', {name:'UI Supplier',exact:true})).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const purchaseForm=page.locator('form');
    await purchaseForm.getByLabel('Material', {exact:true}).selectOption('m');
    await purchaseForm.getByLabel('Purchase quantity', {exact:true}).fill('2.3');
    await purchaseForm.getByLabel('Purchase unit', {exact:true}).selectOption('L');
    await purchaseForm.getByLabel('Amount actually paid (Rp)', {exact:true}).fill('160000');
    await expect(purchaseForm).toContainText('69,565.217391');
    await expect(purchaseForm).toContainText('69.565217');
    await purchaseForm.getByRole('button',{name:'Record purchase payment',exact:true}).click();
    await expect.poll(()=>writes.find(w=>w.p==='/api/purchase-orders'&&w.method==='POST')?.data?.items?.[0]).toEqual({inventoryId:'m',quantity:2.3,inputUnit:'L',paidAmount:160000});
    await page.goto(origin + '/inventory/count');
    const count = page.getByRole('button', { name: /Start.*count|New.*count/i });
    await expect(count).toBeEnabled();
    assert.equal(await count.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(236, 109, 136)');
    await count.click(); await expect(page.locator('form')).toBeVisible();
    await page.goto(origin + '/inventory');
    await expect(page.getByText(/88799\.999999/)).toHaveCount(0);
    await page.getByPlaceholder(/Search/i).fill('not-a-material');
    await expect(page.getByText('No data', { exact: true })).toBeVisible();
    await page.goto(origin + '/inventory?action=in');
    await page.getByRole('button', { name: /Test Water.*10 ml/ }).click();
    const receive = page.getByRole('dialog'); await expect(receive).toBeVisible();
    assert.ok(await receive.evaluate(el => Number(getComputedStyle(el).zIndex) > 60));
    assert.equal(await page.locator('#root').evaluate(el => el.inert), true);
    await page.keyboard.press('Escape'); await expect(receive).toHaveCount(0);
    assert.equal(await page.locator('#root').evaluate(el => el.inert), false);
    // Every form dialog can open, scroll and close without losing the session.
    for (const [route, name] of [['/leave', /Apply.*Leave|Request.*Leave/], ['/reimbursement', /Expense|Reimbursement/]]) {
      if(route === '/leave') failLeaveRules=true;
      await page.goto(origin + route); await page.locator('header').getByRole('button', { name }).click();
      const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
      if (route === '/leave') {
        await expect(page.getByRole('alert')).toContainText('Unable to load store leave rules')
        failLeaveRules=false;
        await page.getByRole('button',{name:'Reload',exact:true}).click();
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(page.getByText('No weekday restrictions on leave.',{exact:true})).toBeVisible();
        const date = page.locator('input[data-picker=date]').first();
        await date.fill('15/10/2026'); await date.press('ArrowDown');
        const picker = page.locator('.localized-datetime-panel'); await expect(picker).toBeVisible();
        await page.keyboard.press('Tab');
        assert.equal(await picker.evaluate(el => el.contains(document.activeElement)), true);
        assert.equal(await picker.locator('button[aria-pressed=true]').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(236, 109, 136)');
        await page.keyboard.press('Escape'); await expect(picker).toHaveCount(0);
        assert.equal(await page.locator('#root').evaluate(el => el.inert), true);
        await page.screenshot({path:path.join(output,'leave-dialog-phone.jpg')});
      }
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    }
    await page.goto(origin + '/overtime');
    await page.getByRole('button', { name: 'New Overtime Request', exact: true }).click();
    await page.locator('input[data-picker=date]').fill('15/10/2026'); await page.locator('input[data-picker=date]').press('Tab');
    await page.locator('textarea').fill('UI overtime');
    await page.locator('input[data-picker=time]').first().fill(''); await page.locator('input[data-picker=time]').first().press('Tab');
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
    await page.goto(origin + '/training?tab=records');
    await expect(page.getByText('Official UI Training', { exact: true })).toBeVisible();
    await page.goto(origin + '/training');
    await page.getByText('UI Course', { exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    swapTestEnabled = true;
    await page.goto(origin + '/shift-swap');
    const invitationDialog = page.getByRole('dialog', {name:'Shift swap invitation',exact:true});
    await expect(invitationDialog).toBeVisible();
    await expect(invitationDialog).toContainText('UI Applicant');
    await expect(invitationDialog.getByRole('button',{name:'Agree',exact:true})).toBeVisible();
    await expect(invitationDialog.getByRole('button',{name:'Disagree',exact:true})).toBeVisible();
    await page.screenshot({path:path.join(output,'swap-invitation-phone.jpg')});
    // Deferral keeps the same invitation actionable on its dedicated page.
    await invitationDialog.getByRole('button',{name:'Review later',exact:true}).click();
    await expect(invitationDialog).toHaveCount(0);
    await page.getByRole('button',{name:'Disagree',exact:true}).click();
    await expect(page.getByRole('dialog')).toContainText('Submit this response?');
    await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Colleague declined; request closed'})).toBeVisible();
    assert.ok(writes.some(w=>w.p==='/api/shift-swap/swap-invite/confirm'&&w.data.agree===false&&w.data.expectedVersion==='2026-10-18T10:00:00.000Z'));
    declinedSwap = false;
    await page.reload();
    await expect(invitationDialog).toBeVisible();
    await invitationDialog.getByRole('button',{name:'Agree',exact:true}).click();
    await expect(invitationDialog).toHaveCount(0);
    await expect(page.getByRole('status').filter({hasText:'Colleague agreed; awaiting admin review'})).toBeVisible();
    assert.ok(writes.some(w=>w.p==='/api/shift-swap/swap-invite/confirm'&&w.method==='PUT'&&w.data.agree===true&&w.data.expectedVersion==='2026-10-18T10:00:00.000Z'));
    await page.screenshot({path:path.join(output,'swap-waiting-admin-phone.jpg')});
    editSwapTestEnabled = true;
    await page.reload();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await expect(page.locator('input[data-picker=date]').nth(0)).toHaveValue('15/10/2026');
    await expect(page.locator('input[data-picker=date]').nth(1)).toHaveValue('16/10/2026');
    await expect(page.getByRole('combobox',{name:'Swap with colleague',exact:true})).toHaveValue('colleague');
    await page.getByRole('button',{name:'Submit',exact:true}).click();
    await expect.poll(()=>writes.find(w=>w.p==='/api/shift-swap/edit-swap'&&w.method==='PUT')?.data?.originalDate).toBe('2026-10-15');
    assert.equal(writes.find(w=>w.p==='/api/shift-swap/edit-swap'&&w.method==='PUT').data.targetDate,'2026-10-16');
    editSwapTestEnabled = false;

    await page.goto(origin + '/profile/documents');
    await page.getByRole('button', {name:'View file',exact:true}).click();
    await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('link', {name:'Download file'})).toHaveAttribute('download', 'document.png');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto(origin + '/salary');
    await expect(page.getByText(/salary profile is incomplete|salary profile needs a base salary|salary details are incomplete/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Previous month/i })).toBeEnabled();
    failInventory = true; await page.goto(origin + '/inventory');
    await expect(page.getByRole('alert')).toBeVisible(); failInventory = false;
    await page.getByRole('button', { name: /Retry/i }).click(); await expect(page.getByRole('alert')).toHaveCount(0);
    await page.goto(origin + '/profile');
    await page.getByRole('button', { name: /Change Password/ }).click(); await expect(page.locator('form')).toBeVisible();
    await page.getByRole('button', { name: /Change Password/ }).click(); await expect(page.locator('form')).toHaveCount(0);
    assert.deepEqual(errors, []);
    assert.ok(!writes.some(w => w.p === '/api/auth/password'), 'Never change any real account password');
    console.log('PASS staff UI: 29 routes at 375/768/1440, navigation, stock search/error recovery, count branding, receive/leave/expense/course dialogs, focus, Escape, overtime validation, official training and missing salary setup.');
  } finally { await context.close(); }
};
