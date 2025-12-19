/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Static, Text, useIsScreenReaderEnabled } from 'ink';
import { type Config } from '@vybestack/llxprt-code-core';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useAppContext } from '../contexts/AppContext.js';
import { AppHeader } from './AppHeader.js';
import { TabBar } from './TabBar.js';
// import { TodoPanel } from './TodoPanel.js';
import { SystemTab } from './tabs/SystemTab.js';
import { useRenderMode } from '../hooks/useRenderMode.js';
import { SCROLL_TO_ITEM_END } from './shared/VirtualizedList.js';
import { ScrollableList } from './shared/ScrollableList.js';
import { useTodoVirtualizedData } from '../hooks/useTodoVirtualizedData.js';
import {
  renderTodo,
  renderTodoAbbreviated,
  renderTodoSummary,
  type TodoPanelItem,
} from './TodoPanel.js';
import { useMemo, memo, useCallback } from 'react';
import {
  type HistoryItem,
  type HistoryItemWithoutId,
  type ConsoleMessageItem,
} from '../types.js';
import { Colors, SemanticColors } from '../colors.js';
import { McpStatus } from './McpStatus.js';
import { DebugProfiler } from './DebugProfiler.js';
import { ConsoleSummaryDisplay } from './ConsoleSummaryDisplay.js';

const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
const MemoizedAppHeader = memo(AppHeader);

type MainContentItem =
  | TodoPanelItem
  | { type: 'mcp-status' }
  | { type: 'debug-profiler' }
  | { type: 'error-summary' }
  | { type: 'early-log'; msg: ConsoleMessageItem; index: number | string }
  | { type: 'log'; msg: ConsoleMessageItem; index: number | string }
  | { type: 'history'; item: HistoryItem }
  | { type: 'pending'; item: HistoryItem }
  | { type: 'pending-streaming' };

const getEstimatedItemHeight = () => 100;
const getDebugEstimatedHeight = () => 2;

// const staticItemRenderer = (item: React.ReactNode) => item;

// Removed debugKeyExtractor in favor of generic keyExtractor

const keyExtractor = (item: MainContentItem, index: number): string => {
  if (item.type === 'header') return 'header';
  if (item.type === 'todo-header') return 'todo-header';
  if (item.type === 'no-todos') return 'no-todos';
  if (item.type === 'summary') return 'todo-summary';
  if (item.type === 'todo-item') return `todo-${item.todo.id}`;
  if (item.type === 'mcp-status') return 'mcp';
  if (item.type === 'debug-profiler') return 'debug-profiler';
  if (item.type === 'error-summary') return 'error-summary';
  if (item.type === 'early-log') return `early-log-${item.index}`;
  if (item.type === 'log') return `log-${item.index}`;
  if (item.type === 'history') return String(item.item.id);
  if (item.type === 'pending') return `pending-${item.item.id}`;
  if (item.type === 'pending-streaming') return 'pending-streaming';
  return `item-${index}`;
};

// Limit Gemini messages to a very high number of lines to mitigate performance
// issues in the worst case if we somehow get an enormous response from Gemini.
// This threshold is arbitrary but should be high enough to never impact normal
// usage.
export const MainContent = ({ config }: { config: Config }) => {
  const { version } = useAppContext();
  const uiState = useUIState();
  const uiActions = useUIActions();
  const renderMode = useRenderMode();
  const isScreenReaderEnabled =
    useIsScreenReaderEnabled() || config.getScreenReader();
  const { terminalWidth } = uiState;

  const { activeTab, tabs } = uiState;

  const {
    history,
    pendingHistory,
    pendingHistoryItems,
    mainAreaWidth,
    availableTerminalHeight,
    streamingState,
  } = uiState;

  const pendingItems = useMemo(
    () => (
      <OverflowProvider>
        <Box flexDirection="column">
          {pendingHistoryItems.map((item: HistoryItemWithoutId, i: number) => {
            // Use negative IDs for pending items to avoid collision with persisted items (positive IDs)
            // and ensure keys are unique within the list.
            const pendingId = -1 - i;
            return (
              <HistoryItemDisplay
                key={pendingId}
                availableTerminalHeight={
                  uiState.constrainHeight ? availableTerminalHeight : undefined
                }
                terminalWidth={mainAreaWidth}
                item={{ ...item, id: pendingId }}
                isPending={true}
                isFocused={!uiState.isEditorDialogOpen}
                slashCommands={uiState.slashCommands}
                activeShellPtyId={uiState.activeShellPtyId}
                config={config}
                filterTodoTools={uiState.activeTab === 'chat'}
              />
            );
          })}
          <ShowMoreLines constrainHeight={uiState.constrainHeight} />
        </Box>
      </OverflowProvider>
    ),
    [
      pendingHistoryItems,
      uiState.constrainHeight,
      uiState.activeTab,
      availableTerminalHeight,
      mainAreaWidth,
      uiState.isEditorDialogOpen,
      config,
      uiState.activeShellPtyId,
      uiState.slashCommands,
    ],
  );

  // Separate early logs from normal ones
  const { earlyLogs, normalLogs } = useMemo(() => {
    const early: ConsoleMessageItem[] = [];
    const normal: ConsoleMessageItem[] = [];
    uiState.consoleMessages.forEach((msg: ConsoleMessageItem) => {
      if (msg.isEarly) {
        early.push(msg);
      } else {
        normal.push(msg);
      }
    });
    return { earlyLogs: early, normalLogs: normal };
  }, [uiState.consoleMessages]);

  const renderLogMessage = useCallback(
    (msg: ConsoleMessageItem, index: number | string) => {
      let textColor = Colors.Foreground;
      let icon = 'INFO:';
      switch (msg.type) {
        case 'warn':
          textColor = Colors.AccentYellow;
          icon = 'WARNING:';
          break;
        case 'error':
          textColor = Colors.AccentRed;
          icon = 'ERROR:';
          break;
        case 'debug':
          textColor = Colors.Gray;
          icon = 'DEBUG:';
          break;
        default:
          break;
      }
      return (
        <Box key={`log-${index}`} flexDirection="row" width={mainAreaWidth}>
          <Text color={textColor}>{icon} </Text>
          <Text color={textColor} wrap="wrap">
            {msg.content}
            {msg.count && msg.count > 1 && (
              <Text color={Colors.Gray}> (x{msg.count})</Text>
            )}
          </Text>
        </Box>
      );
    },
    [mainAreaWidth],
  );

  // Logs are handled within virtualized/chat data providers

  const chatVirtualizedData = useMemo(() => {
    const data: MainContentItem[] = [
      ...earlyLogs.map((msg: ConsoleMessageItem, index: number | string) => ({
        type: 'early-log' as const,
        msg,
        index,
      })),
      { type: 'header' as const },
    ];
    for (const item of history) {
      data.push({ type: 'history', item });
    }
    for (const [index, item] of pendingHistory.entries()) {
      data.push({
        type: 'pending' as const,
        item: { ...item, id: -1 - index } as HistoryItem,
      });
    }
    if (streamingState === 'responding') {
      data.push({ type: 'pending-streaming' });
    }
    return data;
  }, [earlyLogs, history, pendingHistory, streamingState]);

  const debugVirtualizedData = useMemo(
    () => [
      ...earlyLogs.map((msg: ConsoleMessageItem, index: number | string) => ({
        type: 'early-log' as const,
        msg,
        index,
      })),
      { type: 'header' as const },
      { type: 'mcp-status' as const },
      { type: 'debug-profiler' as const },
      { type: 'error-summary' as const },
      ...normalLogs.map((msg: ConsoleMessageItem, index: number | string) => ({
        type: 'log' as const,
        msg,
        index,
      })),
    ],
    [earlyLogs, normalLogs],
  );

  const todoVirtualizedData = useTodoVirtualizedData();

  const renderItem = useCallback(
    ({ item }: { item: MainContentItem }) => {
      if (item.type === 'header') {
        return (
          <MemoizedAppHeader
            key="app-header"
            version={version}
            config={config}
            terminalWidth={terminalWidth}
          />
        );
      }
      if (item.type === 'mcp-status') {
        return <McpStatus key="mcp-status" config={config} />;
      }
      if (item.type === 'debug-profiler') {
        return <DebugProfiler key="debug-profiler" />;
      }
      if (item.type === 'error-summary') {
        return (
          <ConsoleSummaryDisplay
            key="error-summary"
            errorCount={uiState.errorCount}
          />
        );
      }
      if (item.type === 'history' && item.item) {
        return (
          <MemoizedHistoryItemDisplay
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={availableTerminalHeight}
            key={item.item.id}
            item={item.item}
            isPending={false}
            slashCommands={uiState.slashCommands}
            activeShellPtyId={uiState.activeShellPtyId}
            config={config}
            filterTodoTools={uiState.activeTab === 'chat'}
          />
        );
      }
      if (item.type === 'pending' && item.item) {
        return (
          <MemoizedHistoryItemDisplay
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={availableTerminalHeight}
            key={item.item.id}
            item={item.item}
            isPending={true}
            isFocused={!uiState.isEditorDialogOpen}
            slashCommands={uiState.slashCommands}
            activeShellPtyId={uiState.activeShellPtyId}
            config={config}
            filterTodoTools={uiState.activeTab === 'chat'}
          />
        );
      }
      if (item.type === 'pending-streaming') {
        return pendingItems;
      }
      if ((item.type === 'log' || item.type === 'early-log') && item.msg) {
        return renderLogMessage(item.msg, item.index ?? 0);
      }
      if (item.type === 'todo-header') {
        return (
          <Box key="todo-header" paddingX={1} marginBottom={1}>
            <Text color={SemanticColors.text.accent} bold>
              Todo Progress
            </Text>
          </Box>
        );
      }
      if (item.type === 'summary') {
        return (
          <Box paddingX={1} flexDirection="column">
            {renderTodoSummary(item.todos)}
          </Box>
        );
      }
      if (item.type === 'no-todos') {
        return (
          <Box paddingX={1}>
            <Text color={Colors.Gray}>No tasks yet.</Text>
          </Box>
        );
      }
      if (item.type === 'todo-item') {
        return (
          <Box paddingX={1} flexDirection="column">
            {item.abbreviated
              ? renderTodoAbbreviated(item.todo, mainAreaWidth - 2)
              : renderTodo(item.todo, item.allToolCalls)}
          </Box>
        );
      }
      return <></>;
    },
    [
      version,
      mainAreaWidth,
      availableTerminalHeight,
      pendingItems,
      config,
      uiState.activeTab,
      uiState.slashCommands,
      uiState.activeShellPtyId,
      uiState.isEditorDialogOpen,
      uiState.errorCount,
      terminalWidth,
      renderLogMessage,
    ],
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'chat':
        if (renderMode === 'virtualized') {
          return (
            <ScrollableList
              hasFocus={!uiState.isEditorDialogOpen}
              data={chatVirtualizedData}
              renderItem={renderItem}
              estimatedItemHeight={getEstimatedItemHeight}
              keyExtractor={keyExtractor}
              initialScrollIndex={SCROLL_TO_ITEM_END}
              initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
            />
          );
        }
        return (
          <>
            <Static key={uiState.staticKey} items={chatVirtualizedData}>
              {(item: MainContentItem) => renderItem({ item })}
            </Static>
            {pendingItems}
          </>
        );

      case 'debug':
        if (renderMode === 'virtualized') {
          return (
            <ScrollableList
              hasFocus={!uiState.isEditorDialogOpen}
              data={debugVirtualizedData}
              renderItem={renderItem}
              estimatedItemHeight={getDebugEstimatedHeight}
              keyExtractor={keyExtractor}
              initialScrollIndex={SCROLL_TO_ITEM_END}
              initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
            />
          );
        }
        return (
          <Static key={uiState.staticKey} items={debugVirtualizedData}>
            {(item: MainContentItem) => renderItem({ item })}
          </Static>
        );

      case 'todo':
        if (renderMode === 'virtualized') {
          return (
            <ScrollableList
              hasFocus={!uiState.isEditorDialogOpen}
              data={todoVirtualizedData}
              renderItem={renderItem}
              estimatedItemHeight={getEstimatedItemHeight}
              keyExtractor={keyExtractor}
            />
          );
        }
        return (
          <Static key={uiState.staticKey} items={todoVirtualizedData}>
            {(item: TodoPanelItem) => renderItem({ item })}
          </Static>
        );
      case 'system':
        return <SystemTab />;
      default:
        return null;
    }
  };

  return (
    <Box
      flexDirection="column"
      height={
        renderMode === 'virtualized' || uiState.constrainHeight
          ? uiState.availableTerminalHeight
          : undefined
      }
    >
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        {renderTabContent()}
      </Box>
      {isScreenReaderEnabled ? (
        <Text>Current Tab: [{activeTab}]</Text>
      ) : (
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onSwitch={uiActions.setActiveTab}
        />
      )}
    </Box>
  );
};
