#!/bin/bash

# Start GitHub MCP Server Inspector for SAP GitHub Enterprise
# This script sets up the environment and starts the MCP inspector

echo "🚀 Starting GitHub MCP Server Inspector"
echo "📍 SAP GitHub Enterprise: https://github.tools.sap/"
echo "👤 User: your-username"
echo ""

# Set environment variables
export GITHUB_TOKEN="<YOUR_GITHUB_TOKEN>"
export GITHUB_API_URL="https://github.tools.sap/api/v3"
export GITHUB_DEFAULT_OWNER="your-username"

# Build the project first
echo "🔨 Building project..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "🔍 Starting MCP Inspector..."
    echo "   You can test the following tools:"
    echo ""
    echo "   📋 GitHub API Tools:"
    echo "   - get_current_user"
    echo "   - list_repositories" 
    echo "   - create_issue"
    echo "   - create_pull_request"
    echo ""
    echo "   🔧 Basic Git Operations:"
    echo "   - git_status"
    echo "   - git_add"
    echo "   - git_commit"
    echo "   - git_push"
    echo "   - git_pull"
    echo "   - git_clone"
    echo ""
    echo "   🌿 Branch Management:"
    echo "   - git_branch (create/list/delete)"
    echo ""
    echo "   📊 History & Information:"
    echo "   - git_log"
    echo "   - git_show"
    echo "   - git_diff"
    echo "   - git_contributors"
    echo ""
    echo "   🚀 Advanced Operations:"
    echo "   - git_stash (push/pop/list)"
    echo "   - git_reset (soft/mixed/hard)"
    echo "   - git_tag (create/list/delete/push)"
    echo "   - git_remote (add/remove/list)"
    echo ""
    
    # Start the inspector
    npx @modelcontextprotocol/inspector dist/index.js
else
    echo "❌ Build failed!"
    exit 1
fi
