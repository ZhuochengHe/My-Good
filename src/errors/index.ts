/**
 * Error types and utilities.
 */

export {
  ProviderError,
  ProviderErrorCode,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  InvalidRequestError,
  ModelError,
  isProviderError,
  isRecoverableError,
} from './provider.js';

export {
  AgentError,
  MaxTurnsError,
  CancelledError,
  ToolExecutionError,
  ContextOverflowError,
  isAgentError,
  isRecoverableAgentError,
} from './agent.js';

export {
  PluginError,
  PluginErrorCode,
  PluginLoadError,
  ManifestValidationError,
  GatesCheckError,
  ToolNotFoundError,
  isPluginError,
  isRecoverablePluginError,
} from './plugin.js';

export {
  SessionError,
  SessionErrorCode,
  SessionNotFoundError,
  SessionLoadError,
  SessionSaveError,
  SessionCorruptedError,
  InvalidSessionIdError,
  SessionDeleteError,
  isSessionError,
  isRecoverableSessionError,
} from './session.js';
