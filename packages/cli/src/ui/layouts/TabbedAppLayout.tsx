/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import type { Config } from '@vybestack/llxprt-code-core';
import type { DOMElement } from 'ink';
import type { LoadedSettings } from '../../config/settings.js';
import type { UpdateObject } from '../utils/updateCheck.js';

// Tab components
import { TabBar } from '../components/TabBar.js';
import { TabProvider, useTabContext } from '../contexts/TabContext.js';
import { ChatTab } from '../components/tabs/ChatTab.js';
import { DebugTab } from '../components/tabs/DebugTab.js';
import { TodoTab } from '../components/tabs/TodoTab.js';
import { SystemTab } from '../components/tabs/SystemTab.js';

interface TabbedAppLayoutProps {
  config: Config;
  settings: LoadedSettings;
  startupWarnings: string[];
  version: string;
  nightly: boolean;
  mainControlsRef: React.RefObject<DOMElement | null>;
  availableTerminalHeight: number;
  contextFileNames: string[];
  updateInfo: UpdateObject | null;
}

const TabbedAppLayoutContent: React.FC<TabbedAppLayoutProps> = (props) => {
  const { state: tabState, switchTab } = useTabContext();

  const renderActiveTab = () => {
    switch (tabState.activeTab) {
      case 'chat':
        return <ChatTab {...props} />;
      case 'debug':
        return <DebugTab />;
      case 'todo':
        return <TodoTab />;
      case 'system':
        return (
          <SystemTab
            config={props.config}
            settings={props.settings}
            version={props.version}
            nightly={props.nightly}
          />
        );
      default:
        return <ChatTab {...props} />;
    }
  };

  return (
    <Box flexDirection="column" width="100%">
      <TabBar
        tabs={tabState.tabs}
        activeTab={tabState.activeTab}
        onSwitch={switchTab}
      />
      <Box flexDirection="column" marginTop={1}>
        {renderActiveTab()}
      </Box>
    </Box>
  );
};

export const TabbedAppLayout: React.FC<TabbedAppLayoutProps> = (props) => (
  <TabProvider>
    <TabbedAppLayoutContent {...props} />
  </TabProvider>
);
