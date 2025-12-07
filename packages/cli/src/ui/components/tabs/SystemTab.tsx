/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useUIState } from '../../contexts/UIStateContext.js';
import { Colors } from '../../colors.js';
import type { Config } from '@vybestack/llxprt-code-core';
import type { LoadedSettings } from '../../../config/settings.js';

interface SystemTabProps {
  config: Config;
  settings: LoadedSettings;
  version: string;
  nightly: boolean;
}

export const SystemTab: React.FC<SystemTabProps> = ({
  config,
  settings,
  version,
  nightly,
}) => {
  const {
    terminalWidth,
    terminalHeight,
    tokenMetrics,
    currentModel,
    elapsedTime,
    debugMessage,
    errorCount,
    historyTokenCount,
    vimModeEnabled,
    vimMode,
    branchName,
  } = useUIState();

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes <= 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const clampedIndex = Math.min(i, sizes.length - 1);
    return (
      Math.round((bytes / Math.pow(1024, clampedIndex)) * 100) / 100 +
      ' ' +
      sizes[clampedIndex]
    );
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <Box flexDirection="column" width="90%">
      <Box marginBottom={1}>
        <Text color={Colors.AccentBlue} bold>
          System Information
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>
          Application
        </Text>
        <Text>
          Version: {version} {nightly && '(nightly)'}
        </Text>
        <Text>Model: {currentModel}</Text>
        <Text>Target Directory: {config.getTargetDir()}</Text>
        <Text>Branch: {branchName || 'N/A'}</Text>
        <Text>Session Time: {formatTime(elapsedTime)}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>
          Terminal
        </Text>
        <Text>
          Dimensions: {terminalWidth}x{terminalHeight}
        </Text>
        <Text>
          Vim Mode: {vimModeEnabled ? `Enabled (${vimMode})` : 'Disabled'}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>
          Performance
        </Text>
        <Text>Tokens/Minute: {tokenMetrics.tokensPerMinute}</Text>
        <Text>Session Tokens: {tokenMetrics.sessionTokenTotal}</Text>
        <Text>History Tokens: {historyTokenCount}</Text>
        <Text>Throttle Wait: {tokenMetrics.throttleWaitTimeMs}ms</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>
          Status
        </Text>
        <Text>Errors: {errorCount}</Text>
        <Text>
          Debug Mode: {config.getDebugMode() ? 'Enabled' : 'Disabled'}
        </Text>
        {debugMessage && <Text>Debug: {debugMessage}</Text>}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>
          Memory Usage
        </Text>
        {React.useMemo(() => {
          const memUsage = process.memoryUsage();
          return (
            <>
              <Text>RSS: {formatBytes(memUsage.rss)}</Text>
              <Text>Heap Used: {formatBytes(memUsage.heapUsed)}</Text>
              <Text>Heap Total: {formatBytes(memUsage.heapTotal)}</Text>
              <Text>External: {formatBytes(memUsage.external)}</Text>
            </>
          );
        }, [])}
      </Box>

      <Box flexDirection="column">
        <Text color={Colors.AccentYellow} bold>
          Configuration
        </Text>
        <Text>
          Screen Reader: {config.getScreenReader() ? 'Enabled' : 'Disabled'}
        </Text>
        <Text>Trusted Folder: {config.isTrustedFolder() ? 'Yes' : 'No'}</Text>
        <Text>
          Show TODO Panel:{' '}
          {(settings.merged.ui?.showTodoPanel ?? true) ? 'Yes' : 'No'}
        </Text>
        <Text>
          Hide Footer:{' '}
          {(settings.merged.ui?.hideFooter ?? false) ? 'Yes' : 'No'}
        </Text>
      </Box>
    </Box>
  );
};
