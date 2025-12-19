/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import { TodoPanel } from '../TodoPanel.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useAppContext } from '../../contexts/AppContext.js';
import { AppHeader } from '../AppHeader.js';

export const TodoTab: React.FC = () => {
  const { inputWidth, terminalWidth, config } = useUIState();
  const { version } = useAppContext();

  return (
    <Box flexDirection="column" width={inputWidth}>
      <AppHeader
        version={version}
        config={config}
        terminalWidth={terminalWidth}
      />
      <Box paddingX={1}>
        <TodoPanel width={inputWidth - 2} />
      </Box>
    </Box>
  );
};
