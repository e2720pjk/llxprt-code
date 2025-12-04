/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';

export const SimpleTabs: React.FC = () => {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          🚀 Tabs Architecture - Phase 1 Implementation
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text color="green">✅ TabContext - State management</Text>
        <Text color="green">✅ TabBar - Visual tab navigation</Text>
        <Text color="green">✅ Keyboard shortcuts - Ctrl+1/2/3/4</Text>
        <Text color="green">✅ Individual tab components</Text>
        <Text color="green">✅ Performance optimizations</Text>
        <Text color="yellow">⚠️ Feature flag: LLXPRT_ENABLE_TABS=true</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">
          This tabs implementation addresses the flicker and scrollback issues
          by isolating dynamic components from Static content.
        </Text>
      </Box>
    </Box>
  );
};
