const axios = require('axios');

async function main() {
  console.log('🔧 添加测试数据...\n');
  
  // 1. 登录获取token
  console.log('1. 登录...');
  const loginRes = await axios.post('http://localhost:7072/api/auth/login', {
    phone: '081234567890',
    password: 'admin123'
  });
  const token = loginRes.data.data.token;
  const staffId = loginRes.data.data.user.staffId;
  const storeId = loginRes.data.data.user.storeId;
  const headers = { Authorization: `Bearer ${token}` };
  console.log('   ✅ 登录成功，staffId:', staffId);
  
  // 2. 签到
  console.log('\n2. 签到...');
  try {
    const today = new Date().toISOString().slice(0, 10);
    await axios.post('http://localhost:7072/api/staff/attendance', {
      type: 'check_in',
      date: today,
      gpsLocation: 'Jakarta'
    }, { headers });
    console.log('   ✅ 签到成功');
  } catch (e) {
    console.log('   ⚠️ 签到:', e.response?.data?.message || e.message);
  }
  
  // 3. 请假申请
  console.log('\n3. 申请请假...');
  try {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const startDate = nextWeek.toISOString().slice(0, 10);
    nextWeek.setDate(nextWeek.getDate() + 2);
    const endDate = nextWeek.toISOString().slice(0, 10);
    
    await axios.post('http://localhost:7072/api/leave/apply', {
      leaveType: 'annual',
      startDate,
      endDate,
      totalDays: 2,
      reason: '家中有事'
    }, { headers });
    console.log('   ✅ 请假申请成功');
  } catch (e) {
    console.log('   ⚠️ 请假申请:', e.response?.data?.message || e.message);
  }
  
  // 4. 报销申请
  console.log('\n4. 申请报销...');
  try {
    await axios.post('http://localhost:7072/api/reimbursement/apply', {
      type: 'transportation',
      amount: 50000,
      description: '外出采购交通费'
    }, { headers });
    console.log('   ✅ 报销申请成功');
  } catch (e) {
    console.log('   ⚠️ 报销申请:', e.response?.data?.message || e.message);
  }
  
  // 5. 加班申请
  console.log('\n5. 申请加班...');
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await axios.post('http://localhost:7072/api/overtime', {
      date: tomorrow.toISOString().slice(0, 10),
      hours: 3,
      reason: '紧急订单处理'
    }, { headers });
    console.log('   ✅ 加班申请成功');
  } catch (e) {
    console.log('   ⚠️ 加班申请:', e.response?.data?.message || e.message);
  }
  
  // 6. 调班申请
  console.log('\n6. 申请调班...');
  try {
    const thisWeek = new Date();
    const nextWeek2 = new Date();
    nextWeek2.setDate(nextWeek2.getDate() + 7);
    await axios.post('http://localhost:7072/api/shift-swap', {
      originalDate: thisWeek.toISOString().slice(0, 10),
      originalShift: 'morning',
      targetDate: nextWeek2.toISOString().slice(0, 10),
      targetShift: 'afternoon',
      reason: '有事需调换'
    }, { headers });
    console.log('   ✅ 调班申请成功');
  } catch (e) {
    console.log('   ⚠️ 调班申请:', e.response?.data?.message || e.message);
  }
  
  // 7. 考勤纠错申请
  console.log('\n7. 申请考勤纠错...');
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await axios.post('http://localhost:7072/api/staff-correction', {
      date: yesterday.toISOString().slice(0, 10),
      correctCheckIn: '09:00',
      correctCheckOut: '18:00',
      reason: '忘记签到'
    }, { headers });
    console.log('   ✅ 考勤纠错申请成功');
  } catch (e) {
    console.log('   ⚠️ 考勤纠错:', e.response?.data?.message || e.message);
  }
  
  console.log('\n═══════════════════════════════════════════════');
  console.log('   测试数据添加完成！');
  console.log('═══════════════════════════════════════════════\n');
}

main().catch(console.error);
