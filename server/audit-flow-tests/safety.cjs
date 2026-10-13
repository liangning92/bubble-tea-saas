const url=process.env.DATABASE_URL||'';
if(!/^file:\/tmp\/bubble-inventory-flow-[A-Za-z0-9_-]+\/test.db$/.test(url)&&!/^postgresql:\/\/audit@localhost:55439\/bubble_inventory_flow_test\?host=\/tmp\/bubble-inventory-flow-[A-Za-z0-9_-]+\/socket$/.test(url))throw Error('Only task-owned disposable inventory test databases allowed');
process.env.CORS_ORIGIN='http://127.0.0.1';process.env.NODE_ENV='test';process.env.JWT_SECRET='inventory-flow-synthetic-test-secret-only';
global.fetch=()=>{throw Error('INVENTORY_TEST_EXTERNAL_NETWORK_FORBIDDEN')};
