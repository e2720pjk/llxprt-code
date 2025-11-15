#!/bin/bash

# Cherry-Pick Execution Script - Kitty Protocol Complete Fix
# Based on comprehensive analysis and lessons learned

set -e  # Exit on error

echo "🚀 Starting Kitty Protocol Complete Fix Cherry-Pick"
echo "=================================================="
echo "Based on lessons learned from previous execution attempts"
echo ""

# Phase 1: Preparation Work
echo "📋 Phase 1: Preparation Work"

# Check working directory status
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ ERROR: Working directory not clean, please commit or stash changes"
    exit 1
fi

echo "✅ Working directory clean"

# Create dedicated branch
BRANCH_NAME="20251115-kitty-complete-fix-v2"
echo "🌿 Creating branch: $BRANCH_NAME"

git checkout main
git checkout -b "$BRANCH_NAME"

# Fetch latest upstream
echo "📥 Fetching upstream changes"
git fetch upstream

# Phase 2: Individual Cherry-Picks (in chronological order)
echo ""
echo "🔧 Phase 2: Individual Cherry-Picks (chronological order)"

# Define commits to cherry-pick (in correct time order)
COMMITS=(
    "406f0baaf"  # keyboard input hangs fix
    "caf2ca143"  # function keys support  
    "f79665012"  # shift+tab fix
)

for i in "${!COMMITS[@]}"; do
    commit="${COMMITS[$i]}"
    echo ""
    echo "📦 Cherry-picking commit $((i+1))/${#COMMITS[@]}: $commit"
    
    if git cherry-pick "$commit"; then
        echo "✅ Successfully cherry-picked $commit"
    else
        echo "⚠️  CONFLICT DETECTED - Manual resolution required"
        echo "Conflicts found in:"
        git status --porcelain
        echo ""
        echo "📝 CONFLICT RESOLUTION GUIDELINES:"
        echo "1. For KeypressContext.tsx: Preserve upstream new constants and functions"
        echo "2. For test files: Check llxprt test framework compatibility"
        echo "3. For render.tsx: CRITICAL - Do NOT use upstream version directly"
        echo "4. Check import paths: Must be @vybestack/llxprt-code-core, not @google/gemini-cli-core"
        echo ""
        echo "After resolving conflicts:"
        echo "  git add ."
        echo "  git cherry-pick --continue"
        echo ""
        echo "Or to skip this commit:"
        echo "  git cherry-pick --skip"
        exit 1
    fi
done

# Phase 3: Verification Process (per project definition)
echo ""
echo "🧪 Phase 3: Verification Process"

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
    git commit -m "fix: resolve formatting from cherry-picks"
fi

# Phase 4: Create Merge Commit
echo ""
echo "🔀 Phase 4: Create Merge Commit"

LAST_COMMIT="f79665012"
git merge -s ours --no-ff "$LAST_COMMIT" -m "Merge upstream gemini-cli up to commit $LAST_COMMIT

This is an empty merge commit to maintain parity with upstream structure.
All changes have already been cherry-picked:
- fix(ux) keyboard input hangs while waiting for keyboard input. (#10121)
- Add kitty support for function keys. (#12415)  
- Fix shift+tab keybinding when not in kitty mode (#12552)

Maintains llxprt's multi-provider support, branding, and authentication
differences while staying in sync with upstream improvements."

echo "✅ Merge commit created successfully"

# Phase 5: Push Branch
echo ""
echo "📤 Phase 5: Push Branch"

git push origin "$BRANCH_NAME"

echo ""
echo "🎉 Cherry-Pick completed successfully!"
echo ""
echo "📋 NEXT STEPS:"
echo "1. Create PR to main branch"
echo "2. PR title suggestion: 'fix: complete Kitty protocol support with upstream improvements'"
echo "3. PR description should include:"
echo "   - Details of three cherry-picked commits"
echo "   - Conflict resolution summary"  
echo "   - Complete test results"
echo "   - Functionality verification report"
echo "4. Wait for review and merge"
echo ""
echo "🔗 PR link will be provided after creation"

echo "=================================================="
echo "✨ Cherry-Pick script execution completed"
echo ""
echo "📚 REFERENCE DOCUMENTATION:"
echo "- project-plans/20251115-kitty-ctrlc-fix/cherry-pick-execution-report.md"
echo "- project-plans/20251115-kitty-ctrlc-fix/COMMIT-LOG.md"
echo "- project-plans/20251115-kitty-ctrlc-fix/QUICK-REFERENCE.md"