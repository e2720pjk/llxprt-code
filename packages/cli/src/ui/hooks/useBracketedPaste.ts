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
    disableBracketedPaste();
  };

  useEffect(() => {
    enableBracketedPaste();

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
    process.on('unhandledRejection', cleanup);

    return () => {
      cleanup();
      process.removeListener('exit', cleanup);
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
      process.removeListener('uncaughtException', cleanup);
      process.removeListener('unhandledRejection', cleanup);
    };
  }, []);
};
