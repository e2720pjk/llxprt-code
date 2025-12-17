/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors, SemanticColors } from '../../colors.js';
import { useUIState } from '../../contexts/UIStateContext.js';

export const SystemTab: React.FC = () => {
  const {
    tokenMetrics,
    vimModeEnabled,
    terminalWidth,
    terminalHeight,
    isNarrow,
    config,
    errorCount,
  } = useUIState();

  const memoryUsage = React.useMemo(() => {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
    };
  }, []);

  const formatBytes = (bytes: number) => `${bytes}MB`;

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>
          System Information
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={SemanticColors.text.primary} bold>
          Memory Usage
        </Text>
        <Text color={SemanticColors.text.secondary}>
          RSS: {formatBytes(memoryUsage.rss)} | Heap:{' '}
          {formatBytes(memoryUsage.heapUsed)}/
          {formatBytes(memoryUsage.heapTotal)} | External:{' '}
          {formatBytes(memoryUsage.external)}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={SemanticColors.text.primary} bold>
          Terminal
        </Text>
        <Text color={SemanticColors.text.secondary}>
          Size: {terminalWidth}x{terminalHeight} | Narrow:{' '}
          {isNarrow ? 'Yes' : 'No'}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={SemanticColors.text.primary} bold>
          UI State
        </Text>
        <Text color={SemanticColors.text.secondary}>
          Vim Mode: {vimModeEnabled ? 'Enabled' : 'Disabled'} | Errors:{' '}
          {errorCount}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={SemanticColors.text.primary} bold>
          Token Metrics
        </Text>
        <Text color={SemanticColors.text.secondary}>
          Tokens/min: {tokenMetrics.tokensPerMinute} | Throttle:{' '}
          {tokenMetrics.throttleWaitTimeMs}ms | Total:{' '}
          {tokenMetrics.sessionTokenTotal}
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text color={SemanticColors.text.primary} bold>
          Configuration
        </Text>
        <Text color={SemanticColors.text.secondary}>
          Provider: {config.getProvider() || 'Unknown'} | Model:{' '}
          {config.getModel()}
        </Text>
      </Box>
    </Box>
  );
};
