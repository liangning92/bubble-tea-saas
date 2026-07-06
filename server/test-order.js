// 测试订单创建流程
const axios = require('axios');

async function testCreateOrder() {
  const apiUrl = 'http://localhost:7072';

  try {
    // 1. 先登录获取 token
    console.log('=== 1. Login ===');
    const loginRes = await axios.post(`${apiUrl}/api/auth/login`, {
      phone: '081234567890',
      password: 'admin123'
    });
    const token = loginRes.data?.data?.token;
    console.log('Token:', token ? ' obtained' : ' NOT obtained');

    if (!token) {
      console.log('Login failed:', loginRes.data);
      return;
    }

    // 2. 创建订单（关闭税费）
    console.log('\n=== 2. Create Order (taxEnabled: false) ===');
    const orderData = {
      storeId: 'default',
      staffId: 'default',
      channelId: 'POS',
      items: [{
        productId: 'test-p1',
        productName: '测试产品',
        specId: 'test-s1',
        specName: '常规',
        quantity: 1,
        unitPrice: 10000,
        addons: []
      }],
      paymentMethod: 'cash',
      discountAmount: 0,
      pointsRedeemed: 0,
      taxEnabled: false,  // 明确关闭税费
      customerCount: 1
    };

    console.log('Request data:', JSON.stringify(orderData, null, 2));

    const createRes = await axios.post(`${apiUrl}/api/orders`, orderData, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('\n=== 3. Create Order Response ===');
    console.log('Status:', createRes.status);
    console.log('Data:', JSON.stringify(createRes.data, null, 2));

    const orderNumber = createRes.data?.data?.orderNumber;

    // 3. 查询刚创建的订单
    console.log('\n=== 4. Query Order ===');
    const getRes = await axios.get(`${apiUrl}/api/orders?storeId=default&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Latest order:', JSON.stringify(getRes.data?.data?.list?.[0], null, 2));

  } catch (error) {
    console.error('\n=== Error ===');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
  }
}

testCreateOrder();
