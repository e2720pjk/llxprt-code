# Enhanced Cherry-Pick Execution Plan

**Target**: Complete Kitty protocol fix with latest upstream improvements  
**Commits**: 6 critical commits (3 original + 3 newly discovered)  
**Execution Date**: November 15, 2025  
**Status**: READY FOR EXECUTION  

---

## 🎯 Target Commits (Enhanced Set)

### Phase 1: Core Infrastructure (Critical)
1. `406f0baaf` - fix(ux) keyboard input hangs while waiting for keyboard input. (#10121)
   - **Date**: October 16, 2025
   - **Value**: ⭐⭐⭐ **FOUNDATION** - Core timeout and interrupt handling
   - **Changes**: 5 files, +774/-92

2. `3c9052a75` - Stop printing garbage characters for F1,F2.. keys (#12835)
   - **Date**: November 10, 2025
   - **Value**: ⭐⭐⭐ **CRITICAL** - Input classification with `insertable` property
   - **Changes**: 10 files, +70/-18

### Phase 2: Reliability Improvements (Important)
3. `43916b98a` - Don't clear buffers on cleanup. (#12979)
   - **Date**: November 12, 2025
   - **Value**: ⭐⭐ **IMPORTANT** - Prevents input loss during cleanup
   - **Changes**: 2 files, -32 deletions

4. `caf2ca143` - Add kitty support for function keys. (#12415)
   - **Date**: October 31, 2025
   - **Value**: ⭐⭐ **IMPORTANT** - Complete F1-F12 support, code quality
   - **Changes**: 2 files, +49/-45

### Phase 3: Protocol Fixes (Essential)
5. `f79665012` - Fix shift+tab keybinding when not in kitty mode (#12552)
   - **Date**: November 4, 2025
   - **Value**: ⭐ **ESSENTIAL** - Reverse tab protocol identification
   - **Changes**: 2 files, +2/-1

6. `d03496b71` - Increase paste timeout + add warning. (#13099)
   - **Date**: November 14, 2025
   - **Value**: ⭐ **OPTIONAL** - Enhanced user experience
   - **Changes**: 5 files, +29/-13

---

## 🔧 Execution Strategy

### Branch Management
```bash
# Create dedicated branch FROM EXISTING KITTY FIX BRANCH
BRANCH_NAME="20251115-kitty-complete-fix-v2"
git checkout 20251115-kitty-complete-fix  # ← CRITICAL: Start from branch with original 3 commits
git checkout -b "$BRANCH_NAME"

# Ensure clean state
git fetch upstream
git status  # Should be clean
```

### Cherry-Pick Sequence (CRITICAL - Must follow order)

#### Step 1: Foundation (`406f0baaf`)
```bash
git cherry-pick 406f0baaf
```

**Expected Conflicts**:
- `KeypressContext.tsx` (major changes)
- `KeypressContext.test.tsx` (test updates)
- `InputPrompt.test.tsx` (test framework)
- `FolderTrustDialog.test.tsx` (behavior changes)
- `render.tsx` (import paths)

**Resolution Strategy**:
1. **KeypressContext.tsx**: Accept ALL upstream changes (core infrastructure)
2. **Test files**: Ensure compatibility with llxprt test framework
3. **render.tsx**: **CRITICAL** - Check import paths, maintain llxprt compatibility

#### Step 2: Input Classification (`3c9052a75`)
```bash
git cherry-pick 3c9052a75
```

**Expected Conflicts**:
- `KeypressContext.tsx` (Key interface + emitKeys function)
- `text-buffer.ts` (handleInput logic)
- Multiple test files (mock updates)

**Resolution Strategy**:
1. **Key Interface**: Add `insertable: boolean` property
2. **emitKeys Function**: Accept character classification logic
3. **text-buffer.ts**: Change `!key.ctrl && !key.meta && key.name !== 'tab'` to `key.insertable`
4. **Test Mocks**: Add `insertable: false/true` to all Key objects

#### Step 3: Buffer Cleanup (`43916b98a`)
```bash
git cherry-pick 43916b98a
```

**Expected Conflicts**:
- `KeypressContext.tsx` (cleanup function)
- `useKeypress.test.tsx` (test removal)

**Resolution Strategy**:
1. **Cleanup Function**: Remove buffer flushing logic
2. **Test Removal**: Accept removal of problematic test case

#### Step 4: Function Keys (`caf2ca143`)
```bash
git cherry-pick caf2ca143
```

**Expected Conflicts**:
- `KeypressContext.tsx` (refactoring section)

**Resolution Strategy**:
1. **Constants**: Ensure `LEGACY_FUNC_TO_NAME` and `TILDE_KEYCODE_TO_NAME` exist
2. **Duplication**: Verify three duplicate mappings are eliminated

#### Step 5: Shift+Tab (`f79665012`)
```bash
git cherry-pick f79665012
```

**Expected Conflicts**:
- Minimal (2 line changes)

**Resolution Strategy**:
1. **Protocol Flag**: Ensure reverse tab has `kittyProtocol: false`

#### Step 6: Paste Timeout (`d03496b71`)
```bash
git cherry-pick d03496b71
```

**Expected Conflicts**:
- `KeypressContext.tsx` (timeout constant)
- `AppContainer.tsx` (warning system)
- `events.ts` (new event type)

**Resolution Strategy**:
1. **Timeout**: Accept `PASTE_TIMEOUT = 30_000`
2. **Warning System**: Integrate with existing llxprt UI
3. **Events**: Add new event type to existing system

---

## 🔍 Conflict Resolution Guidelines

### Critical Rules

#### 1. Import Path Vigilance
```bash
# ALWAYS check for incorrect imports
grep -r "@google/gemini-cli-core" packages/
# MUST be empty - all should be @vybestack/llxprt-code-core
```

#### 2. Key Interface Preservation
```typescript
// MUST include all properties
export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  paste: boolean;
  insertable: boolean;  // ← NEW - CRITICAL
  sequence: string;
  kittyProtocol?: boolean;
}
```

#### 3. Test Mock Updates
```typescript
// ALL test mocks must include insertable
const mockKey = {
  name: 'a',
  ctrl: false,
  meta: false,
  shift: false,
  paste: false,
  insertable: true,  // ← ADD THIS
  sequence: 'a'
};
```

#### 4. Text Buffer Logic
```typescript
// MUST change from character-based to property-based
// OLD:
else if (input && !key.ctrl && !key.meta && key.name !== 'tab') {
// NEW:
else if (key.insertable) {
```

### Resolution Priority Matrix

| Conflict Type | Priority | Action |
|---------------|----------|--------|
| Import Paths | CRITICAL | Fix immediately |
| Key Interface | CRITICAL | Preserve all properties |
| Core Logic | HIGH | Understand before accepting |
| Test Updates | MEDIUM | Ensure compatibility |
| Formatting | LOW | Accept and commit |

---

## 🧪 Verification Process

### After Each Cherry-Pick
```bash
# 1. Check import paths
grep -r "@google/gemini-cli-core" packages/

# 2. Check TypeScript compilation
npm run typecheck

# 3. Check for obvious syntax errors
npm run lint -- --no-fix
```

### After All Cherry-Picks
```bash
# Complete verification sequence
npm run lint      # 1. Code quality
npm run build     # 2. Compilation
npm test          # 3. Test suite
npm run format    # 4. Code formatting

# Commit formatting changes if needed
if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "fix: resolve formatting from enhanced cherry-picks"
fi
```

### Enhanced Verification Commands
```bash
# Check insertable property implementation
grep -n "insertable" packages/cli/src/ui/contexts/KeypressContext.tsx

# Check timeout constants
grep -n "PASTE_TIMEOUT\|KITTY_SEQUENCE_TIMEOUT_MS" packages/cli/src/ui/contexts/KeypressContext.tsx

# Check for duplicate mappings
grep -c "symbolToName.*=" packages/cli/src/ui/contexts/KeypressContext.tsx
grep -c "nameMap.*=" packages/cli/src/ui/contexts/KeypressContext.tsx

# Verify buffer cleanup changes
grep -A 10 -B 5 "return () => {" packages/cli/src/ui/contexts/KeypressContext.tsx | grep -A 15 "cleanup"
```

---

## 🎯 Success Criteria

### Technical Requirements
- [ ] All lint checks pass
- [ ] TypeScript compilation successful
- [ ] All tests pass (including new insertable tests)
- [ ] No import path errors
- [ ] No duplicate code patterns

### Functional Requirements
- [ ] Ctrl+C works in Kitty/Ghostty/Alacritty terminals
- [ ] F1-F12 function keys work without garbage characters
- [ ] Shift+Tab correctly identified as non-Kitty protocol
- [ ] Paste handling works with 30-second timeout
- [ ] No input loss during component cleanup
- [ ] No regressions in working terminals

### Architecture Requirements
- [ ] Multi-provider support preserved
- [ ] LLxprt branding maintained
- [ ] Authentication system intact
- [ ] Test framework compatibility maintained

---

## 🚀 Post-Execution Actions

### Create Merge Commit
```bash
# Empty merge for upstream parity
git merge -s ours --no-ff d03496b71 -m "Merge upstream gemini-cli up to commit d03496b71

This is an empty merge commit to maintain parity with upstream structure.
All changes have already been cherry-picked:
- fix(ux) keyboard input hangs while waiting for keyboard input. (#10121)
- Stop printing garbage characters for F1,F2.. keys (#12835)
- Don't clear buffers on cleanup. (#12979)
- Add kitty support for function keys. (#12415)
- Fix shift+tab keybinding when not in kitty mode (#12552)
- Increase paste timeout + add warning. (#13099)

Maintains llxprt's multi-provider support, branding, and authentication
differences while staying in sync with upstream improvements."
```

### Push and PR
```bash
git push origin 20251115-kitty-complete-fix-v2
```

**PR Requirements**:
- Detailed explanation of 6 cherry-picked commits
- Conflict resolution summary
- Complete test results
- Enhanced functionality verification report
- Comparison with original 3-commit plan

---

## ⚠️ Critical Warnings (Enhanced)

1. **NEVER operate directly on main branch**
2. **NEVER use `git checkout --theirs` without examination**
3. **MUST preserve `insertable` property in Key interface**
4. **MUST update all test mocks with `insertable` property**
5. **MUST follow chronological order exactly**
6. **MUST complete enhanced verification process**
7. **MUST check import paths after each commit**
8. **MUST create PR, cannot merge directly**

---

## 📊 Expected Enhanced Results

### Issue Resolution
- ✅ **Primary Issue**: Ctrl+C works in all affected terminals
- ✅ **Secondary Issue**: No keyboard input hanging
- ✅ **Enhanced Issue**: F1-F12 without garbage characters
- ✅ **Reliability Issue**: No input loss during cleanup
- ✅ **UX Issue**: Better paste handling with warnings

### Technical Improvements
- ✅ **Input Classification**: `insertable` property for proper character handling
- ✅ **Buffer Management**: Improved cleanup without data loss
- ✅ **Timeout Handling**: Enhanced paste timeout with user feedback
- ✅ **Code Quality**: Eliminated duplication, improved maintainability
- ✅ **Protocol Support**: Complete Kitty protocol implementation

---

**This enhanced plan provides the most comprehensive solution for Kitty protocol issues while maintaining all project standards.**