#!/usr/bin/env bash
# Script to anonymize Git commit history
# Changes author name and email in all commits

set -euo pipefail

echo "🔒 Anonymizing Git commit history..."
echo ""
echo "This will rewrite ALL commit history to remove personal information."
echo "Current author: Anonymous Developer <developer@example.com>"
echo "New author: Anonymous Developer <developer@example.com>"
echo ""
read -p "Are you sure you want to proceed? (yes/no): " confirm

if [[ "$confirm" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

echo ""
echo "Rewriting commit history..."

# Use git filter-branch to change author info
git filter-branch --force --env-filter '
OLD_EMAIL="developer@example.com"
NEW_NAME="Anonymous Developer"
NEW_EMAIL="developer@example.com"

if [ "$GIT_COMMITTER_EMAIL" = "$OLD_EMAIL" ]; then
  export GIT_COMMITTER_NAME="$NEW_NAME"
  export GIT_COMMITTER_EMAIL="$NEW_EMAIL"
fi
if [ "$GIT_AUTHOR_EMAIL" = "$OLD_EMAIL" ]; then
  export GIT_AUTHOR_NAME="$NEW_NAME"
  export GIT_AUTHOR_EMAIL="$NEW_EMAIL"
fi
' --tag-name-filter cat -- --branches --tags

echo ""
echo "✅ Commit history anonymized!"
echo ""
echo "Next steps:"
echo "1. Review changes: git log --all --format='%an <%ae>' | sort -u"
echo "2. Force push: git push --force --all origin"
echo "3. Force push tags: git push --force --tags origin"
echo ""
echo "⚠️  WARNING: This will rewrite ALL history on the remote!"
echo ""
