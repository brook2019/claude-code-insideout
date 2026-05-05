# Security Audit Report

**Date**: 2026-05-04  
**Audited By**: Claude (Anthropic AI Assistant)  
**Repository**: claude-code-insideout

---

## 🔍 Summary

Comprehensive security audit of all committed files revealed **sensitive information** that needs to be removed from Git history.

---

## 🚨 Security Issues Found

### CRITICAL Issues (Fixed in current version, but in Git history)

#### 1. Salesforce Internal Gateway URL
**File**: `bin/claude-code-insideout`  
**Commits**: bb54cf5 and earlier  
**Issue**: Exposed internal Salesforce gateway URL  
```
export ANTHROPIC_BEDROCK_BASE_URL=https://your-gateway-url/bedrock
```
**Risk**: Internal infrastructure exposure  
**Status**: ✅ Fixed in commit 762efdc (current HEAD)

#### 2. Partial API Token Exposure
**File**: `docs/bedrock-conversion-flow.md`  
**Line**: 204  
**Issue**: Partial API token visible  
```
x-api-key: sk-PLfRwp...
```
**Risk**: Token prefix can aid brute-force attacks  
**Status**: ✅ Fixed in commit 762efdc

#### 3. Partial API Token Exposure
**File**: `docs/api-sequence.md`  
**Line**: 14  
**Issue**: Partial API token visible  
```
x-api-key: sk-PLfR...
```
**Status**: ✅ Fixed in commit 762efdc

---

## ✅ Files Verified Clean

The following files were audited and found **no security issues**:

- ✅ `src/commands/dashboard/*.ts` - No secrets
- ✅ `src/services/dashboard/*.ts` - No secrets  
- ✅ `docs/dashboard-*.md` - No secrets
- ✅ `README.md` - Only placeholder examples (sk-xxx)
- ✅ `CHANGES.md` - Only placeholder examples
- ✅ `.env.example` - Template only, no real values
- ✅ All TypeScript source files - No hardcoded secrets

---

## 🛡️ Current Protections

### .gitignore Coverage
```
.env                    ✅ Real credentials excluded
.env.*                  ✅ All env variants excluded
!.env.example           ✅ Template allowed
*secret*                ✅ Files with 'secret' excluded
*.local                 ✅ Local overrides excluded (NEW)
*.local.sh              ✅ Local scripts excluded (NEW)
.claude/settings.local.json  ✅ Local settings excluded
```

### Separation of Concerns
- ✅ Real credentials: `.env` (not committed)
- ✅ Local config: `bin/claude-code-insideout.local` (not committed)
- ✅ Public template: `bin/claude-code-insideout` (generic placeholders)

---

## ⚠️ Git History Still Contains Secrets

**IMPORTANT**: While the current HEAD is clean, **Git history still contains the sensitive information** in older commits.

### Affected Commits
- `bb54cf5` - "feat: add support for custom Bedrock gateway"
- `f7d9956` - "docs: obfuscate sensitive information in API documentation"
- Earlier commits that may contain secrets

### Recommendation: Rewrite Git History

**Option 1: Use BFG Repo-Cleaner (Recommended)**

```bash
# Install BFG
brew install bfg  # macOS
# or download from: https://rtyley.github.io/bfg-repo-cleaner/

# Replace secrets in all commits
bfg --replace-text replacements.txt

# Create replacements.txt with:
sk-REDACTED==>sk-REDACTED
your-gateway-url==>your-gateway-url

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push --force origin main
```

**Option 2: Use git filter-repo**

```bash
# Install
pip install git-filter-repo

# Create replacements file
echo "sk-REDACTED==>sk-REDACTED" > replacements.txt
echo "your-gateway-url==>your-gateway-url" >> replacements.txt

# Rewrite history
git filter-repo --replace-text replacements.txt

# Force push
git push --force origin main
```

**Option 3: Squash and Start Fresh (Nuclear Option)**

```bash
# Create a new orphan branch with current state
git checkout --orphan clean-main
git add -A
git commit -m "Initial commit with clean history"
git branch -D main
git branch -m main
git push --force origin main
```

---

## 🔐 Recommendations

### Immediate Actions (HIGH PRIORITY)

1. ✅ **DONE**: Fix current files (commit 762efdc)
2. ⚠️ **TODO**: Rewrite Git history to remove secrets from old commits
3. ⚠️ **TODO**: Rotate the exposed API token (`sk-REDACTED`)
4. ⚠️ **TODO**: Verify Salesforce gateway URL exposure risk

### Long-term Best Practices

1. ✅ **DONE**: Use `.env` for all sensitive configuration
2. ✅ **DONE**: Maintain `.local` files for personal overrides
3. ✅ **DONE**: Keep `.gitignore` comprehensive
4. 📋 **TODO**: Use pre-commit hooks to detect secrets before commit
5. 📋 **TODO**: Regular security audits with tools like:
   - `gitleaks` - Detect secrets in git repos
   - `trufflehog` - Find secrets in git history
   - `git-secrets` - Prevent committing secrets

### Proposed Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for potential secrets
if git diff --cached | grep -E "(sk-[a-zA-Z0-9]{20,}|sfproxy\.devx|PLfRwp)"; then
  echo "❌ ERROR: Potential secret detected!"
  echo "Please remove sensitive information before committing."
  exit 1
fi

echo "✅ No secrets detected"
exit 0
```

---

## 📊 Risk Assessment

| Risk | Severity | Likelihood | Impact | Status |
|------|----------|------------|--------|--------|
| API Token Exposure | HIGH | Medium | HIGH | Current: Fixed<br>History: Exposed |
| Internal URL Exposure | MEDIUM | High | MEDIUM | Current: Fixed<br>History: Exposed |
| Gateway Architecture | LOW | Medium | LOW | Documented but generic |

### Overall Risk Level
- **Current HEAD**: 🟢 **LOW** - All secrets removed
- **Git History**: 🔴 **HIGH** - Secrets still in history
- **Recommended**: Rewrite history and rotate credentials

---

## ✅ Actions Completed

1. ✅ Comprehensive audit of all committed files
2. ✅ Created obfuscation script
3. ✅ Removed secrets from current versions
4. ✅ Updated .gitignore with additional patterns
5. ✅ Created local override files (.local)
6. ✅ Documented security issues and recommendations

---

## 📝 Next Steps

### For Repository Owner (You)

1. **Review this report** - Understand the security implications
2. **Decide on history rewriting** - Choose Option 1, 2, or 3 above
3. **Rotate credentials** - Generate new API token
4. **Update .env** - Use new token locally
5. **Force push** - After history rewriting
6. **Verify** - Run security scan again

### Optional: Install Security Tools

```bash
# Install gitleaks
brew install gitleaks

# Scan repository
gitleaks detect --source . --verbose

# Install trufflehog
brew install trufflehog

# Scan repository
trufflehog git file://. --only-verified
```

---

## 🎯 Conclusion

The repository has been **secured at HEAD** (current version), but **Git history contains sensitive information**. 

**Recommendation**: Follow Option 1 (BFG) or Option 2 (git filter-repo) to rewrite history and then rotate credentials.

**Timeline**:
- ✅ Current files: **Fixed** (commit 762efdc)
- ⚠️ Git history: **Needs action**
- 🔄 Credential rotation: **Pending**

---

**Audit Completed**: 2026-05-04  
**Report Version**: 1.0
