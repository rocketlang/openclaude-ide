#!/bin/bash
#
# OpenClaude IDE - Restart Script
# Restarts all OpenClaude services
#

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Restarting OpenClaude IDE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PROJECT_DIR"

# Restart services
echo "🔄 Restarting services..."
pm2 restart ecosystem.config.js

echo ""
echo "📊 Service Status:"
pm2 list

echo ""
echo "✅ OpenClaude IDE restarted successfully!"
echo ""
echo "🌐 Access Points:"
echo "   IDE:        http://localhost:5200"
echo "   GraphQL:    http://localhost:4000/graphql"
echo ""
