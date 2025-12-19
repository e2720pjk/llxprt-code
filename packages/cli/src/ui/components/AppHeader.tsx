/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { Header } from './Header.js';
import { Tips } from './Tips.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import type { Config } from '@vybestack/llxprt-code-core';

interface AppHeaderProps {
  version: string;
  config: Config;
  terminalWidth: number;
}

export const AppHeader = ({
  version,
  config,
  terminalWidth,
}: AppHeaderProps) => {
  const settings = useSettings();
  const { nightly } = useUIState();
  return (
    <Box flexDirection="column">
      {!(settings.merged.ui?.hideBanner || config.getScreenReader()) && (
        <Header
          version={version}
          nightly={nightly}
          terminalWidth={terminalWidth}
        />
      )}
      {!(settings.merged.ui?.hideTips || config.getScreenReader()) && (
        <Tips config={config} />
      )}
    </Box>
  );
};
