const url = new URL(process.env.DATABASE_URL || 'invalid:');
const socket = url.searchParams.get('host');
if (url.protocol !== 'postgresql:' || url.hostname !== 'localhost' || url.port !== '55439' ||
    url.pathname !== '/bubble_audit_test' || url.username !== 'audit' || url.password ||
    !/^\/tmp\/bubble-audit-pg\.[A-Za-z0-9]+\/socket$/.test(socket || '')) {
 throw new Error('Refusing to run: only the task-owned temporary Unix-socket PostgreSQL is allowed');
}
process.env.NODE_ENV = 'production'; // Skip dotenv entirely.
process.env.JWT_SECRET = 'synthetic-audit-only-not-used-for-authentication';
process.env.CORS_ORIGIN = 'http://127.0.0.1';
global.fetch = () => { throw new Error('AUDIT_EXTERNAL_NETWORK_FORBIDDEN'); };
const deny = () => { throw new Error('AUDIT_NODE_NETWORK_FORBIDDEN'); };
require('node:net').Socket.prototype.connect = deny;
