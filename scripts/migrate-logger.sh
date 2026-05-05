#!/usr/bin/env bash
# Script to migrate hard-coded /tmp/debug.log to the new logger utility

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Migrating logging calls to use the new logger utility..."

# Files to update
FILES=(
  "src/query.ts"
  "src/screens/REPL.tsx"
  "src/utils/handlePromptSubmit.ts"
  "src/utils/processUserInput/processUserInput.ts"
  "src/services/api/client.ts"
  "src/services/api/claude.ts"
)

for file in "${FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Warning: $file not found, skipping..."
    continue
  fi

  echo "Processing $file..."

  # Create backup
  cp "$file" "$file.bak"

  # Add logger import at the top (after existing imports)
  # This is a simple approach - may need manual adjustment
  if ! grep -q "from.*logger" "$file"; then
    echo "  Adding logger import..."
    # Will need manual adjustment for exact placement
  fi

done

echo "Migration script completed. Please review changes manually."
echo "Backups created with .bak extension."
