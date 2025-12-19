/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import type { Config } from '@vybestack/llxprt-code-core';

interface McpStatusProps {
  config: Config;
}

export const McpStatus: React.FC<McpStatusProps> = ({ config }) => {
  const mcpServers = config.getMcpServers() || {};
  const serverNames = Object.keys(mcpServers);

  if (serverNames.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Text color={Colors.AccentYellow} bold underline>
        MCP SERVERS
      </Text>
      {serverNames.map((name) => {
        const server = mcpServers[name];
        const statusText = 'active';
        const statusColor = Colors.AccentGreen;
        const endpoint = server.command
          ? `${server.command} ${server.args?.join(' ') || ''}`
          : server.url || server.httpUrl || 'unknown';

        return (
          <Box key={name} flexDirection="row">
            <Text color={Colors.Foreground} bold>
              • {name}:{' '}
            </Text>
            <Text color={Colors.Gray}>{endpoint} </Text>
            <Text color={statusColor}>[{statusText}]</Text>
          </Box>
        );
      })}
    </Box>
  );
};
