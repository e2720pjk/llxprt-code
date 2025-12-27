/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import {
  disableBracketedPaste,
  enableBracketedPaste,
} from '../utils/bracketedPaste.js';

/**
 * Enables and disables bracketed paste mode in the terminal.
 *
 * This hook ensures that bracketed paste mode is enabled when the component
 * mounts and disabled when it unmounts or when the process exits.
 */
export const useBracketedPaste = () => {
  const cleanup = () => {
    console.error('[DEBUG] useBracketedPaste cleanup handler called');
    disableBracketedPaste();
  };

  useEffect(() => {
    console.error(
      '[DEBUG] useBracketedPaste mounted - calling enableBracketedPaste',
    );
    enableBracketedPaste();

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    return () => {
      console.error('[DEBUG] useBracketedPaste unmounting - calling cleanup');
      cleanup();
      process.removeListener('exit', cleanup);
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
    };
  }, []);
};
