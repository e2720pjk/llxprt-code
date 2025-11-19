/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  useReducer,
  useLayoutEffect,
} from 'react';
import { type DOMElement, measureElement } from 'ink';
import { App } from './App.js';
import { AppContext } from './contexts/AppContext.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from './contexts/UIActionsContext.js';
import { ConfigContext } from './contexts/ConfigContext.js';
import {
  type HistoryItem,
  ToolCallStatus,
  type HistoryItemWithoutId,
  MessageType,
} from './types.js';
import {
  type EditorType,
  type Config,
  IdeClient,
  type DetectedIde,
  ideContext,
  type IdeContext,
  getErrorMessage,
  getAllLlxprtMdFilenames,
  UserTierId,
  AuthType,
  clearCachedCredentialFile,
  ShellExecutionService,
} from '@vybestack/llxprt-code-core';
import { validateAuthMethod } from '../config/auth.js';
import { loadHierarchicalLlxprtMemory } from '../config/config.js';
import process from 'node:process';
import { useHistory } from './hooks/useHistoryManager.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useAuthCommand } from './hooks/useAuthCommand.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useSettingsCommand } from './hooks/useSettingsCommand.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useVimMode } from './contexts/VimModeContext.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useStdin, useStdout } from 'ink';
import ansiEscapes from 'ansi-escapes';
import * as fs from 'node:fs';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useLogger } from './hooks/useLogger.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useVim } from './hooks/vim.js';
import { type LoadedSettings, SettingScope } from '../config/settings.js';
import { type InitializationResult } from '../core/initializer.js';
import { useFocus } from './hooks/useFocus.js';
import { useBracketedPaste } from './hooks/useBracketedPaste.js';
import { useKeypress, type Key } from './hooks/useKeypress.js';
import { keyMatchers, Command } from './keyMatchers.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useFolderTrust } from './hooks/useFolderTrust.js';
import { useIdeTrustListener } from './hooks/useIdeTrustListener.js';
import { type IdeIntegrationNudgeResult } from './IdeIntegrationNudge.js';
import { appEvents, AppEvent } from '../utils/events.js';
import { type UpdateObject } from './utils/updateCheck.js';
import { setUpdateHandler } from '../utils/handleAutoUpdate.js';
import { ConsolePatcher } from './utils/ConsolePatcher.js';
import { registerCleanup, runExitCleanup } from '../utils/cleanup.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useWorkspaceMigration } from './hooks/useWorkspaceMigration.js';
import { useSessionStats } from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { appReducer, initialAppState } from './reducers/appReducer.js';
import { AppDispatchProvider } from './contexts/AppDispatchContext.js';
import { useTodoContext } from './contexts/TodoContext.js';
import {
  useTodoPausePreserver,
  TodoPausePreserver,
} from './hooks/useTodoPausePreserver.js';
import { useInputHistoryStore } from './hooks/useInputHistoryStore.js';
import { useProviderModelDialog } from './hooks/useProviderModelDialog.js';
import { useProviderDialog } from './hooks/useProviderDialog.js';
import { useLoadProfileDialog } from './hooks/useLoadProfileDialog.js';
import { useToolsDialog } from './hooks/useToolsDialog.js';
import { useRuntimeApi } from './contexts/RuntimeContext.js';
import { globalOAuthUI } from '../auth/global-oauth-ui.js';
import { calculateMainAreaWidth } from './utils/ui-sizing.js';

const CTRL_EXIT_PROMPT_DURATION_MS = 1000;
const SHELL_WIDTH_FRACTION = 0.89;
const SHELL_HEIGHT_PADDING = 10;

function isToolExecuting(pendingHistoryItems: HistoryItemWithoutId[]) {
  return pendingHistoryItems.some((item) => {
    if (item && item.type === 'tool_group') {
      return item.tools.some(
        (tool) => ToolCallStatus.Executing === tool.status,
      );
    }
    return false;
  });
}

interface AppContainerProps {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
  initializationResult: InitializationResult;
}

export const AppContainer = (props: AppContainerProps) => {
  const { settings, config, initializationResult } = props;
  const [appState, appDispatch] = useReducer(appReducer, initialAppState);
  const historyManager = useHistory();
  const [corgiMode, setCorgiMode] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [quittingMessages, setQuittingMessages] = useState<
    HistoryItem[] | null
  >(null);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [themeError, setThemeError] = useState<string | null>(
    initializationResult.themeError,
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [shellFocused, setShellFocused] = useState(false);
  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(
    initializationResult.geminiMdFileCount,
  );
  const [shellModeActive, setShellModeActive] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] =
    useState<boolean>(false);
  const [historyRemountKey, setHistoryRemountKey] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateObject | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isTrustedFolder, setIsTrustedFolder] = useState<boolean | undefined>(
    config.isTrustedFolder(),
  );
  const [currentModel, setCurrentModel] = useState(config.getModel());
  const [userTier, setUserTier] = useState<UserTierId | undefined>(undefined);
  const [isProQuotaDialogOpen, setIsProQuotaDialogOpen] = useState(false);
  const [proQuotaDialogResolver, setProQuotaDialogResolver] = useState<
    ((value: boolean) => void) | null
  >(null);

  const runtime = useRuntimeApi();
  const { updateTodos } = useTodoContext();
  const todoPauseController = useMemo(() => new TodoPausePreserver(), []);
  const registerTodoPause = useCallback(() => {
    todoPauseController.registerTodoPause();
  }, [todoPauseController]);

  // Independent input history management (unaffected by /clear)
  const inputHistoryStore = useInputHistoryStore();

  // Auto-accept indicator
  const showAutoAcceptIndicator = useAutoAcceptIndicator({
    config,
    addItem: historyManager.addItem,
  });

  const logger = useLogger(config.storage);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [userMessages, setUserMessages] = useState<string[]>([]);

  // Initialize independent input history from logger
  useEffect(() => {
    inputHistoryStore.initializeFromLogger(logger);
  }, [logger, inputHistoryStore]);

  // Terminal and layout hooks
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const { stdin, setRawMode } = useStdin();
  const { stdout } = useStdout();

  // Additional hooks moved from App.tsx
  const { stats: sessionStats } = useSessionStats();
  const branchName = useGitBranchName(config.getTargetDir());

  // Layout measurements
  const mainControlsRef = useRef<DOMElement>(null);
  const staticExtraHeight = 3;

  useEffect(() => {
    registerCleanup(async () => {
      const ideClient = await IdeClient.getInstance();
      await ideClient.disconnect();
    });
  }, [config]);

  useEffect(() => {
    const cleanup = setUpdateHandler(historyManager.addItem, setUpdateInfo);

    // Attach addItem to OAuth providers for displaying auth URLs
    if (historyManager.addItem) {
      const oauthManager = runtime.getCliOAuthManager();
      if (oauthManager) {
        const providersMap = (
          oauthManager as unknown as { providers?: Map<string, unknown> }
        ).providers;
        if (providersMap instanceof Map) {
          for (const provider of providersMap.values()) {
            const candidate = provider as {
              setAddItem?: (callback: typeof historyManager.addItem) => void;
            };
            candidate.setAddItem?.(historyManager.addItem);
          }
        }
      }
    }

    return cleanup;
  }, [historyManager.addItem, runtime]);

  // Set global OAuth addItem callback for all OAuth flows
  useEffect(() => {
    (global as Record<string, unknown>).__oauth_add_item =
      historyManager.addItem;
    globalOAuthUI.setAddItem(historyManager.addItem);
    return () => {
      delete (global as Record<string, unknown>).__oauth_add_item;
      globalOAuthUI.clearAddItem();
    };
  }, [historyManager.addItem]);

  // Check for OAuth code needed flag
  useEffect(() => {
    const checkOAuthFlag = setInterval(() => {
      if ((global as Record<string, unknown>).__oauth_needs_code) {
        // Clear the flag
        (global as Record<string, unknown>).__oauth_needs_code = false;
        // Open the OAuth code dialog
        appDispatch({ type: 'OPEN_DIALOG', payload: 'oauthCode' });
      }
    }, 100); // Check every 100ms

    return () => clearInterval(checkOAuthFlag);
  }, [appDispatch]);

  // Watch for model changes (e.g., from Flash fallback)
  useEffect(() => {
    const checkModelChange = () => {
      const configModel = config.getModel();
      if (configModel !== currentModel) {
        setCurrentModel(configModel);
      }
    };

    // Check immediately and then periodically
    checkModelChange();
    const interval = setInterval(checkModelChange, 1000); // Check every second

    return () => clearInterval(interval);
  }, [config, currentModel]);

  const {
    consoleMessages,
    handleNewMessage,
    clearConsoleMessages: clearConsoleMessagesState,
  } = useConsoleMessages();

  useEffect(() => {
    const consolePatcher = new ConsolePatcher({
      onNewMessage: handleNewMessage,
      debugMode: config.getDebugMode(),
    });
    consolePatcher.patch();
    registerCleanup(consolePatcher.cleanup);
  }, [handleNewMessage, config]);

  const widthFraction = 0.9;
  const inputWidth = Math.max(
    20,
    Math.floor(terminalWidth * widthFraction) - 3,
  );
  const suggestionsWidth = Math.max(20, Math.floor(terminalWidth * 0.8));
  const mainAreaWidth = useMemo(
    () => calculateMainAreaWidth(terminalWidth, settings),
    [terminalWidth, settings],
  );
  const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);

  const isValidPath = useCallback((filePath: string): boolean => {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (_e) {
      return false;
    }
  }, []);

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { height: 10, width: inputWidth },
    stdin,
    setRawMode,
    isValidPath,
    shellModeActive,
  });

  useEffect(() => {
    const fetchUserMessages = async () => {
      const pastMessagesRaw = (await logger?.getPreviousUserMessages()) || [];
      const currentSessionUserMessages = historyManager.history
        .filter(
          (item): item is HistoryItem & { type: 'user'; text: string } =>
            item.type === 'user' &&
            typeof item.text === 'string' &&
            item.text.trim() !== '',
        )
        .map((item) => item.text)
        .reverse();
      const combinedMessages = [
        ...currentSessionUserMessages,
        ...pastMessagesRaw,
      ];
      const deduplicatedMessages: string[] = [];
      if (combinedMessages.length > 0) {
        deduplicatedMessages.push(combinedMessages[0]);
        for (let i = 1; i < combinedMessages.length; i++) {
          if (combinedMessages[i] !== combinedMessages[i - 1]) {
            deduplicatedMessages.push(combinedMessages[i]);
          }
        }
      }
      setUserMessages(deduplicatedMessages.reverse());
    };
    fetchUserMessages();
  }, [historyManager.history, logger]);

  const refreshStatic = useCallback(() => {
    stdout.write(ansiEscapes.clearTerminal);
    setHistoryRemountKey((prev) => prev + 1);
  }, [setHistoryRemountKey, stdout]);

  const {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(
    settings,
    appState,
    historyManager.addItem,
    initializationResult.themeError,
  );

  const {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    isAuthenticating,
    cancelAuthentication,
  } = useAuthCommand(settings, appState, config);

  const authError = appState.errors.auth;
  const onAuthError = useCallback(
    (error: string) => {
      appDispatch({ type: 'SET_AUTH_ERROR', payload: error });
    },
    [appDispatch],
  );

  // Sync user tier from config when authentication changes
  useEffect(() => {
    // Only sync when not currently authenticating
    if (!isAuthenticating) {
      setUserTier(config.getGeminiClient()?.getUserTier());
    }
  }, [config, isAuthenticating]);

  // Check for enforced auth type mismatch
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authSettings = settings.merged.security?.auth as any;
    if (
      authSettings?.enforcedType &&
      authSettings.selectedType &&
      authSettings.enforcedType !== authSettings.selectedType
    ) {
      onAuthError(
        `Authentication is enforced to be ${authSettings.enforcedType}, but you are currently using ${authSettings.selectedType}.`,
      );
    } else if (authSettings?.selectedType && !authSettings?.useExternal) {
      const error = validateAuthMethod(authSettings.selectedType);
      if (error) {
        onAuthError(error);
      }
    }
  }, [settings.merged.security?.auth, onAuthError]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [editorError, setEditorError] = useState<string | null>(null);
  const {
    isEditorDialogOpen,
    openEditorDialog,
    handleEditorSelect,
    exitEditorDialog,
  } = useEditorSettings(settings, appState, historyManager.addItem);

  const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } =
    useSettingsCommand();

  const {
    showDialog: isProviderDialogOpen,
    openDialog: openProviderDialog,
    handleSelect: handleProviderSelect,
    closeDialog: exitProviderDialog,
    providers: providerOptions,
    currentProvider: selectedProvider,
  } = useProviderDialog({
    addMessage: (msg) =>
      historyManager.addItem(
        { type: msg.type as MessageType, text: msg.content },
        msg.timestamp.getTime(),
      ),
    appState,
    config,
  });

  const {
    showDialog: isProviderModelDialogOpen,
    openDialog: openProviderModelDialogRaw,
    handleSelect: handleProviderModelChange,
    closeDialog: exitProviderModelDialog,
  } = useProviderModelDialog({
    addMessage: (msg) =>
      historyManager.addItem(
        { type: msg.type as MessageType, text: msg.content },
        msg.timestamp.getTime(),
      ),
    appState,
  });

  const [providerModels, setProviderModels] = useState<any[]>([]);
  const openProviderModelDialog = useCallback(async () => {
    try {
      const models = await runtime.listAvailableModels();
      setProviderModels(models);
    } catch (e) {
      console.error('Failed to load models:', e);
      setProviderModels([]);
    }
    await openProviderModelDialogRaw();
  }, [openProviderModelDialogRaw, runtime]);

  const {
    showDialog: isLoadProfileDialogOpen,
    openDialog: openLoadProfileDialog,
    handleSelect: handleProfileSelect,
    closeDialog: exitLoadProfileDialog,
    profiles,
  } = useLoadProfileDialog({
    addMessage: (msg) =>
      historyManager.addItem(
        { type: msg.type as MessageType, text: msg.content },
        msg.timestamp.getTime(),
      ),
    appState,
    config,
    settings,
  });

  const {
    showDialog: isToolsDialogOpen,
    openDialog: openToolsDialogRaw,
    closeDialog: exitToolsDialog,
    action: toolsDialogAction,
    availableTools: toolsDialogTools,
    disabledTools: toolsDialogDisabledTools,
    handleSelect: handleToolsSelect,
  } = useToolsDialog({
    addMessage: (msg) =>
      historyManager.addItem(
        { type: msg.type as MessageType, text: msg.content },
        msg.timestamp.getTime(),
      ),
    appState,
    config,
  });

  const openToolsDialog = useCallback(
    (action: 'enable' | 'disable') => {
      openToolsDialogRaw(action);
    },
    [openToolsDialogRaw],
  );

  const {
    showWorkspaceMigrationDialog,
    workspaceExtensions,
    onWorkspaceMigrationDialogOpen,
    onWorkspaceMigrationDialogClose,
  } = useWorkspaceMigration(settings);

  const { toggleVimEnabled } = useVimMode();

  const slashCommandActions = useMemo(
    () => ({
      openAuthDialog: openAuthDialog,
      openThemeDialog,
      openEditorDialog,
      openProviderDialog,
      openProviderModelDialog,
      openLoadProfileDialog,
      openToolsDialog,
      openPrivacyNotice: () => setShowPrivacyNotice(true),
      openSettingsDialog,
      quit: (messages: HistoryItem[]) => {
        setQuittingMessages(messages);
        setTimeout(async () => {
          await runExitCleanup();
          process.exit(0);
        }, 100);
      },
      setDebugMessage,
      toggleCorgiMode: () => setCorgiMode((prev) => !prev),
    }),
    [
      openAuthDialog,
      openThemeDialog,
      openEditorDialog,
      openProviderDialog,
      openProviderModelDialog,
      openLoadProfileDialog,
      openToolsDialog,
      openSettingsDialog,
      setQuittingMessages,
      setDebugMessage,
      setShowPrivacyNotice,
      setCorgiMode,
    ],
  );

  const {
    handleSlashCommand,
    slashCommands,
    pendingHistoryItems: pendingSlashCommandHistoryItems,
    commandContext,
    shellConfirmationRequest,
    confirmationRequest,
  } = useSlashCommandProcessor(
    config,
    settings,
    historyManager.addItem,
    historyManager.clearItems,
    historyManager.loadHistory,
    refreshStatic,
    toggleVimEnabled,
    setIsProcessing,
    setGeminiMdFileCount,
    slashCommandActions,
  );

  const performMemoryRefresh = useCallback(async () => {
    historyManager.addItem(
      {
        type: MessageType.INFO,
        text: 'Refreshing hierarchical memory (LLXPRT.md or other context files)...',
      },
      Date.now(),
    );
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contextSettings = settings.merged.context as any;
      const { memoryContent, fileCount } = await loadHierarchicalLlxprtMemory(
        process.cwd(),
        contextSettings?.loadMemoryFromIncludeDirectories
          ? config.getWorkspaceContext().getDirectories()
          : [],
        config.getDebugMode(),
        config.getFileService(),
        settings.merged,
        config.getExtensionContextFilePaths(),
        config.isTrustedFolder(),
        contextSettings?.importFormat || 'tree', // Use setting or default to 'tree'
        config.getFileFilteringOptions(),
      );

      config.setUserMemory(memoryContent);
      config.setLlxprtMdFileCount(fileCount);
      setGeminiMdFileCount(fileCount);

      historyManager.addItem(
        {
          type: MessageType.INFO,
          text: `Memory refreshed successfully. ${
            memoryContent.length > 0
              ? `Loaded ${memoryContent.length} characters from ${fileCount} file(s).`
              : 'No memory content found.'
          }`,
        },
        Date.now(),
      );
      if (config.getDebugMode()) {
        console.log(
          `[DEBUG] Refreshed memory content in config: ${memoryContent.substring(
            0,
            200,
          )}...`,
        );
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      historyManager.addItem(
        {
          type: MessageType.ERROR,
          text: `Error refreshing memory: ${errorMessage}`,
        },
        Date.now(),
      );
      console.error('Error refreshing memory:', error);
    }
  }, [config, historyManager, settings.merged]);

  const cancelHandlerRef = useRef<() => void>(() => {});

  const {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems: pendingGeminiHistoryItems,
    thought,
    cancelOngoingRequest,
  } = useGeminiStream(
    config.getGeminiClient(),
    historyManager.history,
    historyManager.addItem,
    config,
    settings,
    setDebugMessage,
    handleSlashCommand,
    shellModeActive,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (settings.merged.general as any)?.preferredEditor as EditorType,
    onAuthError,
    performMemoryRefresh,
    refreshStatic, // This is argument 12: onEditorClose
    () => cancelHandlerRef.current(), // This is argument 13: onCancelSubmit
    registerTodoPause, // This is argument 14: onTodoPause
  );

  cancelHandlerRef.current = useCallback(() => {
    const pendingHistoryItems = [
      ...pendingSlashCommandHistoryItems,
      ...pendingGeminiHistoryItems,
    ];
    if (isToolExecuting(pendingHistoryItems)) {
      buffer.setText(''); // Just clear the prompt
      return;
    }

    const lastUserMessage = inputHistoryStore.inputHistory.at(-1);
    const textToSet = lastUserMessage || '';

    if (textToSet) {
      buffer.setText(textToSet);
    }
  }, [
    buffer,
    inputHistoryStore.inputHistory,
    pendingSlashCommandHistoryItems,
    pendingGeminiHistoryItems,
  ]);

  const handleFinalSubmit = useCallback(
    (submittedValue: string) => {
      const trimmedValue = submittedValue.trim();
      if (trimmedValue.length > 0) {
        // Add to independent input history
        inputHistoryStore.addInput(trimmedValue);
        submitQuery(trimmedValue);
      }
    },
    [submitQuery, inputHistoryStore],
  );

  const { handleUserInputSubmit } = useTodoPausePreserver({
    controller: todoPauseController,
    updateTodos,
    handleFinalSubmit,
  });

  const handleClearScreen = useCallback(() => {
    historyManager.clearItems();
    clearConsoleMessagesState();
    console.clear();
    refreshStatic();
  }, [historyManager, clearConsoleMessagesState, refreshStatic]);

  const handleProQuotaChoice = useCallback(
    (choice: 'auth' | 'continue') => {
      setIsProQuotaDialogOpen(false);
      if (proQuotaDialogResolver) {
        if (choice === 'auth') {
          proQuotaDialogResolver(false); // Don't continue with fallback, show auth dialog
          openAuthDialog();
        } else {
          proQuotaDialogResolver(true); // Continue with fallback model
        }
        setProQuotaDialogResolver(null);
      }
    },
    [proQuotaDialogResolver, openAuthDialog],
  );

  const { handleInput: vimHandleInput } = useVim(buffer, handleFinalSubmit);

  const isInputActive = !initError && !isProcessing;

  // Compute available terminal height based on controls measurement
  // Using useLayoutEffect for proper layout timing (from Phase 03 analysis)
  const [availableTerminalHeight, setAvailableTerminalHeight] = useState(
    () => terminalHeight - staticExtraHeight,
  );

  useLayoutEffect(() => {
    if (mainControlsRef.current) {
      const fullFooterMeasurement = measureElement(mainControlsRef.current);
      const newHeight = Math.max(
        terminalHeight - fullFooterMeasurement.height - staticExtraHeight,
        0,
      );
      setAvailableTerminalHeight(newHeight);
    } else {
      setAvailableTerminalHeight(
        Math.max(terminalHeight - staticExtraHeight, 0),
      );
    }
  }, [terminalHeight, mainControlsRef.current]);

  // Update shell execution config with proper terminal height calculations
  useEffect(() => {
    if ((config as any).setShellExecutionConfig) {
      (config as any).setShellExecutionConfig({
        terminalWidth: Math.floor(terminalWidth * SHELL_WIDTH_FRACTION),
        terminalHeight: Math.max(
          Math.floor(availableTerminalHeight - SHELL_HEIGHT_PADDING),
          1,
        ),
        // pager: settings.merged.tools?.shell?.pager,
        // showColor: settings.merged.tools?.shell?.showColor,
      });
    }
  }, [terminalWidth, availableTerminalHeight, config]);

  const isFocused = useFocus();
  useBracketedPaste();

  // Context file names computation
  const contextFileNames = useMemo(() => {
    const fromSettings = settings.merged.contextFileName;
    return fromSettings
      ? Array.isArray(fromSettings)
        ? fromSettings
        : [fromSettings]
      : getAllLlxprtMdFilenames();
  }, [settings.merged.contextFileName]);
  // Initial prompt handling
  const initialPrompt = useMemo(() => config.getQuestion(), [config]);
  const initialPromptSubmitted = useRef(false);
  const geminiClient = config.getGeminiClient();

  useEffect(() => {
    if (
      initialPrompt &&
      !initialPromptSubmitted.current &&
      !isAuthenticating &&
      !isAuthDialogOpen &&
      !isThemeDialogOpen &&
      !isEditorDialogOpen &&
      !isProviderDialogOpen &&
      !isProviderModelDialogOpen &&
      !isToolsDialogOpen &&
      !showPrivacyNotice &&
      geminiClient?.isInitialized?.()
    ) {
      handleFinalSubmit(initialPrompt);
      initialPromptSubmitted.current = true;
    }
  }, [
    initialPrompt,
    handleFinalSubmit,
    isAuthenticating,
    isAuthDialogOpen,
    isThemeDialogOpen,
    isEditorDialogOpen,
    isProviderDialogOpen,
    isProviderModelDialogOpen,
    isToolsDialogOpen,
    showPrivacyNotice,
    geminiClient,
  ]);

  const [idePromptAnswered, setIdePromptAnswered] = useState(false);
  const [currentIDE, setCurrentIDE] = useState<DetectedIde | null>(null);

  useEffect(() => {
    const getIde = async () => {
      const ideClient = await IdeClient.getInstance();
      const currentIde = ideClient.getCurrentIde();
      setCurrentIDE(currentIde || null);
    };
    getIde();
  }, []);
  const shouldShowIdePrompt = Boolean(
    currentIDE &&
      !config.getIdeMode() &&
      !settings.merged.hasSeenIdeIntegrationNudge &&
      !idePromptAnswered,
  );

  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);
  const [showToolDescriptions, setShowToolDescriptions] =
    useState<boolean>(false);

  const [ctrlCPressedOnce, setCtrlCPressedOnce] = useState(false);
  const ctrlCTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [ctrlDPressedOnce, setCtrlDPressedOnce] = useState(false);
  const ctrlDTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [constrainHeight, setConstrainHeight] = useState<boolean>(true);
  const [ideContextState, setIdeContextState] = useState<
    IdeContext | undefined
  >();
  const [showEscapePrompt, setShowEscapePrompt] = useState(false);
  const [showIdeRestartPrompt, setShowIdeRestartPrompt] = useState(false);

  const { isFolderTrustDialogOpen, handleFolderTrustSelect, isRestarting } =
    useFolderTrust(settings, config);
  const { needsRestart: ideNeedsRestart } = useIdeTrustListener(config);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (ideNeedsRestart) {
      // IDE trust changed, force a restart.
      setShowIdeRestartPrompt(true);
    }
  }, [ideNeedsRestart]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const handler = setTimeout(() => {
      refreshStatic();
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [terminalWidth, refreshStatic]);

  useEffect(() => {
    const unsubscribe = ideContext.subscribeToIdeContext(setIdeContextState);
    setIdeContextState(ideContext.getIdeContext());
    return unsubscribe;
  }, []);

  useEffect(() => {
    const openDebugConsole = () => {
      setShowErrorDetails(true);
      setConstrainHeight(false);
    };
    appEvents.on(AppEvent.OpenDebugConsole, openDebugConsole);

    const logErrorHandler = (errorMessage: unknown) => {
      handleNewMessage({
        type: 'error',
        content: String(errorMessage),
        count: 1,
      });
    };
    appEvents.on(AppEvent.LogError, logErrorHandler);

    return () => {
      appEvents.off(AppEvent.OpenDebugConsole, openDebugConsole);
      appEvents.off(AppEvent.LogError, logErrorHandler);
    };
  }, [handleNewMessage]);

  const handleEscapePromptChange = useCallback((showPrompt: boolean) => {
    setShowEscapePrompt(showPrompt);
  }, []);

  const handleIdePromptComplete = useCallback(
    (result: IdeIntegrationNudgeResult) => {
      if (result.userSelection === 'yes') {
        handleSlashCommand('/ide install');
        settings.setValue(
          SettingScope.User,
          'hasSeenIdeIntegrationNudge',
          true,
        );
      } else if (result.userSelection === 'dismiss') {
        settings.setValue(
          SettingScope.User,
          'hasSeenIdeIntegrationNudge',
          true,
        );
      }
      setIdePromptAnswered(true);
    },
    [handleSlashCommand, settings],
  );

  const { elapsedTime, currentLoadingPhrase } =
    useLoadingIndicator(streamingState);

  const handleExit = useCallback(
    (
      pressedOnce: boolean,
      setPressedOnce: (value: boolean) => void,
      timerRef: React.MutableRefObject<NodeJS.Timeout | null>,
    ) => {
      if (pressedOnce) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        handleSlashCommand('/quit');
      } else {
        setPressedOnce(true);
        timerRef.current = setTimeout(() => {
          setPressedOnce(false);
          timerRef.current = null;
        }, CTRL_EXIT_PROMPT_DURATION_MS);
      }
    },
    [handleSlashCommand],
  );

  const handleGlobalKeypress = useCallback(
    (key: Key) => {
      // Debug log keystrokes if enabled
      if (settings.merged.debugKeystrokeLogging) {
        console.log('[DEBUG] Keystroke:', JSON.stringify(key));
      }

      const anyDialogOpen =
        isThemeDialogOpen ||
        isAuthDialogOpen ||
        isEditorDialogOpen ||
        isSettingsDialogOpen ||
        isFolderTrustDialogOpen ||
        isAuthenticating ||
        showPrivacyNotice ||
        isProQuotaDialogOpen ||
        isProviderDialogOpen ||
        isProviderModelDialogOpen ||
        isLoadProfileDialogOpen ||
        isToolsDialogOpen ||
        appState.openDialogs.oauthCode;

      if (anyDialogOpen) {
        return;
      }

      let enteringConstrainHeightMode = false;
      if (!constrainHeight) {
        enteringConstrainHeightMode = true;
        setConstrainHeight(true);
      }

      if (keyMatchers[Command.SHOW_ERROR_DETAILS](key)) {
        setShowErrorDetails((prev) => !prev);
      } else if (keyMatchers[Command.TOGGLE_TOOL_DESCRIPTIONS](key)) {
        const newValue = !showToolDescriptions;
        setShowToolDescriptions(newValue);

        const mcpServers = config.getMcpServers();
        if (Object.keys(mcpServers || {}).length > 0) {
          handleSlashCommand(newValue ? '/mcp desc' : '/mcp nodesc');
        }
      } else if (
        keyMatchers[Command.TOGGLE_IDE_CONTEXT_DETAIL](key) &&
        config.getIdeMode() &&
        ideContextState
      ) {
        handleSlashCommand('/ide status');
      } else if (keyMatchers[Command.QUIT](key)) {
        if (isAuthenticating) {
          return;
        }
        if (!ctrlCPressedOnce) {
          cancelOngoingRequest?.();
        }
        handleExit(ctrlCPressedOnce, setCtrlCPressedOnce, ctrlCTimerRef);
      } else if (keyMatchers[Command.EXIT](key)) {
        if (buffer.text.length > 0) {
          return;
        }
        handleExit(ctrlDPressedOnce, setCtrlDPressedOnce, ctrlDTimerRef);
      } else if (
        keyMatchers[Command.SHOW_MORE_LINES](key) &&
        !enteringConstrainHeightMode
      ) {
        setConstrainHeight(false);
      }
    },
    [
      constrainHeight,
      setConstrainHeight,
      setShowErrorDetails,
      showToolDescriptions,
      setShowToolDescriptions,
      config,
      ideContextState,
      handleExit,
      ctrlCPressedOnce,
      setCtrlCPressedOnce,
      ctrlCTimerRef,
      buffer.text.length,
      ctrlDPressedOnce,
      setCtrlDPressedOnce,
      ctrlDTimerRef,
      handleSlashCommand,
      isAuthenticating,
      cancelOngoingRequest,
      isThemeDialogOpen,
      isAuthDialogOpen,
      isEditorDialogOpen,
      isSettingsDialogOpen,
      isFolderTrustDialogOpen,
      showPrivacyNotice,
      isProQuotaDialogOpen,
      isProviderDialogOpen,
      isProviderModelDialogOpen,
      isLoadProfileDialogOpen,
      isToolsDialogOpen,
      appState.openDialogs.oauthCode,
      settings.merged.debugKeystrokeLogging,
    ],
  );

  useKeypress(handleGlobalKeypress, { isActive: true });
  useKeypress(
    (key) => {
      if (key.name === 'r' || key.name === 'R') {
        process.exit(0);
      }
    },
    { isActive: showIdeRestartPrompt },
  );

  const filteredConsoleMessages = useMemo(() => {
    if (config.getDebugMode()) {
      return consoleMessages;
    }
    return consoleMessages.filter((msg) => msg.type !== 'debug');
  }, [consoleMessages, config]);

  // Computed values
  const errorCount = useMemo(
    () =>
      filteredConsoleMessages
        .filter((msg) => msg.type === 'error')
        .reduce((total, msg) => total + msg.count, 0),
    [filteredConsoleMessages],
  );

  const nightly = props.version.includes('nightly');

  const dialogsVisible = useMemo(
    () =>
      showWorkspaceMigrationDialog ||
      shouldShowIdePrompt ||
      isFolderTrustDialogOpen ||
      !!shellConfirmationRequest ||
      !!confirmationRequest ||
      isThemeDialogOpen ||
      isSettingsDialogOpen ||
      isAuthenticating ||
      isAuthDialogOpen ||
      isEditorDialogOpen ||
      isProviderDialogOpen ||
      isProviderModelDialogOpen ||
      isLoadProfileDialogOpen ||
      isToolsDialogOpen ||
      appState.openDialogs.oauthCode ||
      showPrivacyNotice ||
      isProQuotaDialogOpen,
    [
      showWorkspaceMigrationDialog,
      shouldShowIdePrompt,
      isFolderTrustDialogOpen,
      shellConfirmationRequest,
      confirmationRequest,
      isThemeDialogOpen,
      isSettingsDialogOpen,
      isAuthenticating,
      isAuthDialogOpen,
      isEditorDialogOpen,
      isProviderDialogOpen,
      isProviderModelDialogOpen,
      isLoadProfileDialogOpen,
      isToolsDialogOpen,
      appState.openDialogs.oauthCode,
      showPrivacyNotice,
      isProQuotaDialogOpen,
    ],
  );

  const pendingHistoryItems = useMemo(
    () => [...pendingSlashCommandHistoryItems, ...pendingGeminiHistoryItems],
    [pendingSlashCommandHistoryItems, pendingGeminiHistoryItems],
  );

  const uiState: UIState = useMemo(
    () => ({
      history: historyManager.history,
      isThemeDialogOpen,
      themeError,
      isAuthenticating,
      authError,
      isAuthDialogOpen,
      editorError,
      isEditorDialogOpen,
      isProviderDialogOpen,
      isProviderModelDialogOpen,
      isLoadProfileDialogOpen,
      isToolsDialogOpen,
      providerOptions,
      selectedProvider,
      providerModels,
      profiles,
      toolsDialogTools,
      toolsDialogAction,
      toolsDialogDisabledTools,
      showPrivacyNotice,
      corgiMode,
      debugMessage,
      quittingMessages,
      isSettingsDialogOpen,
      slashCommands,
      pendingSlashCommandHistoryItems,
      commandContext,
      shellConfirmationRequest,
      confirmationRequest,
      geminiMdFileCount,
      streamingState,
      initError,
      pendingGeminiHistoryItems,
      thought,
      shellModeActive,
      userMessages: inputHistoryStore.inputHistory,
      buffer,
      inputWidth,
      suggestionsWidth,
      isInputActive,
      shouldShowIdePrompt,
      isFolderTrustDialogOpen: isFolderTrustDialogOpen ?? false,
      isTrustedFolder,
      constrainHeight,
      showErrorDetails,
      filteredConsoleMessages,
      ideContextState,
      showToolDescriptions,
      ctrlCPressedOnce,
      ctrlDPressedOnce,
      showEscapePrompt,
      isFocused,
      elapsedTime,
      currentLoadingPhrase,
      historyRemountKey,
      messageQueue: [], // Removed message queue logic
      showAutoAcceptIndicator,
      showWorkspaceMigrationDialog,
      workspaceExtensions,
      // Use current state values instead of config.getModel()
      currentModel,
      userTier,
      isProQuotaDialogOpen,
      // New fields
      contextFileNames,
      errorCount,
      availableTerminalHeight,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      staticExtraHeight,
      dialogsVisible,
      pendingHistoryItems,
      nightly,
      branchName,
      sessionStats,
      terminalWidth,
      terminalHeight,
      mainControlsRef,
      currentIDE,
      updateInfo,
      showIdeRestartPrompt,
      isRestarting,
      appState,
      activePtyId: undefined,
      shellFocused,
    }),
    [
      historyManager.history,
      isThemeDialogOpen,
      themeError,
      isAuthenticating,
      authError,
      isAuthDialogOpen,
      editorError,
      isEditorDialogOpen,
      isProviderDialogOpen,
      isProviderModelDialogOpen,
      isLoadProfileDialogOpen,
      isToolsDialogOpen,
      providerOptions,
      selectedProvider,
      providerModels,
      profiles,
      toolsDialogTools,
      toolsDialogAction,
      toolsDialogDisabledTools,
      showPrivacyNotice,
      corgiMode,
      debugMessage,
      quittingMessages,
      isSettingsDialogOpen,
      slashCommands,
      pendingSlashCommandHistoryItems,
      commandContext,
      shellConfirmationRequest,
      confirmationRequest,
      geminiMdFileCount,
      streamingState,
      initError,
      pendingGeminiHistoryItems,
      thought,
      shellModeActive,
      inputHistoryStore.inputHistory,
      buffer,
      inputWidth,
      suggestionsWidth,
      isInputActive,
      shouldShowIdePrompt,
      isFolderTrustDialogOpen,
      isTrustedFolder,
      constrainHeight,
      showErrorDetails,
      filteredConsoleMessages,
      ideContextState,
      showToolDescriptions,
      ctrlCPressedOnce,
      ctrlDPressedOnce,
      showEscapePrompt,
      isFocused,
      elapsedTime,
      currentLoadingPhrase,
      historyRemountKey,
      showAutoAcceptIndicator,
      showWorkspaceMigrationDialog,
      workspaceExtensions,
      // Quota-related state dependencies
      userTier,
      isProQuotaDialogOpen,
      // New fields dependencies
      contextFileNames,
      errorCount,
      availableTerminalHeight,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      staticExtraHeight,
      dialogsVisible,
      pendingHistoryItems,
      nightly,
      branchName,
      sessionStats,
      terminalWidth,
      terminalHeight,
      mainControlsRef,
      currentIDE,
      updateInfo,
      showIdeRestartPrompt,
      isRestarting,
      // Quota-related dependencies
      currentModel,
      appState,
      shellFocused,
    ],
  );

  const uiActions: UIActions = useMemo(
    () => ({
      handleThemeSelect,
      handleThemeHighlight,
      handleAuthSelect,
      setAuthState: () => {}, // No-op for now as we use local state
      onAuthError,
      handleEditorSelect,
      exitEditorDialog,
      exitPrivacyNotice: () => setShowPrivacyNotice(false),
      closeSettingsDialog,
      setShellModeActive,
      vimHandleInput,
      handleIdePromptComplete,
      handleFolderTrustSelect,
      setConstrainHeight,
      onEscapePromptChange: handleEscapePromptChange,
      refreshStatic,
      handleFinalSubmit: handleUserInputSubmit,
      handleClearScreen,
      onWorkspaceMigrationDialogOpen,
      onWorkspaceMigrationDialogClose,
      handleProQuotaChoice,
      handleProviderSelect,
      exitProviderDialog,
      handleProviderModelChange,
      exitProviderModelDialog,
      handleProfileSelect,
      exitLoadProfileDialog,
      handleToolsSelect,
      exitToolsDialog,
      handleOAuthCodeDialogClose: () =>
        appDispatch({ type: 'CLOSE_DIALOG', payload: 'oauthCode' }),
      handleOAuthCodeSubmit: async (code: string) => {
        const provider = (global as unknown as { __oauth_provider?: string })
          .__oauth_provider;

        if (provider === 'anthropic') {
          const oauthManager = runtime.getCliOAuthManager();

          if (oauthManager) {
            const anthropicProvider = oauthManager.getProvider('anthropic');
            if (anthropicProvider && 'submitAuthCode' in anthropicProvider) {
              (
                anthropicProvider as { submitAuthCode: (code: string) => void }
              ).submitAuthCode(code);
            }
          }
        }
      },
    }),
    [
      handleThemeSelect,
      handleThemeHighlight,
      handleAuthSelect,
      onAuthError,
      handleEditorSelect,
      exitEditorDialog,
      closeSettingsDialog,
      setShellModeActive,
      vimHandleInput,
      handleIdePromptComplete,
      handleFolderTrustSelect,
      setConstrainHeight,
      handleEscapePromptChange,
      refreshStatic,
      handleUserInputSubmit,
      handleClearScreen,
      onWorkspaceMigrationDialogOpen,
      onWorkspaceMigrationDialogClose,
      handleProQuotaChoice,
      handleProviderSelect,
      exitProviderDialog,
      handleProviderModelChange,
      exitProviderModelDialog,
      handleProfileSelect,
      exitLoadProfileDialog,
      handleToolsSelect,
      exitToolsDialog,
      runtime,
    ],
  );

  return (
    <AppDispatchProvider value={appDispatch}>
      <UIStateContext.Provider value={uiState}>
        <UIActionsContext.Provider value={uiActions}>
          <ConfigContext.Provider value={config}>
            <AppContext.Provider
              value={{
                version: props.version,
                startupWarnings: props.startupWarnings || [],
              }}
            >
              <App />
            </AppContext.Provider>
          </ConfigContext.Provider>
        </UIActionsContext.Provider>
      </UIStateContext.Provider>
    </AppDispatchProvider>
  );
};
