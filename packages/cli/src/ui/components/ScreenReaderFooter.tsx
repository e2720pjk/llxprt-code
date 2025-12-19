/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { tokenLimit } from '@vybestack/llxprt-code-core';
import { useRuntimeApi } from '../contexts/RuntimeContext.js';

interface ScreenReaderFooterProps {
  model: string;
  historyTokenCount: number;
  sessionTokenTotal?: number;
  errorCount: number;
}

/**
 * Screen reader optimized footer component.
 * Shows essential information in plain text without gradients, colors, or complex responsive behavior.
 */
export const ScreenReaderFooter: React.FC<ScreenReaderFooterProps> = ({
  model,
  historyTokenCount,
  sessionTokenTotal,
  errorCount,
}) => {
  const runtime = useRuntimeApi();

  // Calculate context usage
  const limit = tokenLimit(model);
  const contextUsageText = `Context Usage: ${historyTokenCount.toLocaleString()}/${limit.toLocaleString()} tokens`;

  // Get model display name
  const getDisplayName = () => {
    const providerStatus = runtime.getActiveProviderStatus();
    if (providerStatus.providerName === 'load-balancer') {
      try {
        const providerManager = runtime.getCliProviderManager();
        const lbProvider = providerManager.getProviderByName('load-balancer');
        if (
          lbProvider &&
          'getStats' in lbProvider &&
          typeof (lbProvider as { getStats?: () => unknown }).getStats ===
            'function'
        ) {
          const lbStats = (
            lbProvider as {
              getStats: () => {
                lastSelected: string | null;
                profileName: string;
              };
            }
          ).getStats();
          if (lbStats?.lastSelected) {
            return `${lbStats.lastSelected} via ${lbStats.profileName}`;
          }
        }
      } catch {
        // Silently ignore errors fetching LB stats
      }
    }
    return model;
  };

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" width="100%">
        <Text>Model: {getDisplayName()}</Text>
      </Box>
      <Box flexDirection="row" width="100%">
        <Text>{contextUsageText}</Text>
      </Box>
      {sessionTokenTotal !== undefined && (
        <Box flexDirection="row" width="100%">
          <Text>Session Tokens: {sessionTokenTotal.toLocaleString()}</Text>
        </Box>
      )}
      <Box flexDirection="row" width="100%">
        <Text>Error Count: {errorCount}</Text>
      </Box>
    </Box>
  );
};
