# Terminal Corruption Investigation - Root Cause Analysis

## Summary

This document summarizes the investigation into terminal corruption after CTRL+C exit, where arrow keys display literal escape sequences (^[[A) after the application terminates.

## Investigation Findings

### Files Analyzed

1. **packages/cli/src/ui/utils/kittyProtocolDetector.ts**
   - Manages Kitty Keyboard Protocol (ESC[>1u / ESC[<u)
   - Registers handlers for: `exit`, `SIGTERM`
   - ❌ **MISSING**: No `SIGINT` handler
   - Uses async `process.stdout.write` for disable sequence

2. **packages/cli/src/ui/hooks/useBracketedPaste.ts**
   - Manages bracketed paste mode (ESC[?2004h / ESC[?2004l)
   - Registers handlers for: `exit`, `SIGINT`, `SIGTERM`
   - ✅ Has SIGINT handler
   - Uses async `process.stdout.write` for disable sequence

3. **packages/cli/src/ui/utils/bracketedPaste.ts**
   - Contains enable/disable functions for bracketed paste
   - Uses async `process.stdout.write` for both enable and disable

4. **packages/cli/src/ui/contexts/KeypressContext.tsx**
   - Manages raw mode and focus tracking (ESC[?1004h / ESC[?1004l)
   - Cleanup function (lines 1145-1156):
     - Restores raw mode
     - Writes `SHOW_CURSOR`, `DISABLE_BRACKETED_PASTE`, `DISABLE_FOCUS_TRACKING`
   - ❌ **ISSUE**: Cleanup only runs on component unmount, NOT on SIGINT
   - Registers `SIGCONT` handler (resume after suspend)
   - Uses async `process.stdout.write` for all disable sequences

## Root Cause Analysis

### Primary Issue: Missing SIGINT Handler for Some Terminal Modes

When user presses CTRL+C:

- ✅ **Bracketed Paste**: Has SIGINT handler → cleans up properly
- ❌ **Kitty Protocol**: No SIGINT handler → **stays enabled**
- ❌ **Focus Tracking**: No SIGINT handler → **stays enabled** (cleanup only on unmount)
- ❌ **Raw Mode**: KeypressContext cleanup only on unmount → may stay enabled

### Secondary Issue: Asynchronous Writes

All cleanup functions use `process.stdout.write()` which is **asynchronous**:

- Writes may not complete before process termination
- SIGINT handlers may fire and exit before flush completes
- Terminal mode disable sequences may not reach the TTY

### Tertiary Issue: Component Lifecycle Dependency

`KeypressContext.tsx` cleanup is tied to React component lifecycle:

- Only runs when component unmounts (normal shutdown)
- Does NOT run on SIGINT (signal interrupts process)
- Raw mode and focus tracking may remain enabled after CTRL+C

## Why This Causes ^[[A Symptoms

When Kitty Protocol or focus tracking remains enabled after CTRL+C:

1. **Kitty Protocol Enabled**: Terminal sends CSI-u format for arrow keys
   - Up arrow: `\x1b[1;1A` or similar
   - Without proper cleanup, terminal continues sending these sequences
   - Shell receives them as literal text: `^[[A`

2. **Focus Tracking Enabled**: Terminal sends focus event sequences
   - May interfere with shell input interpretation
   - Can cause bell icons or other artifacts

3. **Raw Mode Enabled**: Terminal in raw mode doesn't interpret control characters
   - Arrow keys, tab, etc. are not translated to shell commands
   - Appear as literal escape sequences on screen

## Test Script Created

File: `integration-tests/terminal-corruption.test.ts`

This test script:

1. Launches CLI in PTY environment
2. Sends a simple command ("hi")
3. Exits with CTRL+C
4. After exit, sends arrow up key sequence
5. Detects if terminal is corrupted by checking for literal escape sequences

## Debug Logging Added

To track which terminal modes are enabled/disabled during execution:

### kittyProtocolDetector.ts

```typescript
// Enable
console.error('[DEBUG] Kitty Protocol ENABLED');

// Disable
console.error('[DEBUG] Kitty Protocol DISABLE sequence being written');
console.error('[DEBUG] Kitty Protocol DISABLED');
```

### bracketedPaste.ts

```typescript
// Enable
console.error('[DEBUG] Bracketed Paste ENABLED');

// Disable
console.error('[DEBUG] Bracketed Paste DISABLE sequence being written');
console.error('[DEBUG] Bracketed Paste DISABLED');
```

### useBracketedPaste.ts

```typescript
// Mount
console.error(
  '[DEBUG] useBracketedPaste mounted - calling enableBracketedPaste',
);

// Cleanup handler called
console.error('[DEBUG] useBracketedPaste cleanup handler called');

// Unmount
console.error('[DEBUG] useBracketedPaste unmounting - calling cleanup');
```

### KeypressContext.tsx

```typescript
// SIGCONT handler
console.error('[DEBUG] SIGCONT handler triggered');

// Setting raw mode
console.error('[DEBUG] KeypressContext: Setting raw mode to true');

// Cleanup
console.error('[DEBUG] KeypressContext cleanup: SHOW_CURSOR');
console.error('[DEBUG] KeypressContext cleanup: DISABLE_BRACKETED_PASTE');
console.error('[DEBUG] KeypressContext cleanup: DISABLE_FOCUS_TRACKING');
console.error('[DEBUG] KeypressContext cleanup: Restoring raw mode to false');
```

## Next Steps

1. **Run the test script** to reproduce the issue with debug logging enabled
2. **Analyze the logs** to see which cleanup handlers are/aren't being called
3. **Identify the specific terminal mode(s)** causing the corruption
4. **Implement the fix** based on findings

## Proposed Fix Strategy

Based on analysis, the fix should:

1. **Add SIGINT handler** to `kittyProtocolDetector.ts`
2. **Add SIGINT handler** for `KeypressContext` cleanup (or move to top-level)
3. **Use synchronous writes** (`fs.writeSync`) for all disable sequences
4. **Add reentrancy protection** to prevent double-cleanup
5. **Register handlers early** before terminal modes are enabled

## Hypothesis Verification

The test with debug logging will verify:

- Which cleanup handlers run on CTRL+C?
- Which terminal modes remain enabled after exit?
- Is the issue due to missing handlers or async writes?
- Are handlers running but writes not reaching terminal?

After running the test and analyzing logs, we can implement the minimal, targeted fix.
