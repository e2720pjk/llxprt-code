/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useTodoContext } from '../contexts/TodoContext.js';
import { useToolCallContext } from '../contexts/ToolCallContext.js';
import { useResponsive } from './useResponsive.js';
import { TodoPanelItem } from '../components/TodoPanel.js';

export const useTodoVirtualizedData = () => {
  const { todos } = useTodoContext();
  const { getExecutingToolCalls } = useToolCallContext();
  const { isNarrow, isStandard } = useResponsive();

  return useMemo(() => {
    const items: TodoPanelItem[] = [];

    // Always start with AppHeader then Todo header
    items.push({ type: 'header' });
    items.push({ type: 'todo-header' });

    if (todos.length === 0) {
      items.push({ type: 'no-todos' });
      return items;
    }

    if (isNarrow) {
      items.push({ type: 'summary', todos });
    } else if (isStandard) {
      // Abbreviated items
      for (const todo of todos) {
        items.push({
          type: 'todo-item',
          todo,
          allToolCalls: [], // No tool calls in abbreviated mode
          abbreviated: true,
        });
      }
    } else {
      // isWide - Full items
      for (const todo of todos) {
        const allToolCalls = getExecutingToolCalls(todo.id);
        items.push({
          type: 'todo-item',
          todo,
          allToolCalls,
          abbreviated: false,
        });
      }
    }

    return items;
  }, [todos, getExecutingToolCalls, isNarrow, isStandard]);
};
