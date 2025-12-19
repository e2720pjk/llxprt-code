/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettings } from '../contexts/SettingsContext.js';
import { useIsScreenReaderEnabled } from 'ink';
import { isAlternateBufferEnabled } from './useAlternateBuffer.js';

export type RenderMode = 'static' | 'virtualized';

/**
 * Determines the optimal rendering mode based on user preferences and capabilities.
 *
 * - Static mode: Used for screen readers or when alternate buffer is disabled.
 *   Renders all content at once for better accessibility.
 * - Virtualized mode: Used when alternate buffer is enabled and no screen reader.
 *   Renders only visible content for better performance.
 *
 * @returns The optimal render mode for the current user configuration.
 */
export const useRenderMode = (): RenderMode => {
  const settings = useSettings();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const isAltBufferEnabled = isAlternateBufferEnabled(settings);

  // Use static rendering for screen readers or when alternate buffer is disabled
  if (isScreenReaderEnabled || !isAltBufferEnabled) {
    return 'static';
  }

  // Use virtualized rendering for optimal performance with alternate buffer
  return 'virtualized';
};
