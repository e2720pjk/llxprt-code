/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import { useUIState } from '../../contexts/UIStateContext.js';
import { TodoPanel } from '../TodoPanel.js';

export const TodoTab: React.FC = () => {
  const { inputWidth } = useUIState();

  return (
    <Box flexDirection="column" width="90%">
      <TodoPanel width={inputWidth} fullScreen={true} />
    </Box>
  );
};
