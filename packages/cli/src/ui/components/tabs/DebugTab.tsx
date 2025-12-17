/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Static, Text } from 'ink';
import { Colors } from '../../colors.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';

export const DebugTab: React.FC = () => {
  const { consoleMessages, availableTerminalHeight, terminalWidth } =
    useUIState();

  // Filter debug messages based on debug mode (assuming debug mode is handled in UIState)
  const filteredMessages = consoleMessages.filter(
    (msg) => msg.type !== 'debug',
  );

  const debugContent = (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color={Colors.AccentYellow}>
          Debug Console
        </Text>
        <Text color={Colors.Gray}> ({filteredMessages.length} messages)</Text>
      </Box>

      {filteredMessages.length === 0 ? (
        <Text color={Colors.Gray}>No console messages to display.</Text>
      ) : (
        <MaxSizedBox
          maxHeight={availableTerminalHeight - 8} // Leave space for header and padding
          maxWidth={terminalWidth - 4} // Account for padding
        >
          {filteredMessages.map((msg, index) => {
            let textColor = Colors.Foreground;
            let icon = 'INFO:';

            switch (msg.type) {
              case 'warn':
                textColor = Colors.AccentYellow;
                icon = 'WARNING:';
                break;
              case 'error':
                textColor = Colors.AccentRed;
                icon = 'ERROR:';
                break;
              case 'debug':
                textColor = Colors.Gray;
                icon = 'DEBUG:';
                break;
              case 'log':
              default:
                // Default textColor and icon are already set
                break;
            }

            return (
              <Box key={index} flexDirection="row" marginBottom={1}>
                <Text color={textColor}>{icon} </Text>
                <Text color={textColor} wrap="wrap">
                  {msg.content}
                  {msg.count && msg.count > 1 && (
                    <Text color={Colors.Gray}> (x{msg.count})</Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </MaxSizedBox>
      )}
    </Box>
  );

  // Use Static rendering for better performance and accessibility
  // For console logs, static rendering is preferred as it's a log view
  return <Static items={[debugContent]}>{(item) => item}</Static>;
};
