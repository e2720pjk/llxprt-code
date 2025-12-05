/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';

export type TabId = 'chat' | 'debug' | 'todo' | 'system';

export interface Tab {
  id: TabId;
  label: string;
  hasUpdates: boolean;
}

export interface TabState {
  activeTab: TabId;
  tabs: Tab[];
}

export interface TabContextValue {
  state: TabState;
  switchTab: (tabId: TabId) => void;
  markTabRead: (tabId: TabId) => void;
  markTabUnread: (tabId: TabId) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

export interface TabProviderProps {
  children: React.ReactNode;
}

export const TabProvider: React.FC<TabProviderProps> = ({ children }) => {
  const [state, setState] = useState<TabState>(() => ({
    activeTab: 'chat',
    tabs: [
      { id: 'chat', label: 'Chat', hasUpdates: false },
      { id: 'debug', label: 'Debug', hasUpdates: false },
      { id: 'todo', label: 'TODO', hasUpdates: false },
      { id: 'system', label: 'System', hasUpdates: false },
    ],
  }));

  const switchTab = useCallback((tabId: TabId) => {
    setState((prevState) => {
      // Mark the tab we're switching to as read
      const updatedTabs = prevState.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, hasUpdates: false } : tab,
      );

      return {
        ...prevState,
        activeTab: tabId,
        tabs: updatedTabs,
      };
    });
  }, []);

  const markTabRead = useCallback((tabId: TabId) => {
    setState((prevState) => ({
      ...prevState,
      tabs: prevState.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, hasUpdates: false } : tab,
      ),
    }));
  }, []);

  const markTabUnread = useCallback((tabId: TabId) => {
    setState((prevState) => ({
      ...prevState,
      tabs: prevState.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, hasUpdates: true } : tab,
      ),
    }));
  }, []);

  const value = useMemo<TabContextValue>(
    () => ({
      state,
      switchTab,
      markTabRead,
      markTabUnread,
    }),
    [state, switchTab, markTabRead, markTabUnread],
  );

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
};

export const useTabContext = (): TabContextValue => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabContext must be used within a TabProvider');
  }
  return context;
};
