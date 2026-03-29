/**
 * A4: bootstrap() cold-start latency.
 *
 * Measures total wall-clock time for a full bootstrap() call:
 *   - Config auto-creation
 *   - Config + settings load
 *   - Serial prompt-file assembly (5 modules × 2 candidate paths each)
 *   - Plugin directory scan (0 plugins in bench config)
 *   - MemoryStore + EmbeddingIndex init
 *
 * Each bench iteration uses a fresh temp dir so there is no warm-cache
 * advantage from a prior iteration.  p50 / p99 output gives a realistic
 * picture of filesystem read variance.
 *
 * Run: npx vitest bench tests/bench/bootstrap.bench.ts
 */

import { describe, bench } from 'vitest';
import { bootstrap } from '../../src/cli/bootstrap.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Allow placeholder API key so bootstrap doesn't throw outside CI with real keys.
process.env['NODE_ENV'] = 'test';

/** Minimal valid config YAML (no plugins, Anthropic provider). */
const MINIMAL_CONFIG = [
  'agent:',
  '  name: bench-agent',
  '  maxTurns: 10',
  '  provider: anthropic',
  'providers:',
  '  anthropic:',
  '    apiKey: YOUR_ANTHROPIC_API_KEY_HERE',
  '    model: claude-haiku-4-5-20251001',
  'session:',
  '  storePath: ./sessions',
  'plugins:',
  '  directories: []',
].join('\n');

describe('A4: bootstrap cold-start latency', () => {
  bench('bootstrap() full cold start', async () => {
    // Fresh dir each iteration → no file-cache warm-up
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'bench-bootstrap-'));
    const configPath = path.join(dir, 'config.yaml');
    await fs.writeFile(configPath, MINIMAL_CONFIG, 'utf-8');

    try {
      await bootstrap({ configPath });
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }, {
    // Bootstrap touches disk; keep iterations low to avoid tmpdir flooding
    iterations: 20,
    warmupIterations: 3,
    time: 0, // use iteration count, not time budget
  });
});
