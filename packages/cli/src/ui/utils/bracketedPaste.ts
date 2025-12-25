/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';

let bracketedPasteEnabled = false;

export const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
export const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';

export const enableBracketedPaste = () => {
  process.stdout.write(ENABLE_BRACKETED_PASTE);
  bracketedPasteEnabled = true;
};

export const disableBracketedPaste = () => {
  if (!bracketedPasteEnabled) {
    return;
  }
  bracketedPasteEnabled = false;

  try {
    fs.writeSync(process.stdout.fd, DISABLE_BRACKETED_PASTE);
  } catch {
    // Ignore errors during cleanup
  }
};
