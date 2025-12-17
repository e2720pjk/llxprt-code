/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import { TodoPanel } from '../TodoPanel.js';
import { useUIState } from '../../contexts/UIStateContext.js';

export const TodoTab: React.FC = () => {
  const { inputWidth } = useUIState();

  return (
    <Box flexDirection="column" width={inputWidth}>
      <TodoPanel width={inputWidth} />
    </Box>
  );
};
