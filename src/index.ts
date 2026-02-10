/**
 * Custom Agent Execution Loop
 *
 * Main entry point for the agent library.
 * Re-exports all public types and classes.
 */

// Types
export * from './types/index.js';

// Agent module
export * from './agent/index.js';

// Plugins module
export * from './plugins/index.js';

// Session module
export * from './session/index.js';

// CLI module
export { main } from './cli/index.js';
export { bootstrap } from './cli/bootstrap.js';
export type { BootstrapOptions, BootstrapResult } from './cli/bootstrap.js';
export type { OutputAdapter, TokenUsage } from './cli/output-adapter.js';
export type { InputReader } from './cli/input-reader.js';
export { PlainTextOutput } from './cli/plain-text-output.js';
export { StdinInputReader } from './cli/stdin-input-reader.js';
