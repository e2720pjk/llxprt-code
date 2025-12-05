/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useStdin } from 'ink';
import { type TabId } from '../contexts/TabContext.js';

export interface TabBarProps {
  tabs: Array<{
    id: TabId;
    label: string;
    hasUpdates?: boolean;
  }>;
  activeTab: TabId;
  onSwitch: (tabId: TabId) => void;
  width?: number;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTab,
  onSwitch,
  width,
}) => {
  const { isRawModeSupported, stdin, setRawMode } = useStdin();

  React.useEffect(() => {
    if (isRawModeSupported) {
      const handleKeyPress = (
        _ch: string,
        key: {
          name: string;
          ctrl: boolean;
          shift: boolean;
          meta: boolean;
        } | null,
      ): void => {
        if (!key) return;

        // Ctrl+1/2/3/4 for direct tab access
        if (key.ctrl && !key.shift && !key.meta) {
          switch (key.name) {
            case '1':
              onSwitch('chat');
              return;
            case '2':
              onSwitch('debug');
              return;
            case '3':
              onSwitch('todo');
              return;
            case '4':
              onSwitch('system');
              return;
            default:
              // Handle other keys if needed
              break;
          }
        }

        // Ctrl+Tab / Ctrl+Shift+Tab for sequential navigation
        if (key.ctrl && key.name === 'tab') {
          const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
          if (currentIndex !== -1) {
            if (key.shift) {
              // Previous tab
              const prevIndex =
                currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
              onSwitch(tabs[prevIndex].id);
            } else {
              // Next tab
              const nextIndex = (currentIndex + 1) % tabs.length;
              onSwitch(tabs[nextIndex].id);
            }
          }
          return;
        }

        // Return for other keys
        return;
      };

      setRawMode(true);
      stdin.on('keypress', handleKeyPress);

      return () => {
        stdin.removeListener('keypress', handleKeyPress);
        setRawMode(false);
      };
    }
    return undefined;
  }, [isRawModeSupported, stdin, setRawMode, tabs, activeTab, onSwitch]);

  const separator = ' | ';

  return (
    <Box flexDirection="row" width={width}>
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab;
        const colors = isActive
          ? {
              backgroundColor: 'green',
              color: 'black',
            }
          : {
              color: 'gray',
            };

        return (
          <Box key={tab.id} flexDirection="row">
            {index !== 0 && <Text color="dim">{separator}</Text>}
            <Box>
              <Text {...colors}>
                {tab.label}
                {tab.hasUpdates && !isActive && <Text color="yellow">●</Text>}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
