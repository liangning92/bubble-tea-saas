const path = require('path');

const WORKDIR = __dirname;

module.exports = {
  apps: [
    {
      name: 'tea-server',
      script: 'npm',
      args: 'run dev',
      cwd: path.join(WORKDIR, 'server'),
      interpreter: 'none',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'development',
        PORT: '7072',
      },
      error_file: '../logs/tea-server-err.log',
      out_file: '../logs/tea-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'tea-admin',
      script: path.join(WORKDIR, 'client-admin', 'node_modules', '.bin', 'vite'),
      args: '--port 5173',
      cwd: path.join(WORKDIR, 'client-admin'),
      interpreter: 'none',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'development',
      },
      error_file: '../logs/tea-admin-err.log',
      out_file: '../logs/tea-admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'tea-pos',
      script: path.join(WORKDIR, 'client-pos', 'node_modules', '.bin', 'vite'),
      args: '--port 6063',
      cwd: path.join(WORKDIR, 'client-pos'),
      interpreter: 'none',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'development',
      },
      error_file: '../logs/tea-pos-err.log',
      out_file: '../logs/tea-pos-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
