process.env.NODE_ENV='production';
process.env.CORS_ORIGIN='http://127.0.0.1';
process.env.JWT_SECRET='synthetic-sqlite-audit-secret-at-least-32-bytes';
const deny=()=>{throw new Error('SQLITE_AUDIT_NETWORK_FORBIDDEN')};
global.fetch=deny;
require('node:net').Socket.prototype.connect=deny;
require('node:http').request=deny;
require('node:https').request=deny;
