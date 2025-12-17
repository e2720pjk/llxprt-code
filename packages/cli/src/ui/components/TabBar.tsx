/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { Colors } from '../colors.js';
import type { TabId } from '../contexts/UIStateContext.js';

interface TabBarProps {
  tabs: Array<{ id: TabId; label: string; hasUpdates?: boolean }>;
  activeTab: TabId;
  onSwitch: (tabId: TabId) => void;
}

export const TabBar = ({ tabs, activeTab, onSwitch }: TabBarProps) => {
  useKeypress(
    (key) => {
      if (keyMatchers[Command.TAB_CYCLE](key)) {
        const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
        const nextIndex = (currentIndex + 1) % tabs.length;
        onSwitch(tabs[nextIndex].id);
      }
    },
    { isActive: true },
  );

  return (
    <Box borderStyle="single" borderColor={Colors.AccentBlue} paddingX={1}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const hasUpdates = tab.hasUpdates;

        return (
          <Text
            key={tab.id}
            color={
              isActive
                ? Colors.AccentYellow
                : hasUpdates
                  ? Colors.AccentGreen
                  : undefined
            }
            bold={isActive}
          >
            {isActive ? '[' : ' '}
            {tab.label}
            {isActive ? ']' : ' '}
            {tab.id !== tabs[tabs.length - 1].id ? ' |' : ''}
          </Text>
        );
      })}
      <Text dimColor> (Ctrl+1-4 to switch, Ctrl+O to cycle)</Text>
    </Box>
  );
};
