/**
 * Message type definitions for conversation handling.
 */

/** Supported message roles in conversation */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Base message structure */
export interface Message {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: number;
}

/** User message input */
export interface UserMessage extends Message {
  readonly role: 'user';
}

/** Tool call requested by the model */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/** Stop reason for assistant response */
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error';

/** Assistant response with optional tool calls */
export interface AssistantMessage extends Message {
  readonly role: 'assistant';
  readonly toolCalls?: readonly ToolCall[];
  readonly stopReason: StopReason;
}

/** System prompt message */
export interface SystemMessage extends Message {
  readonly role: 'system';
}

/** Tool execution result */
export interface ToolResultMessage extends Message {
  readonly role: 'tool';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly isError: boolean;
}

/** Union type for all message types */
export type ConversationMessage =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ToolResultMessage;

/**
 * Type guard for UserMessage
 */
export function isUserMessage(message: ConversationMessage): message is UserMessage {
  return message.role === 'user';
}

/**
 * Type guard for AssistantMessage
 */
export function isAssistantMessage(message: ConversationMessage): message is AssistantMessage {
  return message.role === 'assistant';
}

/**
 * Type guard for SystemMessage
 */
export function isSystemMessage(message: ConversationMessage): message is SystemMessage {
  return message.role === 'system';
}

/**
 * Type guard for ToolResultMessage
 */
export function isToolResultMessage(message: ConversationMessage): message is ToolResultMessage {
  return message.role === 'tool';
}
