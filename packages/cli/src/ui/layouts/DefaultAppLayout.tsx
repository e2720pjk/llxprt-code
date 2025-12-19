/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, type DOMElement, Text } from 'ink';
import type { Config } from '@vybestack/llxprt-code-core';
import { ApprovalMode } from '@vybestack/llxprt-code-core';
import { StreamingState } from '../types.js';
import { LoadedSettings } from '../../config/settings.js';
import { UpdateObject } from '../utils/updateCheck.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { StreamingContext } from '../contexts/StreamingContext.js';
import { Colors } from '../colors.js';
import { useFlickerDetector } from '../hooks/useFlickerDetector.js';

// Components
import { MainContent } from '../components/MainContent.js';
import { HistoryItemDisplay } from '../components/HistoryItemDisplay.js';
import { Notifications } from '../components/Notifications.js';
// import { TodoPanel } from '../components/TodoPanel.js';
import { Footer } from '../components/Footer.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { LoadingIndicator } from '../components/LoadingIndicator.js';
import { AutoAcceptIndicator } from '../components/AutoAcceptIndicator.js';
import { ShellModeIndicator } from '../components/ShellModeIndicator.js';
import { ContextSummaryDisplay } from '../components/ContextSummaryDisplay.js';

interface DefaultAppLayoutProps {
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

export const DefaultAppLayout = ({
  config,
  settings,
  startupWarnings,
  mainControlsRef,
  availableTerminalHeight,
  contextFileNames,
  updateInfo,
}: DefaultAppLayoutProps) => {
  const uiState = useUIState();
  const uiActions = useUIActions();

  const {
    terminalWidth,
    terminalHeight,
    mainAreaWidth,
    // inputWidth,
    history,
    streamingState,
    quittingMessages,
    constrainHeight,
    showToolDescriptions,
    slashCommands,
    isInputActive,
    ctrlCPressedOnce,
    ctrlDPressedOnce,
    showEscapePrompt,
    ideContextState,
    llxprtMdFileCount,
    elapsedTime,
    currentLoadingPhrase,
    showAutoAcceptIndicator,
    shellModeActive,
    thought,
    initError,
    availableTerminalHeight: uiAvailableTerminalHeight,
  } = uiState;

  // Use the UI state's availableTerminalHeight if constrainHeight is true
  // Otherwise, fall back to the prop (which is the same calculation)
  const effectiveAvailableHeight = constrainHeight
    ? uiAvailableTerminalHeight
    : availableTerminalHeight;

  const showTodoPanelSetting = settings.merged.ui?.showTodoPanel ?? true;
  const hideContextSummary = settings.merged.ui?.hideContextSummary ?? false;
  const { isNarrow } = uiState;

  const useAlternateBuffer =
    settings.merged.ui?.useAlternateBuffer === true &&
    !config.getScreenReader();

  useFlickerDetector(uiState.rootUiRef, terminalHeight, constrainHeight);

  // If in alternate buffer mode, need to leave room to draw the scrollbar on
  // the right side of the terminal.
  const width = useAlternateBuffer ? terminalWidth : mainAreaWidth;

  // Check if any dialog is visible
  const dialogsVisible =
    uiState.showWorkspaceMigrationDialog ||
    uiState.shouldShowIdePrompt ||
    uiState.showIdeRestartPrompt ||
    uiState.isFolderTrustDialogOpen ||
    uiState.isPermissionsDialogOpen ||
    uiState.shellConfirmationRequest ||
    uiState.confirmationRequest ||
    uiState.isThemeDialogOpen ||
    uiState.isSettingsDialogOpen ||
    uiState.isAuthenticating ||
    uiState.isAuthDialogOpen ||
    uiState.isOAuthCodeDialogOpen ||
    uiState.isEditorDialogOpen ||
    uiState.isProviderDialogOpen ||
    uiState.isProviderModelDialogOpen ||
    uiState.isLoadProfileDialogOpen ||
    uiState.isToolsDialogOpen ||
    uiState.showPrivacyNotice;

  if (quittingMessages) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {quittingMessages.map((item) => (
          <HistoryItemDisplay
            key={item.id}
            availableTerminalHeight={
              constrainHeight ? effectiveAvailableHeight : undefined
            }
            terminalWidth={terminalWidth}
            item={item}
            isPending={false}
            config={config}
            slashCommands={slashCommands}
            showTodoPanel={showTodoPanelSetting}
          />
        ))}
      </Box>
    );
  }

  return (
    <StreamingContext.Provider value={streamingState}>
      <Box
        flexDirection="column"
        width={width}
        height={useAlternateBuffer ? terminalHeight : undefined}
        flexShrink={0}
        flexGrow={0}
        overflow="hidden"
        ref={uiState.rootUiRef}
      >
        <MainContent config={config} />

        <Box
          flexDirection="column"
          ref={mainControlsRef}
          flexShrink={0}
          flexGrow={0}
        >
          <Notifications
            startupWarnings={startupWarnings}
            updateInfo={updateInfo}
            history={history}
          />

          {/* TodoPanel is now exclusively in the Todo Tab */}
          {/* {showTodoPanelSetting && <TodoPanel width={inputWidth} />} */}

          {dialogsVisible ? (
            <DialogManager
              config={config}
              settings={settings}
              addItem={uiActions.addItem}
              terminalWidth={terminalWidth}
            />
          ) : (
            <>
              <LoadingIndicator
                thought={
                  streamingState === StreamingState.WaitingForConfirmation ||
                  config.getAccessibility()?.disableLoadingPhrases ||
                  config.getScreenReader()
                    ? undefined
                    : thought
                }
                currentLoadingPhrase={
                  config.getAccessibility()?.disableLoadingPhrases ||
                  config.getScreenReader()
                    ? undefined
                    : currentLoadingPhrase
                }
                elapsedTime={elapsedTime}
              />
              {!isInputActive && (
                <Box
                  marginTop={1}
                  display="flex"
                  justifyContent={
                    hideContextSummary ? 'flex-start' : 'space-between'
                  }
                  width="100%"
                >
                  <Box>
                    {process.env.GEMINI_SYSTEM_MD && (
                      <Text color={Colors.AccentRed}>
                        |&#x2310;&#x25A0;_&#x25A0;|{' '}
                      </Text>
                    )}
                    {ctrlCPressedOnce ? (
                      <Text color={Colors.AccentYellow}>
                        Press Ctrl+C again to exit.
                      </Text>
                    ) : ctrlDPressedOnce ? (
                      <Text color={Colors.AccentYellow}>
                        Press Ctrl+D again to exit.
                      </Text>
                    ) : showEscapePrompt ? (
                      <Text color={Colors.Gray}>Press Esc again to clear.</Text>
                    ) : !hideContextSummary ? (
                      <ContextSummaryDisplay
                        ideContext={ideContextState}
                        llxprtMdFileCount={llxprtMdFileCount}
                        contextFileNames={contextFileNames}
                        mcpServers={config.getMcpServers()}
                        blockedMcpServers={config.getBlockedMcpServers()}
                        showToolDescriptions={showToolDescriptions}
                      />
                    ) : null}
                  </Box>
                  <Box
                    paddingTop={isNarrow ? 1 : 0}
                    marginLeft={hideContextSummary ? 1 : 2}
                  >
                    {showAutoAcceptIndicator !== ApprovalMode.DEFAULT &&
                      !shellModeActive && (
                        <AutoAcceptIndicator
                          approvalMode={showAutoAcceptIndicator}
                        />
                      )}
                    {shellModeActive && <ShellModeIndicator />}
                  </Box>
                </Box>
              )}
              {isInputActive && (
                <Composer config={config} settings={settings} />
              )}
            </>
          )}

          {initError && streamingState !== StreamingState.Responding && (
            <Box
              borderStyle="round"
              borderColor={Colors.AccentRed}
              paddingX={1}
              marginBottom={1}
            >
              <Text color={Colors.AccentRed}>
                Initialization Error: {initError}
              </Text>
            </Box>
          )}

          {!settings.merged.ui?.hideFooter && (
            <Footer
              model={uiState.currentModel}
              targetDir={config.getTargetDir()}
              debugMode={config.getDebugMode()}
              branchName={uiState.branchName}
              debugMessage={uiState.debugMessage}
              errorCount={uiState.errorCount}
              showErrorDetails={uiState.showErrorDetails}
              showMemoryUsage={
                config.getDebugMode() ||
                settings.merged.ui?.showMemoryUsage ||
                false
              }
              historyTokenCount={uiState.historyTokenCount}
              nightly={uiState.nightly}
              vimMode={uiState.vimModeEnabled ? uiState.vimMode : undefined}
              contextLimit={
                config.getEphemeralSetting('context-limit') as
                  | number
                  | undefined
              }
              isTrustedFolder={config.isTrustedFolder()}
              tokensPerMinute={uiState.tokenMetrics.tokensPerMinute}
              throttleWaitTimeMs={uiState.tokenMetrics.throttleWaitTimeMs}
              sessionTokenTotal={uiState.tokenMetrics.sessionTokenTotal}
              hideCWD={settings.merged.hideCWD}
              hideSandboxStatus={settings.merged.hideSandboxStatus}
              hideModelInfo={settings.merged.hideModelInfo}
            />
          )}
        </Box>
      </Box>
    </StreamingContext.Provider>
  );
};
