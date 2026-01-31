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
