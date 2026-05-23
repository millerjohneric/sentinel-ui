#!/bin/bash
# Launch Sentinel UI - macOS/Linux version
# This script starts the web interface for Sentinel Media Sync

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   Sentinel Media Sync - Web UI Launcher║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo ""
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✓ Node.js found: $NODE_VERSION"

# Check if node_modules exists
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    cd "$SCRIPT_DIR"
    npm install
    echo "✓ Dependencies installed"
fi

# Start the server
echo ""
echo "🚀 Starting Sentinel UI Server..."
echo "   Opening http://localhost:3000 in your browser..."
echo ""

cd "$SCRIPT_DIR"

if [[ "$1" == "-dev" || "$1" == "--dev" ]]; then
    echo "📝 Development mode (auto-reload enabled)"
    npm run dev
else
    npm start
fi
