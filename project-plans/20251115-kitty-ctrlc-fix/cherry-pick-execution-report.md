# Cherry-Pick Execution Report - Complete Kitty Protocol Support

**Execution Date**: November 15, 2025  
**Status**: READY FOR EXECUTION - Complete guide prepared  
**Target**: Apply three critical upstream commits to llxprt-code

---

## 🎯 Target Commits

### 1. `406f0baaf` - Core Fix
**Title**: fix(ux) keyboard input hangs while waiting for keyboard input. (#10121)  
**Date**: October 16, 2025  
**Value**: ⭐⭐⭐ **CRITICAL FIX** - Root cause for issue #565  
**Changes**: 5 files, 774 insertions, 92 deletions

### 2. `caf2ca143` - Function Keys Support
**Title**: Add kitty support for function keys. (#12415)  
**Date**: October 31, 2025  
**Value**: ⭐⭐ **IMPORTANT IMPROVEMENT** - Complete F1-F12 support, eliminates code duplication  
**Changes**: 2 files, 49 insertions, 45 deletions

### 3. `f79665012` - Shift+Tab Fix
**Title**: Fix shift+tab keybinding when not in kitty mode (#12552)  
**Date**: November 4, 2025  
**Value**: ⭐ **ESSENTIAL FIX** - Fixes reverse tab protocol identification error  
**Changes**: 2 files, 2 insertions, 1 deletion

---

## ❌ Identified Execution Errors

### Error 1: Unauthorized Auto-merge to Main Branch
**Issue**: Direct operations on main branch without creating dedicated branch  
**Impact**: Violates project cherry-pick workflow  
**Correct Approach**: Must create dedicated branch for operations

### Error 2: Using New Version Without Detailed Review
**Issue**: Used `git checkout --theirs` without examining upstream version differences  
**Impact**: Potential loss of important local customizations  
**Correct Approach**: Must examine conflicts line by line, understand necessity of each change

### Error 3: Incorrect Assessment of Later Commits' Value
**Issue**: Mistakenly assumed `caf2ca143` and `f79665012` were included in first commit  
**Impact**: Nearly missed important functionality improvements and fixes  
**Correct Approach**: Must carefully evaluate each commit's unique value

---

## ✅ Correct Cherry-Pick Execution Plan

### Phase 1: Preparation Work

```bash
# 1. Ensure clean working environment
git status
# Ensure no uncommitted changes

# 2. Create dedicated branch (follow project workflow)
git checkout main
git checkout -b 20251115-kitty-complete-fix

# 3. Fetch latest upstream
git fetch upstream
```

### Phase 2: Individual Cherry-Picks (in chronological order)

**CRITICAL**: Execute in correct time order: `406f0baaf` → `caf2ca143` → `f79665012`

#### 2.1 First Commit: `406f0baaf`
```bash
git cherry-pick 406f0baaf
```

**Expected Conflict Files**:
- `packages/cli/src/ui/contexts/KeypressContext.tsx` (primary)
- `packages/cli/src/ui/contexts/KeypressContext.test.tsx`
- `packages/cli/src/ui/components/InputPrompt.test.tsx`
- `packages/cli/src/ui/components/FolderTrustDialog.test.tsx`
- `packages/cli/src/test-utils/render.tsx`
- `packages/cli/src/ui/components/PermissionsModifyTrustDialog.test.tsx` (delete conflict)

**Conflict Resolution Strategy**:
1. **KeypressContext.tsx**: Preserve upstream new constants and functions
2. **Test files**: Check compatibility with llxprt test framework
3. **render.tsx**: **CRITICAL** - Do not use upstream version directly, check import path differences

#### 2.2 Second Commit: `caf2ca143`
```bash
git cherry-pick caf2ca143
```

**Expected Conflicts**: Primarily in `KeypressContext.tsx` refactoring section

**Conflict Resolution Strategy**:
1. Check if `LEGACY_FUNC_TO_NAME` and `TILDE_KEYCODE_TO_NAME` already exist
2. Ensure three duplicate mappings are replaced with unified constants

#### 2.3 Third Commit: `f79665012`
```bash
git cherry-pick f79665012
```

**Expected Conflicts**: Likely minimal, only 2 line changes

**Conflict Resolution Strategy**:
1. Check reverse tab `kittyProtocol` flag is set to `false`
2. Ensure no duplicate application

### Phase 3: Verification Process (per project definition)

```bash
# Execute verification in order
npm run lint      # 1. Run lint first
npm run build     # 2. Then run build  
npm test          # 3. Then run tests
npm run format    # 4. Finally run formatting

# If there are formatting changes, commit them
git add -A
git commit -m "fix: resolve formatting from cherry-picks"
```

### Phase 4: Create Merge Commit

```bash
# Create empty merge commit to maintain upstream structure
git merge -s ours --no-ff f79665012 -m "Merge upstream gemini-cli up to commit f79665012

This is an empty merge commit to maintain parity with upstream structure.
All changes have already been cherry-picked:
- fix(ux) keyboard input hangs while waiting for keyboard input. (#10121)
- Add kitty support for function keys. (#12415)  
- Fix shift+tab keybinding when not in kitty mode (#12552)

Maintains llxprt's multi-provider support, branding, and authentication
differences while staying in sync with upstream improvements."
```

### Phase 5: Push and PR

```bash
git push origin 20251115-kitty-complete-fix

# Create PR to main, including:
# - Detailed explanation of three cherry-picks
# - Conflict resolution summary  
# - Complete test results
# - Functionality verification report
```

---

## 🔍 Key Verification Points

### After Each Cherry-Pick Check:

1. **Import Path Correctness**:
   ```bash
   grep -r "@google/gemini-cli-core" packages/
   # Should return empty results, all should be @vybestack/llxprt-code-core
   ```

2. **Functionality Completeness Check**:
   ```bash
   # Check key constants exist
   grep -n "KITTY_SEQUENCE_TIMEOUT_MS\|LEGACY_FUNC_TO_NAME\|TILDE_KEYCODE_TO_NAME" packages/cli/src/ui/contexts/KeypressContext.tsx
   ```

3. **Duplicate Code Check**:
   ```bash
   # Ensure no duplicate mappings
   grep -c "symbolToName.*=" packages/cli/src/ui/contexts/KeypressContext.tsx
   grep -c "nameMap.*=" packages/cli/src/ui/contexts/KeypressContext.tsx
   # Both should be 0
   ```

### Final Verification Checklist:

- [ ] All lint checks pass
- [ ] TypeScript compilation successful
- [ ] All tests pass
- [ ] Kitty protocol functionality complete
- [ ] Ctrl+C works in all terminals
- [ ] F1-F12 function keys work properly
- [ ] Shift+Tab correctly identified as non-Kitty protocol
- [ ] No duplicate code
- [ ] Import paths correct

---

## 📊 Expected Final Results

### Resolved Issues:
- ✅ **Issue #565**: Ctrl+C works properly in Kitty/Ghostty/Alacritty
- ✅ **Keyboard Input Hangs**: Completely resolved
- ✅ **Function Keys Support**: Complete F1-F12 support
- ✅ **Shift+Tab**: Correctly identified as non-Kitty protocol
- ✅ **Code Quality**: Eliminated duplication, improved maintainability

### Technical Improvements:
- ✅ **Timeout Mechanism**: Prevents infinite sequence buffer growth
- ✅ **Interrupt Handling**: Proper handling of focus, paste, and other interrupts
- ✅ **Sequence Validation**: Intelligent identification of valid Kitty sequences
- ✅ **Alt Key Support**: Complete Alt+key combination support

### Architecture Preservation:
- ✅ **Multi-provider Support**: Fully preserved
- ✅ **LLxprt Branding**: Maintained original branding
- ✅ **Authentication System**: Preserved multi-provider authentication

---

## ⚠️ Critical Warnings

1. **NEVER operate directly on main branch**
2. **NEVER use `git checkout --theirs` without examination**
3. **MUST evaluate each commit's unique value individually**
4. **MUST execute cherry-picks in chronological order**
5. **MUST complete full verification process**
6. **MUST create PR, cannot merge directly**

---

## 📝️ Execution Log Template

Executor please update this section after completion:

```
Execution Date: ___________
Executor: ___________
Branch Name: 20251115-kitty-complete-fix
Conflicts Encountered: ___________
Resolution Approach: ___________
Verification Results: ___________
PR Link: ___________
Notes: ___________
```

---

## 🚀 One-Command Execution

For automated execution:

```bash
# Make script executable and run
chmod +x project-plans/20251115-kitty-ctrlc-fix/cherry-pick-kitty-fix.sh
./project-plans/20251115-kitty-ctrlc-fix/cherry-pick-kitty-fix.sh
```

---

**This report ensures the next executor can avoid all identified mistakes and successfully complete the comprehensive cherry-pick.**