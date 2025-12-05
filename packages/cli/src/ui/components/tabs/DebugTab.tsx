/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Static, Text } from 'ink';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useTabContext } from '../../contexts/TabContext.js';
import { Colors } from '../../colors.js';

const getColorByLevel = (level: string) => {
  switch (level.toLowerCase()) {
    case 'error':
      return Colors.AccentRed;
    case 'warn':
    case 'warning':
      return Colors.AccentYellow;
    case 'info':
      return Colors.AccentBlue;
    case 'debug':
      return Colors.Gray;
    default:
      return 'white';
  }
};

export const DebugTab: React.FC = () => {
  const { consoleMessages } = useUIState();
  const { state: tabState } = useTabContext();

  // Force Static remount when switching to/from debug tab to maintain isolation
  // Uses distinct keys to ensure Ink's Static component resets properly
  const debugStaticKey = `debug-static-${tabState.activeTab === 'debug' ? 'active' : 'inactive'}`;

  return (
    <Box flexDirection="column" width="90%">
      <Box marginBottom={1}>
        <Text color={Colors.AccentBlue} bold>
          Debug Console
        </Text>
      </Box>

      {consoleMessages.length === 0 ? (
        <Box>
          <Text color={Colors.Gray}>No debug messages yet.</Text>
        </Box>
      ) : (
        <Static
          key={debugStaticKey}
          items={consoleMessages.map((msg, index) => ({ msg, index }))}
        >
          {({ msg, index }) => (
            <Box key={index} flexDirection="column" marginBottom={0}>
              <Box>
                <Text color={getColorByLevel(msg.type)}>
                  [{msg.timestamp}] {msg.type.toUpperCase()}:
                </Text>
                <Text> {msg.content}</Text>
              </Box>
            </Box>
          )}
        </Static>
      )}

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Total messages: {consoleMessages.length}
        </Text>
      </Box>
    </Box>
  );
};
