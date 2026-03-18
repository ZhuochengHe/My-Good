/**
 * Chat command for CLI.
 * Handles interactive chat and single message execution.
 */

import type { SessionManager } from '../../session/session-manager.js';
import type { OutputAdapter } from '../output-adapter.js';
import type { InputReader } from '../input-reader.js';
import type { AppConfig } from '../../types/config.js';
import type { ToolCallStartEvent, AgentEndEvent } from '../../types/events.js';
import { handleSlashCommand } from '../slash-commands.js';

/** Constant loading message shown while the agent is thinking. */
const LOADING_MESSAGE = 'Thinking...';

/** Default label shown in the user prompt. */
const DEFAULT_USER_LABEL = 'you';

/** Default label shown before each agent response. */
const DEFAULT_AGENT_LABEL = 'agent';

/**
 * Chat command options.
 */
export interface ChatOptions {
  /** Session manager */
  readonly sessionManager: SessionManager;
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Input reader */
  readonly input: InputReader;
  /** Existing session ID to resume (optional) */
  readonly sessionId?: string;
  /** Single message to send (non-interactive mode) */
  readonly message?: string;
  /**
   * Full application config.
   * When provided, the styled header and configurable labels are used.
   * When omitted, sensible defaults are applied.
   */
  readonly config?: AppConfig;
  /** Total number of memory entries to display in the header indicator */
  readonly memoryEntryCount?: number;
}

/**
 * Run interactive chat or single message.
 *
 * If message is provided, runs in single-message mode.
 * Otherwise, runs interactive REPL until user types "exit" or "quit".
 *
 * @param options - Command options
 *
 * @example
 * // Interactive mode
 * await chat({ sessionManager, output, input });
 *
 * @example
 * // Single message mode
 * await chat({ sessionManager, output, input, message: 'Hello' });
 *
 * @example
 * // Resume existing session
 * await chat({ sessionManager, output, input, sessionId: 'abc-123' });
 */
export async function chat(options: ChatOptions): Promise<void> {
  try {
    // Create or resume session
    let sessionId: string;

    if (options.sessionId) {
      await options.sessionManager.resumeSession(options.sessionId);
      sessionId = options.sessionId;
    } else {
      sessionId = await options.sessionManager.createSession();
    }

    const userLabel  = options.config?.agent.userLabel  ?? DEFAULT_USER_LABEL;
    const agentLabel = options.config?.agent.agentLabel ?? DEFAULT_AGENT_LABEL;

    // Render styled header when the adapter supports it, otherwise fall back to
    // the plain-text session line preserved for backward compatibility.
    if (options.output.writeHeader) {
      options.output.writeHeader({
        agentName: options.config?.agent.name     ?? 'My Agent',
        provider:  options.config?.agent.provider ?? '',
        model:     options.config?.agent.model    ?? '',
        sessionId: sessionId.slice(0, 8),
        userLabel,
        agentLabel,
        ...(options.memoryEntryCount !== undefined && {
          memoryEntryCount: options.memoryEntryCount,
        }),
      });
    } else {
      const action = options.sessionId ? 'Resumed' : 'Created new';
      options.output.write(`${action} session: ${sessionId}\n`);
    }

    // Single message mode
    if (options.message) {
      await runSingleMessage(options, sessionId, agentLabel);
      return;
    }

    // Interactive mode
    await runInteractive(options, sessionId, userLabel, agentLabel);
  } catch (error) {
    options.output.writeError(
      `Chat error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Run single message and exit.
 *
 * @param options - Command options
 * @param sessionId - Session ID
 * @param agentLabel - Label to prefix agent response with
 */
async function runSingleMessage(
  options: ChatOptions,
  sessionId: string,
  agentLabel: string
): Promise<void> {
  if (!options.message) {
    return;
  }

  options.output.write('');

  if (options.output.writeChunk) {
    // Streaming path: print agent label prefix, then stream chunks inline
    await runStreaming(options, sessionId, agentLabel, options.message);
  } else {
    // Batch path: spinner while waiting, then print full response
    options.output.startLoading?.(LOADING_MESSAGE);
    const result = await options.sessionManager.run(sessionId, options.message, {
      onEvent: (event) => {
        if (event.type === 'tool_call_start') {
          const toolName = (event as ToolCallStartEvent).toolCall?.name ?? 'tool';
          options.output.updateLoading?.(`Using tool: ${toolName}`);
        } else if (event.type === 'tool_call_end') {
          options.output.updateLoading?.(LOADING_MESSAGE);
        }
      },
    });
    options.output.stopLoading?.();

    if (result.success) {
      const agentLine = options.output.formatAgentLine?.(agentLabel, result.response) ?? `${agentLabel} › ${result.response}`;
      options.output.write(agentLine);
      options.output.write('');
      if (result.tokenUsage) {
        options.output.writeTokenUsage(result.tokenUsage);
      }
    } else {
      options.output.writeError(result.error ?? 'Unknown error');
    }
  }
}

/**
 * Run interactive REPL.
 *
 * @param options - Command options
 * @param sessionId - Session ID
 * @param userLabel - Label shown in the prompt
 * @param agentLabel - Label prefixed to agent responses
 */
async function runInteractive(
  options: ChatOptions,
  sessionId: string,
  userLabel: string,
  agentLabel: string
): Promise<void> {
  // When no styled header was rendered, show the legacy welcome block so that
  // consumers which do not implement writeHeader still get usage guidance.
  if (!options.output.writeHeader) {
    options.output.write('\nWelcome to interactive chat!');
    options.output.write('Type your message and press Enter.');
    options.output.write('Use \\ at the end of a line to continue on the next line.');
    options.output.write('Type "exit" or "quit" to end the session.\n');
  }

  // REPL loop
  let isRunning = true;

  while (isRunning) {
    try {
      // Prompt for input
      const promptText = options.output.formatUserPrompt?.(userLabel) ?? `${userLabel} › `;
      const userInput = await options.input.prompt(promptText);

      // Check for exit commands
      const trimmedInput = userInput.trim().toLowerCase();
      if (trimmedInput === 'exit' || trimmedInput === 'quit') {
        options.output.write('Goodbye!');
        isRunning = false;
        break;
      }

      // Handle slash commands
      if (userInput.trim().startsWith('/')) {
        const slashResult = await handleSlashCommand(userInput.trim(), {
          output: options.output,
          sessionManager: options.sessionManager,
          sessionId,
          ...(options.config !== undefined && { config: options.config }),
        });
        if (slashResult.shouldExit) {
          isRunning = false;
          break;
        }
        if (slashResult.handled) continue;
      }

      // Skip empty input
      if (userInput.trim() === '') {
        continue;
      }

      // Run agent — streaming when supported, batch otherwise
      options.output.write('');
      if (options.output.writeChunk) {
        await runStreaming(options, sessionId, agentLabel, userInput);
      } else {
        options.output.startLoading?.(LOADING_MESSAGE);
        const result = await options.sessionManager.run(sessionId, userInput, {
          onEvent: (event) => {
            if (event.type === 'tool_call_start') {
              const toolName = (event as ToolCallStartEvent).toolCall?.name ?? 'tool';
              options.output.updateLoading?.(`Using tool: ${toolName}`);
            } else if (event.type === 'tool_call_end') {
              options.output.updateLoading?.(LOADING_MESSAGE);
            }
          },
        });
        options.output.stopLoading?.();

        if (result.success) {
          const agentLine = options.output.formatAgentLine?.(agentLabel, result.response) ?? `${agentLabel} › ${result.response}`;
          options.output.write(agentLine);
          options.output.write('');
          if (result.tokenUsage) {
            options.output.writeTokenUsage(result.tokenUsage);
          }
        } else {
          options.output.writeError(result.error ?? 'Unknown error');
        }
      }

      options.output.write('');
    } catch (error) {
      options.output.writeError(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Clean up
  options.input.close();
}

/**
 * Stream agent response token-by-token, printing each chunk as it arrives.
 *
 * Prints the agent label prefix before the first chunk, then streams tokens
 * inline. Shows a spinner for tool calls mid-stream, resuming output after.
 * Writes token usage from the agent_end event when streaming completes.
 *
 * @param options - Chat command options (must have output.writeChunk defined)
 * @param sessionId - Active session ID
 * @param agentLabel - Label to prefix before the streamed response
 * @param input - User input message to send
 */
async function runStreaming(
  options: ChatOptions,
  sessionId: string,
  agentLabel: string,
  input: string,
): Promise<void> {
  const prefix = options.output.formatAgentLine?.(agentLabel, '') ?? `${agentLabel} › `;
  let prefixWritten = false;
  let inToolCall = false;

  for await (const event of options.sessionManager.streamRun(sessionId, input)) {
    if (event.type === 'text_delta') {
      // If we were in a tool call, stop the spinner before resuming text output
      if (inToolCall) {
        options.output.stopLoading?.();
        inToolCall = false;
      }
      // Print the agent label prefix before the first text chunk
      if (!prefixWritten) {
        options.output.writeChunk!(prefix);
        prefixWritten = true;
      }
      options.output.writeChunk!(event.delta);
    } else if (event.type === 'tool_call_start') {
      inToolCall = true;
      const toolName = (event as ToolCallStartEvent).toolCall?.name ?? 'tool';
      options.output.startLoading?.(`Using tool: ${toolName}`);
    } else if (event.type === 'tool_call_end') {
      options.output.stopLoading?.();
      inToolCall = false;
    } else if (event.type === 'agent_end') {
      // Terminate the streamed response line
      if (prefixWritten) {
        options.output.write('');
      }
      // Display token usage
      const usage = (event as AgentEndEvent).result.usage;
      if (usage.totalTokens > 0) {
        options.output.writeTokenUsage(usage);
      }
    }
  }

  // If no text was streamed (e.g. pure tool-call response), ensure newline
  if (!prefixWritten) {
    options.output.write('');
  }
}
