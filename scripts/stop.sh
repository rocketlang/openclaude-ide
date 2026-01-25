#!/bin/bash
#
# OpenClaude IDE - Stop Script
# Stops all OpenClaude services
#

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Stopping OpenClaude IDE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PROJECT_DIR"

# Stop services
echo "🛑 Stopping services..."
pm2 stop ecosystem.config.js

echo ""
echo "📊 Service Status:"
pm2 list

echo ""
echo "✅ OpenClaude IDE stopped successfully!"
echo ""
