/**
 * Root Ink component for the chat TUI.
 *
 * Owns all render state via useStreamingSession. Routes the current
 * ChatPhase to sub-components, handles the confirmation overlay, and
 * dispatches slash commands using an Ink-native handler.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import type { SessionManager } from '../../../session/session-manager.js';
import type { AppConfig } from '../../../types/config.js';
import type { DangerousToolConfirm } from '../../../plugins/tool-executor.js';
import { useStreamingSession } from '../hooks/useStreamingSession.js';
import { ChatHeader } from './ChatHeader.js';
import { MessageList } from './MessageList.js';
import { StreamingMessage } from './StreamingMessage.js';
import { ToolCallBlock } from './ToolCallBlock.js';
import { InputLine } from './InputLine.js';
import { TokenUsageLine } from './TokenUsageLine.js';
import { ConfirmPrompt } from './ConfirmPrompt.js';

/** Default user label. */
const DEFAULT_USER_LABEL = 'you';
/** Default agent label. */
const DEFAULT_AGENT_LABEL = 'agent';
/** Default typewriter speed in milliseconds. */
const DEFAULT_TYPEWRITER_MS = 30;

/**
 * A system-level notification line shown in the message feed.
 */
interface SystemMessage {
  readonly id: number;
  readonly text: string;
  readonly isError: boolean;
}

/**
 * Props for App.
 */
export interface AppProps {
  /** Session manager. */
  readonly sessionManager: SessionManager;
  /** Active session ID. */
  readonly sessionId: string;
  /** Full application config (optional — uses defaults when absent). */
  readonly config?: AppConfig;
  /** Total memory entries for header display. */
  readonly memoryEntryCount?: number;
  /** Warnings to show on startup. */
  readonly warnings?: readonly string[];
  /**
   * Called once on mount with a DangerousToolConfirm handler.
   * Bootstrap uses this to wire the TUI confirmation flow into tool-executor.
   */
  readonly onConfirmReady?: (handler: DangerousToolConfirm) => void;
}

/** Monotonic counter for system message IDs. */
let nextSysMsgId = 0;

/**
 * Root chat application component.
 *
 * Integrates useStreamingSession, routes phases to sub-components,
 * handles dangerous-tool ConfirmPrompt overlay, and processes slash
 * commands with Ink-native state (no OutputAdapter dependency).
 *
 * @param props - App configuration.
 */
export function App(props: AppProps): React.ReactElement {
  const { sessionManager, sessionId, config, memoryEntryCount, warnings, onConfirmReady } = props;

  const { exit } = useApp();

  const userLabel = config?.agent.userLabel ?? DEFAULT_USER_LABEL;
  const agentLabel = config?.agent.agentLabel ?? DEFAULT_AGENT_LABEL;
  const typewriterMs =
    config?.agent.typewriterEffect === false
      ? 0
      : (config?.agent.typewriterSpeedMs ?? DEFAULT_TYPEWRITER_MS);

  const { state, isStreaming, submit, dispatch, compact } = useStreamingSession({
    sessionManager,
    sessionId,
  });

  // System messages: info/error lines injected by slash commands
  const [sysMessages, setSysMessages] = useState<SystemMessage[]>([]);

  /**
   * Holds the resolve function of the currently pending dangerous-tool
   * confirmation Promise. null when no confirmation is in flight.
   */
  const pendingConfirmRef = useRef<((approved: boolean) => void) | null>(null);

  /**
   * Register the DangerousToolConfirm handler with the caller (bootstrap).
   * Called once on mount; the handler suspends execution until the user
   * responds via ConfirmPrompt.
   */
  useEffect(() => {
    if (!onConfirmReady) return;

    const handler: DangerousToolConfirm = (toolName, args) =>
      new Promise<boolean>((resolve) => {
        pendingConfirmRef.current = resolve;
        dispatch({ type: 'await_confirmation', toolName, args });
      });

    onConfirmReady(handler);
    // onConfirmReady and dispatch are stable; no cleanup needed
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addSys = useCallback((text: string, isError = false): void => {
    setSysMessages((prev) => [...prev, { id: nextSysMsgId++, text, isError }]);
  }, []);

  // ------------------------------------------------------------------
  // Slash command handler (Ink-native, no OutputAdapter)
  // ------------------------------------------------------------------
  const handleSlashCommand = useCallback(
    (raw: string): void => {
      const trimmed = raw.trim();
      const parts = trimmed.slice(1).split(/\s+/);
      const command = parts[0]?.toLowerCase() ?? '';
      const args = parts.slice(1);

      switch (command) {
        case 'exit':
        case 'quit':
          exit();
          break;

        case 'help':
        case '?':
          addSys('Commands: /help  /session [id]  /model  /compact [hint]  /clear  /exit');
          break;

        case 'clear':
          setSysMessages([]);
          break;

        case 'model': {
          const provider = config?.agent.provider ?? 'unknown';
          const model = config?.agent.model ?? 'unknown';
          addSys(`Provider: ${provider}  ·  Model: ${model}`);
          break;
        }

        case 'session': {
          if (args.length > 0) {
            void (async () => {
              try {
                const all = await sessionManager.searchSessions({} as Parameters<typeof sessionManager.searchSessions>[0]);
                const match = all.find(
                  (s) => s.id === args[0] || s.id.startsWith(args[0]!)
                );
                if (!match) {
                  addSys(`Session not found: ${args[0]}`, true);
                  return;
                }
                const date = new Date(match.createdAt).toLocaleString();
                const desc = match.description ?? '(no description)';
                addSys(`${match.id.slice(0, 8)}  ${date}  ${desc}  msgs: ${match.messageCount}`);
              } catch {
                addSys('Failed to load session.', true);
              }
            })();
          } else {
            void (async () => {
              try {
                const sessions = await sessionManager.searchSessions({} as Parameters<typeof sessionManager.searchSessions>[0]);
                if (sessions.length === 0) {
                  addSys('No sessions found.');
                  return;
                }
                const recent = sessions.slice(-5).reverse();
                for (const s of recent) {
                  const date = new Date(s.createdAt).toLocaleDateString();
                  const desc = s.description ?? '(no description)';
                  addSys(`${s.id.slice(0, 8)}  ${date}  ${desc}`);
                }
              } catch {
                addSys('Failed to list sessions.', true);
              }
            })();
          }
          break;
        }

        case 'compact': {
          const instructions = args.length > 0 ? args.join(' ') : undefined;
          addSys('Compacting conversation...');
          void (async () => {
            const summary = await compact(instructions);
            addSys(`Compacted. ${summary.slice(0, 120)}`);
          })();
          break;
        }

        default:
          addSys(`Unknown command: /${command}. Type /help for available commands.`, true);
          break;
      }
    },
    [exit, addSys, config, sessionManager, compact]
  );

  const handleSubmit = useCallback(
    (input: string) => {
      submit(input);
    },
    [submit]
  );

  const handleConfirm = useCallback(
    (approved: boolean) => {
      dispatch({ type: 'confirm_tool', approved });
      // Resolve the suspended onDangerousToolCall Promise so tool-executor proceeds
      const resolve = pendingConfirmRef.current;
      if (resolve !== null) {
        pendingConfirmRef.current = null;
        resolve(approved);
      }
    },
    [dispatch]
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <ChatHeader
        agentName={config?.agent.name ?? 'My Agent'}
        provider={config?.agent.provider ?? ''}
        model={config?.agent.model ?? ''}
        sessionId={sessionId.slice(0, 8)}
        userLabel={userLabel}
        agentLabel={agentLabel}
        {...(memoryEntryCount !== undefined && { memoryEntryCount })}
      />

      {warnings && warnings.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {warnings.map((w, i) => (
            <Text key={i} color="red">
              Warning: {w}
            </Text>
          ))}
        </Box>
      )}

      <MessageList
        messages={state.messages}
        userLabel={userLabel}
        agentLabel={agentLabel}
      />

      {/* System messages from slash commands */}
      {sysMessages.map((msg) => (
        <Box key={msg.id} marginBottom={1}>
          <Text color={msg.isError ? 'red' : 'cyan'} dimColor={!msg.isError}>
            {msg.text}
          </Text>
        </Box>
      ))}

      {state.phase === 'tool_call' && state.activeToolName !== null && (
        <ToolCallBlock toolName={state.activeToolName} />
      )}

      {state.phase !== 'tool_call' && state.pendingText.length > 0 && (
        <StreamingMessage
          agentLabel={agentLabel}
          pendingText={state.pendingText}
          isToolCallActive={false}
          {...(typewriterMs !== 0 && { typewriterMs })}
        />
      )}

      <TokenUsageLine tokenUsage={state.lastTokenUsage} />

      {state.errorMessage !== null && (
        <Box marginBottom={1}>
          <Text color="red">Error: {state.errorMessage}</Text>
        </Box>
      )}

      {state.contextWarning && (
        <Box marginBottom={1}>
          <Text color="yellow">
            ⚠ Context is getting long. Use /compact [hint] to summarize.
          </Text>
        </Box>
      )}

      {state.awaitingConfirmation !== null ? (
        <ConfirmPrompt
          toolName={state.awaitingConfirmation.toolName}
          args={state.awaitingConfirmation.args}
          onConfirm={handleConfirm}
        />
      ) : (
        <InputLine
          userLabel={userLabel}
          isActive={!isStreaming}
          onSubmit={handleSubmit}
          onSlashCommand={handleSlashCommand}
        />
      )}
    </Box>
  );
}
