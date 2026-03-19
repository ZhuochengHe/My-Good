/**
 * Logging subscriber for agent events.
 *
 * Logs agent lifecycle events with appropriate log levels and structured fields.
 * Uses info level for important events (agent start/end, tool calls),
 * debug level for turn events, and error level for errors.
 */

import { createLogger, type Logger } from '../utils/logger.js';
import type { AgentEvent, EventSubscriber } from '../types/events.js';
import { CredentialDetector } from '../security/credential-detector.js';

/**
 * Creates a logging subscriber that logs agent events.
 *
 * @param logger - Optional logger instance. If not provided, uses default console logger.
 * @returns Event subscriber for logging
 */
export function createLoggingSubscriber(logger?: Logger): EventSubscriber {
  const log = logger ?? createLogger({ level: 'debug' });

  return {
    onEvent(event: AgentEvent): void {
      switch (event.type) {
        case 'agent_start':
          log.info('Agent started', {
            sessionId: event.sessionId,
            eventTimestamp: event.timestamp,
          });
          break;

        case 'agent_end':
          log.info('Agent completed', {
            finishReason: event.result.finishReason,
            turns: event.result.turns,
            totalTokens: event.result.usage.totalTokens,
            eventTimestamp: event.timestamp,
          });
          break;

        case 'tool_call_start':
          log.info('Tool call started', {
            toolName: event.toolCall.name,
            toolCallId: event.toolCall.id,
            arguments: CredentialDetector.sanitizeObject(event.toolCall.arguments),
          });
          break;

        case 'tool_call_end':
          log.info('Tool call completed', {
            toolName: event.result.name,
            toolCallId: event.result.callId,
            success: event.result.success,
            durationMs: event.result.durationMs,
          });
          break;

        case 'turn_start':
          log.debug('Turn started', {
            turnNumber: event.turnNumber,
          });
          break;

        case 'turn_end':
          log.debug('Turn ended', {
            turnNumber: event.turnNumber,
            usage: event.usage,
            eventTimestamp: event.timestamp,
          });
          break;

        case 'text_delta':
          log.debug('Text delta', {
            deltaLength: event.delta.length,
          });
          break;

        case 'error':
          log.error('Agent error', {
            code: event.error.code,
            message: event.error.message,
            recoverable: event.error.recoverable,
            cause: event.error.cause?.message,
            eventTimestamp: event.timestamp,
          });
          break;
      }
    },
  };
}
