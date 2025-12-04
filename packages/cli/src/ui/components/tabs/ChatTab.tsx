/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Static, Text } from 'ink';
import type { Config } from '@vybestack/llxprt-code-core';
import type { DOMElement } from 'ink';
import type { LoadedSettings } from '../../../config/settings.js';
import type { UpdateObject } from '../../utils/updateCheck.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useUIActions } from '../../contexts/UIActionsContext.js';
import { useTabContext } from '../../contexts/TabContext.js';

// Components
import { Header } from '../Header.js';
import { Tips } from '../Tips.js';
import { HistoryItemDisplay } from '../HistoryItemDisplay.js';
import { ShowMoreLines } from '../ShowMoreLines.js';
import { Notifications } from '../Notifications.js';
import { Footer } from '../Footer.js';
import { DialogManager } from '../DialogManager.js';
import { Composer } from '../Composer.js';
import { LoadingIndicator } from '../LoadingIndicator.js';
import { AutoAcceptIndicator } from '../AutoAcceptIndicator.js';
import { ShellModeIndicator } from '../ShellModeIndicator.js';
import { ContextSummaryDisplay } from '../ContextSummaryDisplay.js';
import { DetailedMessagesDisplay } from '../DetailedMessagesDisplay.js';
import { StreamingContext } from '../../contexts/StreamingContext.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { Colors } from '../../colors.js';
import { StreamingState } from '../../types.js';

interface ChatTabProps {
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

export const ChatTab: React.FC<ChatTabProps> = ({
  config,
  settings,
  startupWarnings,
  version,
  nightly,
  mainControlsRef,
  availableTerminalHeight,
  contextFileNames,
  updateInfo,
}) => {
  const uiState = useUIState();
  const uiActions = useUIActions();
  const { state: tabState } = useTabContext();

  const {
    terminalWidth,
    terminalHeight,
    mainAreaWidth,
    inputWidth,
    history,
    pendingHistoryItems,
    streamingState,
    quittingMessages,
    constrainHeight,
    showErrorDetails,
    showToolDescriptions,
    consoleMessages,
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
    branchName,
    debugMessage,
    errorCount,
    historyTokenCount,
    vimModeEnabled,
    vimMode,
    tokenMetrics,
    currentModel,
    availableTerminalHeight: uiAvailableTerminalHeight,
    isNarrow,
  } = uiState;

  // Use the UI state's availableTerminalHeight if constrainHeight is true
  const effectiveAvailableHeight = constrainHeight
    ? uiAvailableTerminalHeight
    : availableTerminalHeight;

  const showTodoPanelSetting = settings.merged.ui?.showTodoPanel ?? true;
  const hideContextSummary = settings.merged.ui?.hideContextSummary ?? false;

  const debugConsoleMaxHeight = Math.floor(Math.max(terminalHeight * 0.2, 5));
  const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);

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

  // Independent static key for chat tab
  const chatStaticKey = tabState.activeTab === 'chat' ? 0 : 1;

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
      <Box flexDirection="column" width="90%" ref={uiState.rootUiRef}>
        <Static
          key={chatStaticKey}
          items={[
            <Box flexDirection="column" key="header">
              {!(
                settings.merged.ui?.hideBanner || config.getScreenReader()
              ) && (
                <Header
                  terminalWidth={terminalWidth}
                  version={version}
                  nightly={nightly}
                />
              )}
              {!(settings.merged.ui?.hideTips || config.getScreenReader()) && (
                <Tips config={config} />
              )}
            </Box>,
            ...history.map((h) => (
              <HistoryItemDisplay
                terminalWidth={mainAreaWidth}
                availableTerminalHeight={staticAreaMaxItemHeight}
                key={h.id}
                item={h}
                isPending={false}
                config={config}
                slashCommands={slashCommands}
                showTodoPanel={showTodoPanelSetting}
              />
            )),
          ]}
        >
          {(item) => item}
        </Static>
        <OverflowProvider>
          <Box ref={uiState.pendingHistoryItemRef} flexDirection="column">
            {pendingHistoryItems.map((item, i) => (
              <HistoryItemDisplay
                key={i}
                availableTerminalHeight={
                  constrainHeight ? effectiveAvailableHeight : undefined
                }
                terminalWidth={mainAreaWidth}
                item={{ ...item, id: 0 }}
                isPending={true}
                config={config}
                isFocused={!uiState.isEditorDialogOpen}
                slashCommands={slashCommands}
                showTodoPanel={showTodoPanelSetting}
              />
            ))}
            <ShowMoreLines constrainHeight={constrainHeight} />
          </Box>
        </OverflowProvider>

        <Box flexDirection="column" ref={mainControlsRef}>
          <Notifications
            startupWarnings={startupWarnings}
            updateInfo={updateInfo}
            history={history}
          />

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
                  {showAutoAcceptIndicator !== undefined &&
                    !shellModeActive && (
                      <AutoAcceptIndicator
                        approvalMode={showAutoAcceptIndicator}
                      />
                    )}
                  {shellModeActive && <ShellModeIndicator />}
                </Box>
              </Box>
              {showErrorDetails && (
                <OverflowProvider>
                  <Box flexDirection="column">
                    <DetailedMessagesDisplay
                      messages={consoleMessages}
                      maxHeight={
                        constrainHeight ? debugConsoleMaxHeight : undefined
                      }
                      width={inputWidth}
                    />
                    <ShowMoreLines constrainHeight={constrainHeight} />
                  </Box>
                </OverflowProvider>
              )}
              {isInputActive && (
                <Composer config={config} settings={settings} />
              )}
            </>
          )}

          {!settings.merged.ui?.hideFooter && (
            <Footer
              model={currentModel}
              targetDir={config.getTargetDir()}
              debugMode={config.getDebugMode()}
              branchName={branchName}
              debugMessage={debugMessage}
              errorCount={errorCount}
              showErrorDetails={showErrorDetails}
              showMemoryUsage={
                config.getDebugMode() ||
                settings.merged.ui?.showMemoryUsage ||
                false
              }
              historyTokenCount={historyTokenCount}
              nightly={nightly}
              vimMode={vimModeEnabled ? vimMode : undefined}
              contextLimit={
                config.getEphemeralSetting('context-limit') as
                  | number
                  | undefined
              }
              isTrustedFolder={config.isTrustedFolder()}
              tokensPerMinute={tokenMetrics.tokensPerMinute}
              throttleWaitTimeMs={tokenMetrics.throttleWaitTimeMs}
              sessionTokenTotal={tokenMetrics.sessionTokenTotal}
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
