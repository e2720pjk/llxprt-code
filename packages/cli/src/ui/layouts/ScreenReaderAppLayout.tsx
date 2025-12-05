/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import type { Config } from '@vybestack/llxprt-code-core';
import { MainContent } from '../components/MainContent.js';
import { Footer } from '../components/Footer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useFlickerDetector } from '../hooks/useFlickerDetector.js';

interface ScreenReaderAppLayoutProps {
  config: Config;
}

/**
 * Screen reader optimized layout component.
 * Places Footer at the top and uses 90% width for better screen reader experience.
 * Optimized component order for accessibility.
 */
export const ScreenReaderAppLayout: React.FC<ScreenReaderAppLayoutProps> = ({
  config,
}) => {
  const { rootUiRef, terminalHeight, constrainHeight } = useUIState();

  useFlickerDetector(rootUiRef, terminalHeight, constrainHeight);

  return (
    <Box flexDirection="column" width="90%" height="100%" ref={rootUiRef}>
      <Footer />
      <Box flexGrow={1} overflow="hidden">
        <MainContent config={config} />
      </Box>
    </Box>
  );
};
