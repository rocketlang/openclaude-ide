/**
 * PM2 Ecosystem Configuration for OpenClaude IDE
 *
 * Start all services:  pm2 start ecosystem.config.js
 * Stop all:            pm2 stop ecosystem.config.js
 * Restart all:         pm2 restart ecosystem.config.js
 * View logs:           pm2 logs
 * Monitor:             pm2 monit
 */

module.exports = {
  apps: [
    // ========================================================================
    // OpenClaude GraphQL Backend
    // ========================================================================
    {
      name: 'openclaude-backend',
      script: 'node',
      args: 'server.js',
      cwd: '/tmp/claude/-root/9cd484e6-d30a-45a9-ad7c-7ec2b1115731/scratchpad/mock-graphql-server',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      error_file: '/var/log/openclaude/backend-error.log',
      out_file: '/var/log/openclaude/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
    },

    // ========================================================================
    // OpenClaude IDE Frontend
    // ========================================================================
    {
      name: 'openclaude-ide',
      script: 'npm',
      args: 'start',
      cwd: '/root/openclaude-ide/examples/browser',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5200,
        OPENCLAUDE_BACKEND_URL: 'http://localhost:4000/graphql',
      },
      error_file: '/var/log/openclaude/ide-error.log',
      out_file: '/var/log/openclaude/ide-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      max_memory_restart: '2G',
      watch: false,
      ignore_watch: ['node_modules', 'lib', 'logs', '*.log'],
    },
  ],
};
