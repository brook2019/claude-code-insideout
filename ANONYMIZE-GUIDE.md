# Personal Information Removal Guide

## 🔍 Personal Information Found

Your personal information appears in:

1. **Git Commit History** (31 commits)
   - Author name: `Anonymous Developer`
   - Author email: `developer@example.com`

2. **Files** (Fixed in working directory)
   - ✅ `docs/dashboard-quickstart.md` - Path changed to generic

## 🛡️ Anonymization Options

### Option 1: Use git-filter-repo (Recommended - Fast & Safe)

```bash
# Install git-filter-repo
pip3 install git-filter-repo

# Create mailmap file
cat > .mailmap << 'EOF'
Anonymous Developer <developer@example.com> Anonymous Developer <developer@example.com>
EOF

# Rewrite history using mailmap
git filter-repo --mailmap .mailmap --force

# Update remote
git remote add origin git@github.com:brook2019/claude-code-insideout.git
git push --force origin main
```

### Option 2: Use BFG Repo-Cleaner + Manual Filter

```bash
# Install BFG
brew install bfg

# First, clean secrets (from previous security audit)
cat > replacements.txt << 'EOF'
sk-REDACTED==>sk-REDACTED
your-gateway-url==>your-gateway-url
developer@example.com==>developer@example.com
Anonymous Developer==>Anonymous Developer
EOF

bfg --replace-text replacements.txt

# Then anonymize commits
git filter-branch --force --env-filter '
if [ "$GIT_AUTHOR_EMAIL" = "developer@example.com" ]; then
  export GIT_AUTHOR_NAME="Anonymous Developer"
  export GIT_AUTHOR_EMAIL="developer@example.com"
fi
if [ "$GIT_COMMITTER_EMAIL" = "developer@example.com" ]; then
  export GIT_COMMITTER_NAME="Anonymous Developer"
  export GIT_COMMITTER_EMAIL="developer@example.com"
fi
' --tag-name-filter cat -- --branches --tags

# Cleanup
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push --force origin main
```

### Option 3: Simple Script (Provided)

```bash
# Use the anonymization script
./scripts/anonymize-commits.sh

# Follow the prompts
# Then force push
git push --force origin main
```

### Option 4: Fresh Repository (Nuclear - Loses all history)

```bash
# Create new orphan branch
git checkout --orphan clean-main

# Add all files
git add -A

# First commit with anonymous identity
git -c user.name="Anonymous Developer" \
    -c user.email="developer@example.com" \
    commit -m "Initial commit"

# Replace main
git branch -D main
git branch -m main

# Force push
git push --force origin main
```

## 📋 Complete Anonymization Checklist

### Step 1: Clean Current Files ✅ DONE
- [x] Remove personal paths from `docs/dashboard-quickstart.md`
- [x] Create anonymization scripts

### Step 2: Clean Git History
- [ ] Choose anonymization method (1, 2, 3, or 4)
- [ ] Run anonymization script/commands
- [ ] Verify anonymization: `git log --all --format='%an <%ae>' | sort -u`
- [ ] Should see only: `Anonymous Developer <developer@example.com>` for your commits

### Step 3: Clean Secrets (From Security Audit)
- [ ] Remove API token from history
- [ ] Remove Salesforce gateway URL from history

### Step 4: Force Push
- [ ] `git push --force origin main`
- [ ] Verify on GitHub that history is clean

### Step 5: Update Local Git Config
```bash
# For future commits in this repo only
git config user.name "Anonymous Developer"
git config user.email "developer@example.com"

# Or globally
git config --global user.name "Anonymous Developer"
git config --global user.email "developer@example.com"
```

## 🎯 Recommended: Combined Anonymization + Security Fix

Do BOTH anonymization AND security fixes in one pass:

```bash
# Install git-filter-repo
pip3 install git-filter-repo

# Create comprehensive replacements
cat > replacements.txt << 'EOF'
# Security: Remove secrets
sk-REDACTED==>sk-REDACTED
your-gateway-url==>your-gateway-url

# Privacy: Remove personal info
developer@example.com==>developer@example.com
Anonymous Developer==>Anonymous Developer
/path/to/==>/path/to/
EOF

# Apply replacements
git filter-repo --replace-text replacements.txt --force

# Create mailmap for commit author/committer
cat > .mailmap << 'EOF'
Anonymous Developer <developer@example.com> Anonymous Developer <developer@example.com>
EOF

git filter-repo --mailmap .mailmap --force

# Re-add remote
git remote add origin git@github.com:brook2019/claude-code-insideout.git

# Force push
git push --force origin main
```

## ✅ Verification Steps

After anonymization, verify everything is clean:

```bash
# 1. Check commit authors
git log --all --format='%an <%ae>' | sort -u
# Should NOT show: Anonymous Developer <developer@example.com>

# 2. Search for personal email in history
git log --all -S "developer@example.com"
# Should return no results

# 3. Search for personal name in history
git log --all -S "Anonymous Developer"
# Should return no results

# 4. Search in current files
grep -r "jingfengli\|Anonymous Developer" --exclude-dir=.git .
# Should return no results

# 5. Check for secrets
git log --all -S "sk-REDACTED"
# Should return no results
```

## ⚠️ Important Notes

1. **Backup First**: Create a backup before rewriting history
   ```bash
   git clone --mirror . ../claude-code-insideout-backup.git
   ```

2. **Force Push Required**: All history rewriting requires force push
   - This is **destructive** - remote history will be overwritten
   - Only safe if you're the sole contributor

3. **Collaborators**: If others have cloned your repo:
   - They'll need to re-clone after you force push
   - Their local history will be incompatible

4. **API Token**: After cleaning, generate a new API token:
   - The old token `sk-REDACTED` was exposed
   - Update `.env` with new token

## 📊 Status

### Current State
- ✅ Files cleaned (working directory)
- ⚠️ Git history still contains personal info
- ⚠️ Git history still contains secrets

### After Anonymization
- ✅ Files cleaned
- ✅ Git history anonymized
- ✅ Secrets removed from history
- ✅ Safe to share publicly

## 🎬 Quick Start (Recommended Path)

```bash
# 1. Install git-filter-repo
pip3 install git-filter-repo

# 2. Run combined fix
cat > /tmp/replacements.txt << 'EOF'
sk-REDACTED==>sk-REDACTED
your-gateway-url==>your-gateway-url
developer@example.com==>developer@example.com
Anonymous Developer==>Anonymous Developer
/path/to/==>/path/to/
EOF

git filter-repo --replace-text /tmp/replacements.txt --force

# 3. Re-add remote and push
git remote add origin git@github.com:brook2019/claude-code-insideout.git
git push --force origin main

# 4. Update local config for future commits
git config user.name "Anonymous Developer"
git config user.email "developer@example.com"

# 5. Done! ✅
```

---

**Created**: 2026-05-04  
**Purpose**: Remove personal information from public repository
