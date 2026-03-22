/**
 * Ink-based chat runner.
 *
 * Entry point for the interactive TTY chat path. Renders the Ink App
 * component and awaits unmount before resolving.
 */

import React from 'react';
import { render } from 'ink';
import type { SessionManager } from '../../session/session-manager.js';
import type { AppConfig } from '../../types/config.js';
import type { DangerousToolConfirm } from '../../plugins/tool-executor.js';
import { App } from './components/App.js';

/**
 * Options for runInkChat.
 */
export interface InkChatOptions {
  /** Session manager used for agent runs. */
  readonly sessionManager: SessionManager;
  /** Full application config. */
  readonly config: AppConfig;
  /** Total memory entries for header display. */
  readonly memoryEntryCount?: number;
  /** Existing session ID to resume (optional — creates new session if omitted). */
  readonly sessionId?: string;
  /** Warnings to display at startup. */
  readonly warnings?: readonly string[];
  /**
   * Callback that will be invoked by bootstrap when a dangerous tool needs
   * confirmation. The App wires this to the ConfirmPrompt via onConfirmReady.
   */
  readonly onConfirmReady?: (handler: DangerousToolConfirm) => void;
}

/**
 * Render the Ink TUI chat interface and await completion.
 *
 * Creates or resumes a session, then mounts the {@link App} component.
 * Resolves when the user exits (e.g. /exit slash command or Ctrl+C).
 *
 * @param options - Chat runner options.
 */
export async function runInkChat(options: InkChatOptions): Promise<void> {
  const { sessionManager, config, memoryEntryCount, sessionId: existingSessionId, warnings } = options;

  // Create or resume session
  let sessionId: string;
  if (existingSessionId) {
    await sessionManager.resumeSession(existingSessionId);
    sessionId = existingSessionId;
  } else {
    sessionId = await sessionManager.createSession();
  }

  const { onConfirmReady } = options;

  const appProps = {
    sessionManager,
    sessionId,
    config,
    ...(memoryEntryCount !== undefined && { memoryEntryCount }),
    ...(warnings !== undefined && { warnings }),
    ...(onConfirmReady !== undefined && { onConfirmReady }),
  };

  const { waitUntilExit } = render(React.createElement(App, appProps));

  await waitUntilExit();
}
