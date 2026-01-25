# OpenClaude IDE - Deployment Guide

Complete guide for deploying and managing OpenClaude IDE in production.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Starting Services](#starting-services)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Backup & Recovery](#backup--recovery)

---

## Prerequisites

### System Requirements

- **OS:** Linux (Ubuntu 20.04+ or similar)
- **Node.js:** 20.x or higher
- **RAM:** Minimum 4GB, Recommended 8GB+
- **Disk:** Minimum 10GB free space
- **PostgreSQL:** 13+ (for persistence)
- **Redis:** 6+ (optional, for caching)

### Software Dependencies

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Install Redis (optional)
sudo apt-get install -y redis-server
```

---

## Installation

### 1. Clone Repository

```bash
cd /root
git clone https://github.com/ankr-in/openclaude-ide.git
cd openclaude-ide
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install

# Bootstrap packages (Lerna)
npm run bootstrap
```

### 3. Build Project

```bash
# Development build
npm run build

# Production build (optimized)
npm run build:production
```

---

## Configuration

### 1. Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

**Important variables to configure:**

```bash
# Server
PORT=5200
BACKEND_PORT=5201

# GraphQL Backend
OPENCLAUDE_BACKEND_URL=http://localhost:4000/graphql

# Database
DATABASE_URL=postgresql://ankr:YOUR_PASSWORD@localhost:5432/openclaude

# AI Services
ANTHROPIC_API_KEY=sk-ant-YOUR_API_KEY_HERE
AI_PROXY_URL=http://localhost:4444

# Security
SESSION_SECRET=GENERATE_RANDOM_STRING_HERE
AUTH_ENABLED=false  # Set to true for production

# Logging
LOG_LEVEL=info
LOG_DIR=/var/log/openclaude
```

### 2. Database Setup

```bash
# Create database
sudo -u postgres psql -c "CREATE DATABASE openclaude;"

# Create user (if needed)
sudo -u postgres psql -c "CREATE USER ankr WITH PASSWORD 'YOUR_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE openclaude TO ankr;"

# Run migrations (when available)
# npm run db:migrate
```

### 3. Log Directory

```bash
# Create log directory
sudo mkdir -p /var/log/openclaude
sudo chown -R $USER:$USER /var/log/openclaude
```

---

## Starting Services

### Quick Start

```bash
# Start all services
./scripts/start.sh
```

### Manual Start (PM2)

```bash
# Start with PM2
pm2 start ecosystem.config.js

# View status
pm2 list

# View logs
pm2 logs

# Monitor
pm2 monit
```

### Manual Start (Individual Services)

```bash
# Terminal 1: Start GraphQL Backend
cd /tmp/claude/-root/9cd484e6-d30a-45a9-ad7c-7ec2b1115731/scratchpad/mock-graphql-server
npm start

# Terminal 2: Start IDE
cd /root/openclaude-ide/examples/browser
npm start
```

### Enable Autostart on Boot

```bash
# Save PM2 process list
pm2 save

# Generate and configure startup script
pm2 startup

# Follow the instructions printed by PM2
```

---

## Monitoring

### Health Checks

```bash
# Check service status
./scripts/status.sh

# Manual health checks
curl http://localhost:4000/graphql  # GraphQL Backend
curl http://localhost:5200          # IDE Frontend
```

### Logs

```bash
# View all logs
pm2 logs

# View specific service logs
pm2 logs openclaude-backend
pm2 logs openclaude-ide

# Tail log files directly
tail -f /var/log/openclaude/backend-out.log
tail -f /var/log/openclaude/ide-out.log
```

### Resource Usage

```bash
# PM2 monitoring
pm2 monit

# System resources
htop

# Disk usage
df -h

# Memory usage
free -h
```

### Metrics

OpenClaude IDE exports metrics on port 9090 (configurable).

```bash
# View metrics
curl http://localhost:9090/metrics
```

---

## Service Management

### Using Scripts

```bash
# Start services
./scripts/start.sh

# Stop services
./scripts/stop.sh

# Restart services
./scripts/restart.sh

# Check status
./scripts/status.sh
```

### Using PM2 Directly

```bash
# Start
pm2 start ecosystem.config.js

# Stop
pm2 stop ecosystem.config.js

# Restart
pm2 restart ecosystem.config.js

# Delete
pm2 delete ecosystem.config.js

# Reload (zero-downtime)
pm2 reload ecosystem.config.js
```

### Using ANKR-CTL

```bash
# Start backend
ankr-ctl start openclaude-backend

# Start IDE
ankr-ctl start openclaude-ide

# Check status
ankr-ctl status openclaude

# View logs
ankr-ctl logs openclaude
```

---

## Troubleshooting

### Service Won't Start

**Check logs:**
```bash
pm2 logs openclaude-backend --err
pm2 logs openclaude-ide --err
```

**Common issues:**
- Port already in use: `lsof -i :4000` or `lsof -i :5200`
- Missing dependencies: `npm install`
- Database not accessible: Check `DATABASE_URL` in `.env`
- Permissions: Check log directory permissions

### High Memory Usage

```bash
# Check memory usage
pm2 show openclaude-ide

# Restart service
pm2 restart openclaude-ide

# Adjust max memory in ecosystem.config.js
# max_memory_restart: '2G'
```

### GraphQL Connection Errors

**Check backend is running:**
```bash
curl http://localhost:4000/graphql
```

**Test GraphQL query:**
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ ping }"}'
```

**Verify environment variable:**
```bash
# In .env file
OPENCLAUDE_BACKEND_URL=http://localhost:4000/graphql
```

### Build Failures

```bash
# Clean build
npm run clean

# Rebuild
npm run build

# Check Node.js version
node --version  # Should be 20.x+
```

### Port Conflicts

```bash
# Find process using port
lsof -i :5200

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=5201
```

---

## Backup & Recovery

### Database Backup

```bash
# Backup database
pg_dump -U ankr openclaude > openclaude-backup-$(date +%Y%m%d).sql

# Restore database
psql -U ankr openclaude < openclaude-backup-20260124.sql
```

### Configuration Backup

```bash
# Backup configuration
tar -czf openclaude-config-$(date +%Y%m%d).tar.gz \
  .env \
  ecosystem.config.js \
  /var/log/openclaude
```

### Full Backup

```bash
# Backup everything
tar -czf openclaude-full-$(date +%Y%m%d).tar.gz \
  /root/openclaude-ide \
  /var/log/openclaude \
  --exclude=node_modules \
  --exclude=lib \
  --exclude=.git
```

---

## Performance Tuning

### Node.js Memory

Edit `.env`:
```bash
NODE_MAX_OLD_SPACE_SIZE=4096  # 4GB
```

### PM2 Cluster Mode

For production, consider cluster mode in `ecosystem.config.js`:
```javascript
{
  name: 'openclaude-ide',
  instances: 2,  # or 'max' for all CPUs
  exec_mode: 'cluster',
  // ...
}
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name openclaude.yourdomain.com;

    location / {
        proxy_pass http://localhost:5200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /graphql {
        proxy_pass http://localhost:4000/graphql;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

## Security Checklist

- [ ] Change default passwords
- [ ] Generate random SESSION_SECRET
- [ ] Enable AUTH_ENABLED in production
- [ ] Configure CORS properly
- [ ] Set up SSL/TLS certificates
- [ ] Enable rate limiting
- [ ] Review and restrict CORS_ORIGIN
- [ ] Regular security updates
- [ ] Firewall configuration
- [ ] Database access restrictions

---

## Updating

### Update Dependencies

```bash
# Update packages
npm update

# Rebuild
npm run build:production

# Restart services
pm2 restart ecosystem.config.js
```

### Update to New Version

```bash
# Pull latest changes
git pull origin master

# Install dependencies
npm install

# Rebuild
npm run build:production

# Restart
pm2 restart ecosystem.config.js
```

---

## Support

- **Documentation:** `/root/openclaude-ide/docs/`
- **Issues:** GitHub Issues
- **Email:** dev@ankr.in
- **Website:** https://ankr.in/opencode

---

**Last Updated:** January 24, 2026
**Version:** 1.0.0-beta
