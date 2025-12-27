/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
export const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';

export const enableBracketedPaste = () => {
  process.stdout.write(ENABLE_BRACKETED_PASTE);
  console.error('[DEBUG] Bracketed Paste ENABLED');
};

export const disableBracketedPaste = () => {
  console.error('[DEBUG] Bracketed Paste DISABLE sequence being written');
  process.stdout.write(DISABLE_BRACKETED_PASTE);
  console.error('[DEBUG] Bracketed Paste DISABLED');
};
