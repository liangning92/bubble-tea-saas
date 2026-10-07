process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/audit_test';
// Fail closed: no test may open a network socket or call payment/messaging providers.
const deny = () => { throw new Error('AUDIT_NETWORK_FORBIDDEN'); };
require('node:net').Socket.prototype.connect = deny;
global.fetch = deny;
