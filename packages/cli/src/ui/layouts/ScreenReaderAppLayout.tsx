/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import type { Config } from '@vybestack/llxprt-code-core';
import { MainContent } from '../components/MainContent.js';
import { ScreenReaderFooter } from '../components/ScreenReaderFooter.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useFlickerDetector } from '../hooks/useFlickerDetector.js';
import { StreamingContext } from '../contexts/StreamingContext.js';

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
  const {
    rootUiRef,
    terminalHeight,
    constrainHeight,
    currentModel,
    errorCount,
    historyTokenCount,
    tokenMetrics,
    streamingState,
  } = useUIState();

  useFlickerDetector(rootUiRef, terminalHeight, constrainHeight);

  return (
    <Box flexDirection="column" width="90%" height="100%" ref={rootUiRef}>
      <ScreenReaderFooter
        model={currentModel}
        historyTokenCount={historyTokenCount}
        sessionTokenTotal={tokenMetrics.sessionTokenTotal}
        errorCount={errorCount}
      />
      <StreamingContext.Provider value={streamingState}>
        <Box flexGrow={1} overflow="hidden">
          <MainContent config={config} />
        </Box>
      </StreamingContext.Provider>
    </Box>
  );
};
