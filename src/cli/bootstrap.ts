/**
 * CLI bootstrap.
 * Handles configuration loading, auto-creation, and dependency wiring.
 */

import { mkdir, access, writeFile, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { stringify } from 'yaml';
import { loadConfig } from '../config/loader.js';
import { loadSettings } from '../config/settings-loader.js';
import { getDefaultConfig } from '../config/defaults.js';
import type { AppConfig } from '../types/config.js';
import { JsonlSessionStore } from '../session/jsonl-store.js';
import { SessionManager } from '../session/session-manager.js';
import { PluginManager } from '../plugins/manager.js';
import { ToolExecutor } from '../plugins/tool-executor.js';
import type { DangerousToolConfirm } from '../plugins/tool-executor.js';
import { ExecutionLoop } from '../agent/execution-loop.js';
import { createToolCallBridge } from '../agent/tool-call-bridge.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import { OpenAIProvider } from '../providers/openai.js';
import type { ModelProvider } from '../types/providers.js';
import { getProvider } from '../providers/registry.js';
import { ColoredOutput } from './colored-output.js';
import type { OutputAdapter } from './output-adapter.js';
import { JsonMemoryStore } from '../memory/index.js';

/**
 * Bootstrap options.
 */
export interface BootstrapOptions {
  /** Path to config file */
  readonly configPath: string;
  /**
   * Override the dangerous-tool confirmation callback.
   * When provided, this replaces the default readline prompt.
   * Use this to integrate with the TUI (e.g. stop spinner before prompting).
   */
  readonly onDangerousToolCall?: DangerousToolConfirm;
  /**
   * Pre-created output adapter to use instead of creating a new one.
   * Allows callers to share the same adapter instance with the confirmation callback.
   */
  readonly output?: OutputAdapter;
}

/**
 * Bootstrap result.
 */
export interface BootstrapResult {
  /** Loaded configuration */
  readonly config: AppConfig;
  /** Session manager */
  readonly sessionManager: SessionManager;
  /** Plugin manager */
  readonly pluginManager: PluginManager;
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Warnings during bootstrap */
  readonly warnings: readonly string[];
  /** Total number of non-expired memory entries across all layers at startup */
  readonly memoryEntryCount: number;
}

/**
 * Bootstrap the CLI application.
 * Creates default config if needed, loads plugins, initializes session store.
 *
 * @param options - Bootstrap options
 * @returns Bootstrap result with initialized components
 * @throws {Error} If config is invalid or required components fail to initialize
 *
 * @example
 * const result = await bootstrap({ configPath: './config.yaml' });
 * console.log('Loaded', result.pluginManager.getAllPlugins().length, 'plugins');
 */
export async function bootstrap(
  options: BootstrapOptions
): Promise<BootstrapResult> {
  const warnings: string[] = [];

  // Step 1: Auto-create config if it doesn't exist
  await ensureConfigExists(options.configPath);

  // Capture working directory at bootstrap time (before any chdir)
  const workingDirectory = process.cwd();

  // Step 2: Load configuration
  const config = await loadConfig(options.configPath);

  // Step 3: Load agent settings
  const settings = await loadSettings();

  // Step 3a: Override systemPrompt from the bundled prompt file when available
  let effectiveSettings = settings;
  try {
    const promptPath = fileURLToPath(
      new URL('../../cli/prompts/system-prompt.md', import.meta.url)
    );
    const promptContent = await readFile(promptPath, 'utf-8');
    effectiveSettings = {
      ...settings,
      behavior: { ...settings.behavior, systemPrompt: promptContent },
    };
  } catch {
    // File not found or unreadable; keep existing settings.behavior.systemPrompt
  }

  // Step 4: Check for API keys in environment
  checkApiKeys(config, warnings);

  // Resolve relative paths against config file directory
  const configDir = dirname(resolve(options.configPath));
  const resolvePath = (p: string): string => (isAbsolute(p) ? p : resolve(configDir, p));

  // Step 5: Initialize session store and create directory
  const sessionStorePath = resolvePath(config.session.storePath);
  const sessionStore = new JsonlSessionStore(sessionStorePath);
  await ensureDirectoryExists(sessionStorePath);

  // Step 6: Initialize provider based on config
  const provider = createProvider(config);

  // Step 7: Initialize plugin manager and load plugins
  const pluginManager = new PluginManager();
  for (const directory of config.plugins.directories) {
    const resolvedDir = resolvePath(directory);
    try {
      await pluginManager.loadFromDirectory(resolvedDir);
    } catch (error) {
      // Gracefully handle missing plugin directories
      warnings.push(`Failed to load plugins from ${resolvedDir}`);
    }
  }

  // Step 8: Create MemoryStore backed by ~/.my-agent/memory
  const memoryDir = join(homedir(), '.my-agent', 'memory');
  const memoryStore = new JsonMemoryStore(memoryDir);

  // Step 9 (formerly 8): Create ToolExecutor with memoryStore and register plugin tools
  // Use caller-supplied confirmation callback when provided (e.g. TUI-aware version),
  // otherwise fall back to a plain readline prompt.
  const defaultConfirm: DangerousToolConfirm = async (toolName, args) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      const preview = JSON.stringify(args, null, 2).slice(0, 200);
      rl.question(
        `\n⚠  Tool "${toolName}" requires confirmation:\n${preview}\n\nProceed? [y/N] `,
        (answer) => {
          rl.close();
          resolve(answer.trim().toLowerCase() === 'y');
        }
      );
    });
  };
  const confirmFn = options.onDangerousToolCall ?? defaultConfirm;

  const toolExecutor = new ToolExecutor(memoryStore, confirmFn);
  const toolDefinitions = pluginManager.getToolDefinitions();

  for (const toolDef of toolDefinitions) {
    const handler = pluginManager.getToolHandler(toolDef.name);
    if (handler) {
      const dangerous = pluginManager.isToolDangerous(toolDef.name);
      toolExecutor.registerTool(toolDef, handler, dangerous);
    }
  }

  // Step 10 (formerly 9): Create ExecutionLoop with tools, working directory, session store, and memory store
  const executionLoop = new ExecutionLoop(
    {
      id: config.agent.id,
      name: config.agent.name,
      model: config.agent.model,
      provider: config.agent.provider,
    },
    effectiveSettings,
    provider,
    toolDefinitions,
    workingDirectory,
    sessionStore,
    memoryStore
  );

  // Step 11 (formerly 10): Create tool call bridge
  const toolCallBridge = createToolCallBridge((call, context) =>
    toolExecutor.executeTool(call, context)
  );

  // Step 12 (formerly 11): Initialize session manager with ExecutionLoop and tool bridge
  const sessionManager = new SessionManager(
    sessionStore,
    provider,
    {
      model: config.agent.model,
      agentId: config.agent.id,
    },
    undefined, // groupStore
    executionLoop,
    toolCallBridge
  );

  // Step 13 (formerly 12): Create output adapter (use caller-supplied instance if provided)
  const output: OutputAdapter = options.output ?? new ColoredOutput();

  return {
    config,
    sessionManager,
    pluginManager,
    output,
    warnings,
    memoryEntryCount,
  };
}

/**
 * Ensure config file exists, creating default if needed.
 *
 * @param configPath - Path to config file
 */
async function ensureConfigExists(configPath: string): Promise<void> {
  try {
    await access(configPath);
    // File exists, nothing to do
  } catch {
    // File doesn't exist, create it with defaults
    const defaultConfig = getDefaultConfig();
    const yaml = stringify(defaultConfig);

    // Ensure parent directory exists
    const parentDir = dirname(configPath);
    await mkdir(parentDir, { recursive: true });

    // Write default config
    await writeFile(configPath, yaml, 'utf-8');
  }
}

/**
 * Ensure directory exists, creating if needed.
 *
 * @param dirPath - Directory path
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Check for required API keys and add warnings if none are configured.
 *
 * Skips the warning if the provider already has an API key in the config file.
 * Otherwise checks the provider's expected environment variables.
 *
 * @param config - Application configuration
 * @param warnings - Warnings array to populate
 */
function checkApiKeys(config: AppConfig, warnings: string[]): void {
  const providerType = config.agent.provider;
  const providerConfig = config.providers[providerType];

  // If there's already an API key in config, no need to check env vars
  if (providerConfig?.apiKey && !providerConfig.apiKey.startsWith('YOUR_')) {
    return;
  }

  const manifest = getProvider(providerType);
  const envVars = manifest?.envVars ?? [];
  for (const envVar of envVars) {
    if (!process.env[envVar]) {
      warnings.push(`${envVar} not found in environment`);
    }
  }
}

/**
 * Create provider based on configuration.
 * Uses the SDK type from the provider registry to determine which provider class to instantiate.
 *
 * @param config - Application configuration
 * @returns Model provider instance
 * @throws {Error} If provider is not configured or invalid
 */
function createProvider(config: AppConfig): ModelProvider {
  const providerType = config.agent.provider;

  // Check if provider is configured
  if (!providerType || providerType === '') {
    throw new Error('No provider configured. Run "my-agent setup" to configure your provider and API key.');
  }

  const providerConfig = config.providers[providerType];

  if (!providerConfig) {
    throw new Error(`Provider '${providerType}' not configured. Run "my-agent setup" to configure your provider and API key.`);
  }

  // Check for placeholder API key (only in production, not in tests)
  if (providerConfig.apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE' ||
      providerConfig.apiKey === 'YOUR_OPENAI_API_KEY_HERE' ||
      providerConfig.apiKey === 'YOUR_API_KEY_HERE') {
    // Allow placeholder keys in test environment
    if (process.env['NODE_ENV'] !== 'test') {
      throw new Error(`API key not configured for ${providerType}. Run "my-agent setup" to configure your API key.`);
    }
  }

  // Get provider manifest to determine which SDK to use
  const providerManifest = getProvider(providerType);
  if (!providerManifest) {
    throw new Error(`Unknown provider: ${providerType}. Provider not found in registry.`);
  }

  // Use the SDK type from the manifest to create the appropriate provider instance
  const sdkType = providerManifest.sdk;

  // Use baseUrl from config if provided, otherwise use from manifest
  const baseUrl = providerConfig.baseUrl ?? providerManifest.baseUrl;

  if (sdkType === 'anthropic') {
    return new AnthropicProvider(
      providerConfig.apiKey,
      providerConfig.timeout,
      providerConfig.maxRetries,
      baseUrl
    );
  } else if (sdkType === 'openai') {
    // OpenAI SDK is used for: OpenAI, Kimi, and other OpenAI-compatible APIs
    return new OpenAIProvider(
      providerConfig.apiKey,
      providerConfig.timeout,
      providerConfig.maxRetries,
      baseUrl
    );
  } else {
    // TypeScript exhaustiveness check
    const unsupportedSdk: never = sdkType;
    throw new Error(`Unsupported SDK type: ${String(unsupportedSdk)}. Only 'anthropic' and 'openai' SDKs are supported.`);
  }
}
