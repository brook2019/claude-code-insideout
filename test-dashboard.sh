#!/usr/bin/env bash
# Test script for dashboard command

set -euo pipefail

echo "Testing dashboard command..."
echo ""

# Test 1: Check command loads
echo "✓ Test 1: Checking command loads..."
bun -e "import('./src/commands/dashboard/index.ts').then(m => {
  if (!m.default || m.default.name !== 'dashboard') {
    console.error('✗ Command not loaded correctly');
    process.exit(1);
  }
  console.log('✓ Dashboard command loads');
}).catch(e => { console.error('✗ Error:', e.message); process.exit(1); })"

# Test 2: Check command in registry
echo "✓ Test 2: Checking command in registry..."
bun -e "import('./src/commands.ts').then(m => {
  const cmds = m.builtInCommandNames();
  if (!cmds.has('dashboard')) {
    console.error('✗ Dashboard not in command registry');
    process.exit(1);
  }
  console.log('✓ Dashboard in command registry');
}).catch(e => { console.error('✗ Error:', e.message); process.exit(1); })"

# Test 3: Test command execution
echo "✓ Test 3: Testing command execution..."
export DASHBOARD_NO_OPEN=1
export DASHBOARD_PORT=8767

# Start dashboard and capture result
RESULT=$(bun -e "
import('./src/commands/dashboard/dashboard.ts').then(async m => {
  const result = await m.call('', {});
  console.log(result.value);
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
" 2>&1)

if [[ $RESULT == *"Dashboard is now running"* ]]; then
  echo "✓ Dashboard command executes successfully"
else
  echo "✗ Dashboard command failed"
  echo "$RESULT"
  exit 1
fi

# Test 4: Check dashboard UI is accessible
echo "✓ Test 4: Checking dashboard UI..."
sleep 1
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8767/ || echo "000")

if [[ $HTTP_STATUS == "200" ]]; then
  echo "✓ Dashboard UI is accessible at http://localhost:8767"
else
  echo "✗ Dashboard UI not accessible (HTTP $HTTP_STATUS)"
  exit 1
fi

# Cleanup
pkill -f "bun.*dashboard" 2>/dev/null || true

echo ""
echo "=========================================="
echo "✓ All tests passed!"
echo "=========================================="
echo ""
echo "To use the dashboard:"
echo "  1. Start Claude Code: ./bin/claude-code-insideout"
echo "  2. Run command: /dashboard"
echo "  3. Open browser to: http://localhost:8765"
echo ""
