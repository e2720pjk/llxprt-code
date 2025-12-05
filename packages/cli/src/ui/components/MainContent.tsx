/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Static } from 'ink';
import { type Config } from '@vybestack/llxprt-code-core';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAppContext } from '../contexts/AppContext.js';
import { AppHeader } from './AppHeader.js';
import { useRenderMode } from '../hooks/useRenderMode.js';
import { SCROLL_TO_ITEM_END } from './shared/VirtualizedList.js';
import { ScrollableList } from './shared/ScrollableList.js';
import { useMemo, memo, useCallback } from 'react';
import { type HistoryItem } from '../types.js';

const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
const MemoizedAppHeader = memo(AppHeader);

const getEstimatedItemHeight = () => 100;

const keyExtractor = (
  item: {
    type: 'header' | 'history' | 'pending' | 'pending-streaming';
    item?: HistoryItem;
  },
  _index: number,
) => {
  if (item.type === 'header') return 'header';
  if (item.type === 'history' && item.item) return item.item.id.toString();
  if (item.type === 'pending' && item.item) return `pending-${item.item.id}`;
  return 'pending-streaming';
};

// Limit Gemini messages to a very high number of lines to mitigate performance
// issues in the worst case if we somehow get an enormous response from Gemini.
// This threshold is arbitrary but should be high enough to never impact normal
// usage.
export const MainContent = ({ config }: { config: Config }) => {
  const { version } = useAppContext();
  const uiState = useUIState();
  const renderMode = useRenderMode();

  const {
    pendingHistory,
    pendingHistoryItems,
    mainAreaWidth,
    availableTerminalHeight,
  } = uiState;

  const pendingItems = useMemo(
    () => (
      <OverflowProvider>
        <Box flexDirection="column">
          {pendingHistoryItems.map((item, i) => {
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
                activeShellPtyId={uiState.activePtyId}
                config={config}
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
      availableTerminalHeight,
      mainAreaWidth,
      uiState.isEditorDialogOpen,
      config,
      uiState.activePtyId,
      uiState.slashCommands,
    ],
  );

  // Static history items for accessibility and screen readers
  const staticHistoryItems = useMemo(
    () =>
      uiState.history.map((h) => (
        <HistoryItemDisplay
          terminalWidth={mainAreaWidth}
          availableTerminalHeight={availableTerminalHeight}
          key={h.id}
          item={h}
          isPending={false}
          slashCommands={uiState.slashCommands}
          activeShellPtyId={uiState.activePtyId}
          config={config}
        />
      )),
    [
      uiState.history,
      mainAreaWidth,
      availableTerminalHeight,
      uiState.slashCommands,
      uiState.activePtyId,
      config,
    ],
  );

  // Virtualized data for alternate buffer mode
  const virtualizedData = useMemo(
    () => [
      { type: 'header' as const },
      ...uiState.history.map((item) => ({ type: 'history' as const, item })),
      ...(pendingHistory.length > 0
        ? pendingHistory.map((item) => ({ type: 'pending' as const, item }))
        : []),
      { type: 'pending-streaming' as const },
    ],
    [uiState.history, pendingHistory],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof virtualizedData)[number] }) => {
      if (item.type === 'header') {
        return <MemoizedAppHeader key="app-header" version={version} />;
      } else if (item.type === 'history') {
        return (
          <MemoizedHistoryItemDisplay
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={availableTerminalHeight}
            key={item.item.id}
            item={item.item}
            isPending={false}
            slashCommands={uiState.slashCommands}
            activeShellPtyId={uiState.activePtyId}
            config={config}
          />
        );
      } else if (item.type === 'pending' && item.item) {
        return (
          <MemoizedHistoryItemDisplay
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={availableTerminalHeight}
            key={item.item.id}
            item={item.item}
            isPending={true}
            isFocused={!uiState.isEditorDialogOpen}
            slashCommands={uiState.slashCommands}
            activeShellPtyId={uiState.activePtyId}
            config={config}
          />
        );
      } else {
        return pendingItems;
      }
    },
    [
      version,
      mainAreaWidth,
      availableTerminalHeight,
      pendingItems,
      config,
      uiState.slashCommands,
      uiState.activePtyId,
      uiState.isEditorDialogOpen,
    ],
  );

  if (renderMode === 'virtualized') {
    return (
      <ScrollableList
        hasFocus={!uiState.isEditorDialogOpen}
        data={virtualizedData}
        renderItem={renderItem}
        estimatedItemHeight={getEstimatedItemHeight}
        keyExtractor={keyExtractor}
        initialScrollIndex={SCROLL_TO_ITEM_END}
        initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
      />
    );
  }

  // Static rendering for screen readers and accessibility
  return (
    <>
      <Static
        key={uiState.historyRemountKey}
        items={[
          <AppHeader key="app-header" version={version} />,
          ...staticHistoryItems,
        ]}
      >
        {(item) => item}
      </Static>
      {pendingItems}
    </>
  );
};
