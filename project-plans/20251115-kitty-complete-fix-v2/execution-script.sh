#!/bin/bash

# Enhanced Cherry-Pick Execution Script - Kitty Protocol Complete Fix v2
# Based on comprehensive analysis with 6 critical upstream commits

set -e  # Exit on error

echo "🚀 Starting Enhanced Kitty Protocol Complete Fix Cherry-Pick"
echo "=========================================================="
echo "Enhanced plan with 6 commits (3 original + 3 newly discovered)"
echo ""

# Phase 1: Preparation Work
echo "📋 Phase 1: Preparation Work"

# Check working directory status
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ ERROR: Working directory not clean, please commit or stash changes"
    exit 1
fi

echo "✅ Working directory clean"

# Create dedicated branch FROM EXISTING KITTY FIX BRANCH
BRANCH_NAME="20251115-kitty-complete-fix-v2"
echo "🌿 Creating branch: $BRANCH_NAME"

git checkout 20251115-kitty-complete-fix  # ← CRITICAL: Start from branch with original 3 commits
git checkout -b "$BRANCH_NAME"

# Fetch latest upstream
echo "📥 Fetching upstream changes"
git fetch upstream

# Phase 2: Enhanced Cherry-Picks (in chronological order)
echo ""
echo "🔧 Phase 2: Enhanced Cherry-Picks (chronological order)"

# Define enhanced commits to cherry-pick (in correct time order)
COMMITS=(
    "406f0baaf"  # keyboard input hangs fix (FOUNDATION)
    "3c9052a75"  # insertable property + F-keys garbage fix (CRITICAL)
    "43916b98a"  # buffer cleanup improvement (IMPORTANT)
    "caf2ca143"  # function keys support (IMPORTANT)
    "f79665012"  # shift+tab fix (ESSENTIAL)
    "d03496b71"  # paste timeout enhancement (OPTIONAL)
)

for i in "${!COMMITS[@]}"; do
    commit="${COMMITS[$i]}"
    echo ""
    echo "📦 Cherry-picking commit $((i+1))/${#COMMITS[@]}: $commit"
    
    # Get commit title for better logging
    commit_title=$(git log --format="%s" -n 1 "$commit")
    echo "   Title: $commit_title"
    
    if git cherry-pick "$commit"; then
        echo "✅ Successfully cherry-picked $commit"
        
        # Post-cherry-pick verification
        echo "🔍 Running post-cherry-pick verification..."
        
        # Check for import path issues
        if grep -r "@google/gemini-cli-core" packages/ > /dev/null 2>&1; then
            echo "⚠️  WARNING: Found @google/gemini-cli-core imports - need manual fix"
            echo "Files with incorrect imports:"
            grep -r "@google/gemini-cli-core" packages/
            echo "Please fix these imports to @vybestack/llxprt-code-core before continuing"
            exit 1
        fi
        
        # Quick TypeScript check
        if npm run typecheck > /dev/null 2>&1; then
            echo "✅ TypeScript compilation OK"
        else
            echo "⚠️  TypeScript compilation failed - check for syntax errors"
            echo "Run 'npm run typecheck' to see details"
            exit 1
        fi
        
    else
        echo "⚠️  CONFLICT DETECTED - Manual resolution required"
        echo "Conflicts found in:"
        git status --porcelain
        echo ""
        echo "📝 ENHANCED CONFLICT RESOLUTION GUIDELINES:"
        echo ""
        case $commit in
            "406f0baaf")
                echo "FOUNDATION COMMIT - Core infrastructure changes:"
                echo "1. KeypressContext.tsx: Accept ALL upstream changes (timeout, interrupt handling)"
                echo "2. Test files: Check llxprt test framework compatibility"
                echo "3. render.tsx: CRITICAL - Check import paths, maintain llxprt compatibility"
                ;;
            "3c9052a75")
                echo "INSERTABLE PROPERTY COMMIT - Critical input classification:"
                echo "1. Key Interface: MUST preserve 'insertable: boolean' property"
                echo "2. emitKeys Function: Accept character classification logic"
                echo "3. text-buffer.ts: Change to 'key.insertable' instead of character checks"
                echo "4. Test Mocks: Add 'insertable: false/true' to ALL Key objects"
                ;;
            "43916b98a")
                echo "BUFFER CLEANUP COMMIT - Prevent input loss:"
                echo "1. Cleanup Function: Remove buffer flushing logic"
                echo "2. Test Removal: Accept removal of problematic test case"
                ;;
            "caf2ca143")
                echo "FUNCTION KEYS COMMIT - Code quality improvement:"
                echo "1. Constants: Ensure LEGACY_FUNC_TO_NAME and TILDE_KEYCODE_TO_NAME exist"
                echo "2. Duplication: Verify three duplicate mappings are eliminated"
                ;;
            "f79665012")
                echo "SHIFT+TAB COMMIT - Protocol fix:"
                echo "1. Protocol Flag: Ensure reverse tab has 'kittyProtocol: false'"
                echo "2. Check for duplicate application"
                ;;
            "d03496b71")
                echo "PASTE TIMEOUT COMMIT - UX enhancement:"
                echo "1. Timeout: Accept PASTE_TIMEOUT = 30_000"
                echo "2. Warning System: Integrate with existing llxprt UI"
                echo "3. Events: Add new event type to existing system"
                ;;
        esac
        
        echo ""
        echo "🔧 GENERAL RESOLUTION STEPS:"
        echo "1. Examine conflicts: git diff"
        echo "2. Resolve conflicts manually"
        echo "3. Check import paths: grep -r '@google/gemini-cli-core' packages/"
        echo "4. Test compilation: npm run typecheck"
        echo "5. Continue cherry-pick: git add . && git cherry-pick --continue"
        echo ""
        echo "Or to skip this commit: git cherry-pick --skip"
        exit 1
    fi
done

# Phase 3: Enhanced Verification Process
echo ""
echo "🧪 Phase 3: Enhanced Verification Process"

echo "1️⃣ Running lint..."
if npm run lint; then
    echo "✅ Lint passed"
else
    echo "❌ Lint failed"
    exit 1
fi

echo "2️⃣ Running build..."
if npm run build; then
    echo "✅ Build passed"
else
    echo "❌ Build failed"
    exit 1
fi

echo "3️⃣ Running tests..."
if npm test; then
    echo "✅ Tests passed"
else
    echo "❌ Tests failed"
    exit 1
fi

echo "4️⃣ Running formatting..."
npm run format

# Check for formatting changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Formatting changes detected, committing..."
    git add -A
    git commit -m "fix: resolve formatting from enhanced cherry-picks"
fi

# Phase 4: Enhanced Verification Commands
echo ""
echo "🔍 Phase 4: Enhanced Verification Commands"

echo "🔍 Checking insertable property implementation..."
if grep -n "insertable" packages/cli/src/ui/contexts/KeypressContext.tsx > /dev/null; then
    echo "✅ insertable property found in KeypressContext"
else
    echo "❌ insertable property NOT found - check 3c9052a75 implementation"
    exit 1
fi

echo "🔍 Checking timeout constants..."
if grep -n "PASTE_TIMEOUT\|KITTY_SEQUENCE_TIMEOUT_MS" packages/cli/src/ui/contexts/KeypressContext.tsx > /dev/null; then
    echo "✅ Timeout constants found"
else
    echo "❌ Timeout constants NOT found - check implementation"
    exit 1
fi

echo "🔍 Checking for duplicate mappings..."
duplicate_count=$(grep -c "symbolToName.*=" packages/cli/src/ui/contexts/KeypressContext.tsx 2>/dev/null || echo "0")
if [ "$duplicate_count" -eq 0 ]; then
    echo "✅ No duplicate symbolToName mappings found"
else
    echo "⚠️  Found $duplicate_count duplicate mappings - expected after caf2ca143"
fi

echo "🔍 Final import path check..."
if grep -r "@google/gemini-cli-core" packages/ > /dev/null 2>&1; then
    echo "❌ CRITICAL: Found incorrect import paths"
    grep -r "@google/gemini-cli-core" packages/
    exit 1
else
    echo "✅ All import paths correct (@vybestack/llxprt-code-core)"
fi

# Phase 5: Create Merge Commit
echo ""
echo "🔀 Phase 5: Create Merge Commit"

LAST_COMMIT="d03496b71"
git merge -s ours --no-ff "$LAST_COMMIT" -m "Merge upstream gemini-cli up to commit $LAST_COMMIT

This is an empty merge commit to maintain parity with upstream structure.
All changes have already been cherry-picked:
- fix(ux) keyboard input hangs while waiting for keyboard input. (#10121)
- Stop printing garbage characters for F1,F2.. keys (#12835)
- Don't clear buffers on cleanup. (#12979)
- Add kitty support for function keys. (#12415)
- Fix shift+tab keybinding when not in kitty mode (#12552)
- Increase paste timeout + add warning. (#13099)

Enhanced with 6 total commits (3 original + 3 newly discovered) for:
- Complete input classification with 'insertable' property
- Improved buffer management without data loss
- Enhanced paste handling with better timeouts
- Full F1-F12 function key support without garbage characters

Maintains llxprt's multi-provider support, branding, and authentication
differences while staying in sync with upstream improvements."

echo "✅ Enhanced merge commit created successfully"

# Phase 6: Push Branch
echo ""
echo "📤 Phase 6: Push Branch"

git push origin "$BRANCH_NAME"

echo ""
echo "🎉 Enhanced Cherry-Pick completed successfully!"
echo ""
echo "📋 NEXT STEPS:"
echo "1. Create PR to main branch"
echo "2. PR title suggestion: 'fix: complete Kitty protocol support with enhanced upstream improvements'"
echo "3. PR description should include:"
echo "   - Details of six cherry-picked commits (3 original + 3 enhanced)"
echo "   - Conflict resolution summary"  
echo "   - Complete test results"
echo "   - Enhanced functionality verification report"
echo "   - Comparison with original 3-commit plan"
echo "4. Wait for review and merge"
echo ""
echo "🔗 PR link will be provided after creation"
echo ""
echo "📊 ENHANCED RESULTS EXPECTED:"
echo "- ✅ Ctrl+C works in all affected terminals"
echo "- ✅ F1-F12 function keys without garbage characters"
echo "- ✅ Improved input classification with 'insertable' property"
echo "- ✅ Better buffer management without data loss"
echo "- ✅ Enhanced paste handling with 30s timeout"
echo "- ✅ Complete Kitty protocol support"

echo "=========================================================="
echo "✨ Enhanced Cherry-Pick script execution completed"
echo ""
echo "📚 REFERENCE DOCUMENTATION:"
echo "- project-plans/20251115-kitty-complete-fix-v2/enhanced-cherry-pick-plan.md"
echo "- project-plans/20251115-kitty-complete-fix-v2/upstream-analysis.md"
echo "- project-plans/20251115-kitty-complete-fix-v2/verification-checklist.md"