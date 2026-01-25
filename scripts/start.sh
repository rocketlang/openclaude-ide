#!/bin/bash
#
# OpenClaude IDE - Start Script
# Starts all OpenClaude services using PM2
#

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting OpenClaude IDE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Installing..."
    npm install -g pm2
fi

# Create log directory
echo "📁 Creating log directory..."
sudo mkdir -p /var/log/openclaude
sudo chown -R $USER:$USER /var/log/openclaude

# Check if .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "⚠️  Warning: .env file not found. Copying from .env.example..."
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "⚠️  Please edit .env with your configuration before production use!"
fi

# Start services
cd "$PROJECT_DIR"
echo ""
echo "🚀 Starting services with PM2..."
pm2 start ecosystem.config.js

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ OpenClaude IDE Started Successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Service Status:"
pm2 list

echo ""
echo "🌐 Access Points:"
echo "   IDE:        http://localhost:5200"
echo "   GraphQL:    http://localhost:4000/graphql"
echo ""
echo "📝 Useful Commands:"
echo "   View logs:      pm2 logs"
echo "   Monitor:        pm2 monit"
echo "   Stop:           pm2 stop ecosystem.config.js"
echo "   Restart:        pm2 restart ecosystem.config.js"
echo "   Save (autorun): pm2 save && pm2 startup"
echo ""
