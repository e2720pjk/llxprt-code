/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConsoleMessageItem } from '../types.js';

// Specific buffer for logs captured before AppContainer mounts
const earlyLogs: ConsoleMessageItem[] = [];

export const logBuffer = {
  add: (message: Omit<ConsoleMessageItem, 'id'>) => {
    earlyLogs.push({
      ...message,
      // Default count to 1 if not provided, though ConsolePatcher usually provides it
      count: message.count || 1,
    });
  },

  drain: (): ConsoleMessageItem[] => {
    const logs = [...earlyLogs];
    earlyLogs.length = 0;
    return logs;
  },
};
