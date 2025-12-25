/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';

export const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
export const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';

export const enableBracketedPaste = () => {
  if (!bracketedPasteEnabled) {
    process.stdout.write(ENABLE_BRACKETED_PASTE);
    bracketedPasteEnabled = true;
  }
};

let bracketedPasteEnabled = false;

export const disableBracketedPaste = () => {
  if (!bracketedPasteEnabled) {
    return;
  }
  bracketedPasteEnabled = false;

  try {
    fs.writeSync(process.stdout.fd, DISABLE_BRACKETED_PASTE);
  } catch (err) {
    // Ignore errors during cleanup - terminal may be closed
  }
};
