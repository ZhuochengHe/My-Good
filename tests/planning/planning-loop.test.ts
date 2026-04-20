/**
 * Tests for PlanningLoop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlanningLoop } from '../../src/planning/planning-loop.js';
import { PlanStore } from '../../src/planning/plan-store.js';
import type { Agent, AgentRunResult } from '../../src/types/agent.js';
import type { ModelProvider, CompletionResponse } from '../../src/types/providers.js';
import type { HumanReviewRequest, HumanReviewResult, PlanningLoopConfig } from '../../src/planning/planning-loop.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAgentRunResult(overrides: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    sessionId: 'test-session',
    messages: [],
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    turns: 1,
    finishReason: 'completed',
    ...overrides,
  };
}

function makeMockAgent(): Agent {
  return {
    config: { id: 'test', name: 'Test', model: 'gpt-4o-mini', provider: 'openai' },
    run: vi.fn().mockResolvedValue(makeAgentRunResult()),
    stream: vi.fn(),
    getTools: vi.fn().mockReturnValue([]),
    getSession: vi.fn().mockResolvedValue(null),
  };
}

function makeCompletionResponse(content: string): CompletionResponse {
  return {
    message: {
      id: `msg-${randomUUID()}`,
      role: 'assistant',
      content,
      stopReason: 'end_turn',
      timestamp: Date.now(),
    },
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    model: 'gpt-4o-mini',
  };
}

function makeMockProvider(responseContent: string): ModelProvider {
  return {
    type: 'openai',
    complete: vi.fn().mockResolvedValue(makeCompletionResponse(responseContent)),
    stream: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

/** Build a default config with 'always' complexity so tests don't need to mock complexity check. */
function makeConfig(overrides: Partial<PlanningLoopConfig> = {}): PlanningLoopConfig {
  return {
    maxVerificationAttempts: 2,
    complexityThreshold: 'always',
    planStorePath: join(tmpdir(), `plan-test-${randomUUID()}.json`),
    ...overrides,
  };
}

/** JSON responses used across tests */
const PLAN_JSON = JSON.stringify({
  subgoals: [
    { title: 'Subgoal One', description: 'First phase of work' },
    { title: 'Subgoal Two', description: 'Second phase of work' },
  ],
  goalVerification: { mode: 'automated', description: 'All tasks completed' },
});

const PLAN_JSON_SINGLE = JSON.stringify({
  subgoals: [{ title: 'Only Subgoal', description: 'Just one phase' }],
  goalVerification: { mode: 'automated', description: 'Task completed' },
});

const VERIFICATION_METHOD_JSON = JSON.stringify({
  mode: 'automated',
  description: 'check that tasks completed',
});

const TASKS_JSON = JSON.stringify({
  tasks: [{ title: 'Task A' }],
});

const NOT_COMPLEX_JSON = JSON.stringify({ isComplex: false, reason: 'simple goal' });
const IS_COMPLEX_JSON = JSON.stringify({ isComplex: true, reason: 'complex multi-phase' });

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PlanningLoop', () => {
  let planStorePath: string;
  let planStore: PlanStore;
  let noopHumanReview: (req: HumanReviewRequest) => Promise<HumanReviewResult>;

  beforeEach(() => {
    planStorePath = join(tmpdir(), `plan-test-${randomUUID()}.json`);
    planStore = new PlanStore(planStorePath);
    noopHumanReview = vi.fn().mockResolvedValue({ approved: true });
  });

  afterEach(async () => {
    try {
      await unlink(planStorePath);
    } catch {
      // file may not exist if test didn't write it
    }
  });

  // ── 1. Complexity bypass (never) ────────────────────────────────────────────

  it('bypasses planning when complexityThreshold is "never"', async () => {
    const agent = makeMockAgent();
    const provider = makeMockProvider(PLAN_JSON);
    const config = makeConfig({ complexityThreshold: 'never' });

    const loop = new PlanningLoop(agent, planStore, provider, provider, noopHumanReview, config);
    const result = await loop.run('do something simple', 'session-1');

    expect(result.success).toBe(true);
    expect(result.subgoalsCompleted).toBe(0);
    expect(result.totalSubgoals).toBe(0);
    // executionLoop.run was called directly
    expect(agent.run).toHaveBeenCalledOnce();
    // provider.complete was NOT called (no planning)
    expect(provider.complete).not.toHaveBeenCalled();
    // planStore is empty
    const stored = await planStore.load();
    expect(stored).toBeNull();
  });

  // ── 2. Always complex ────────────────────────────────────────────────────────

  it('proceeds with planning when complexityThreshold is "always"', async () => {
    const agent = makeMockAgent();
    // Need responses: plan, verification x1, tasks x1
    const provider = {
      type: 'openai',
      complete: vi.fn()
        .mockResolvedValueOnce(makeCompletionResponse(PLAN_JSON_SINGLE))        // generate plan
        .mockResolvedValueOnce(makeCompletionResponse(VERIFICATION_METHOD_JSON)) // verification method sg-1
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON)),              // tasks sg-1
      stream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue(true),
    } satisfies ModelProvider;

    const config = makeConfig({ complexityThreshold: 'always' });
    const loop = new PlanningLoop(agent, planStore, provider, provider, noopHumanReview, config);
    const result = await loop.run('build something', 'session-1');

    expect(result.success).toBe(true);
    // provider.complete was called (plan was generated)
    expect(provider.complete).toHaveBeenCalled();
  });

  // ── 3. isComplex auto — returns false ────────────────────────────────────────

  it('bypasses planning when auto complexity check returns false', async () => {
    const agent = makeMockAgent();
    const provider = makeMockProvider(NOT_COMPLEX_JSON);
    const config = makeConfig({ complexityThreshold: 'auto' });

    const loop = new PlanningLoop(agent, planStore, provider, provider, noopHumanReview, config);
    const result = await loop.run('quick task', 'session-1');

    expect(result.success).toBe(true);
    expect(result.subgoalsCompleted).toBe(0);
    // Only one provider call (the complexity check), then agent.run directly
    expect(provider.complete).toHaveBeenCalledOnce();
    expect(agent.run).toHaveBeenCalledOnce();
  });

  // ── 4. isComplex auto — returns true ─────────────────────────────────────────

  it('proceeds with planning when auto complexity check returns true', async () => {
    const agent = makeMockAgent();
    const provider = {
      type: 'openai',
      complete: vi.fn()
        .mockResolvedValueOnce(makeCompletionResponse(IS_COMPLEX_JSON))          // complexity check
        .mockResolvedValueOnce(makeCompletionResponse(PLAN_JSON_SINGLE))          // generate plan
        .mockResolvedValueOnce(makeCompletionResponse(VERIFICATION_METHOD_JSON))  // verification method sg-1
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON)),               // tasks sg-1
      stream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue(true),
    } satisfies ModelProvider;

    const config = makeConfig({ complexityThreshold: 'auto' });
    const loop = new PlanningLoop(agent, planStore, provider, provider, noopHumanReview, config);
    const result = await loop.run('complex multi-step task', 'session-1');

    expect(result.success).toBe(true);
    // 5 provider calls: complexity + plan + verify-method + tasks + final-summary
    expect(provider.complete).toHaveBeenCalledTimes(5);
    // executionLoop.run called for the one subgoal
    expect(agent.run).toHaveBeenCalledOnce();
  });

  // ── 5. Initial plan generation ───────────────────────────────────────────────

  it('saves correct subgoals to planStore after plan generation', async () => {
    const agent = makeMockAgent();
    const provider = {
      type: 'openai',
      complete: vi.fn()
        .mockResolvedValueOnce(makeCompletionResponse(PLAN_JSON))                // generate plan (2 subgoals)
        .mockResolvedValueOnce(makeCompletionResponse(VERIFICATION_METHOD_JSON)) // verification sg-1
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON))               // tasks sg-1
        .mockResolvedValueOnce(makeCompletionResponse(VERIFICATION_METHOD_JSON)) // verification sg-2
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON)),              // tasks sg-2
      stream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue(true),
    } satisfies ModelProvider;

    const config = makeConfig();
    const loop = new PlanningLoop(agent, planStore, provider, provider, noopHumanReview, config);
    await loop.run('build a thing', 'session-1');

    const plan = await planStore.load();
    expect(plan).not.toBeNull();
    expect(plan!.subgoals).toHaveLength(2);
    expect(plan!.subgoals[0]!.title).toBe('Subgoal One');
    expect(plan!.subgoals[1]!.title).toBe('Subgoal Two');
    expect(plan!.originalGoal).toBe('build a thing');
  });

  // ── 6. Full run with 2 subgoals ──────────────────────────────────────────────

  it('completes a full run with 2 subgoals and marks plan as completed', async () => {
    const agent = makeMockAgent();
    const provider = {
      type: 'openai',
      complete: vi.fn()
        .mockResolvedValueOnce(makeCompletionResponse(PLAN_JSON))                 // generate plan
        .mockResolvedValueOnce(makeCompletionResponse(VERIFICATION_METHOD_JSON))  // verify sg-1
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON))                // tasks sg-1
        .mockResolvedValueOnce(makeCompletionResponse(VERIFICATION_METHOD_JSON))  // verify sg-2
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON)),               // tasks sg-2
      stream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue(true),
    } satisfies ModelProvider;

    const config = makeConfig();
    const loop = new PlanningLoop(agent, planStore, provider, provider, noopHumanReview, config);
    const result = await loop.run('build something great', 'session-1');

    expect(result.success).toBe(true);
    expect(result.subgoalsCompleted).toBe(2);
    expect(result.totalSubgoals).toBe(2);

    const plan = await planStore.load();
    expect(plan!.status).toBe('completed');
  });

  // ── 7. Human escalation on verification failure ───────────────────────────────

  it('calls onHumanReview when verification exhausts all attempts', async () => {
    const agent = makeMockAgent();
    // llm_judge verification that always fails with high confidence
    const VERIFICATION_LLM_JSON = JSON.stringify({ mode: 'llm_judge', description: 'check output', expectedArtifact: 'output.txt' });
    const JUDGE_FAIL_JSON = JSON.stringify({ passed: false, confidence: 'high', reasoning: 'not done' });

    const provider = {
      type: 'openai',
      complete: vi.fn()
        .mockResolvedValueOnce(makeCompletionResponse(PLAN_JSON_SINGLE))   // generate plan
        .mockResolvedValueOnce(makeCompletionResponse(VERIFICATION_LLM_JSON)) // verification method sg-1
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON))            // tasks sg-1
        .mockResolvedValueOnce(makeCompletionResponse(JUDGE_FAIL_JSON)),      // llm_judge verdict
      stream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue(true),
    } satisfies ModelProvider;

    const humanReview = vi.fn().mockResolvedValue({ approved: true });
    const config = makeConfig({ maxVerificationAttempts: 1 });
    const loop = new PlanningLoop(agent, planStore, provider, provider, humanReview, config);
    await loop.run('do a thing', 'session-1');

    expect(humanReview).toHaveBeenCalledOnce();
  });

  // ── 8. Human approved ────────────────────────────────────────────────────────

  it('marks subgoal as completed when human approves', async () => {
    const agent = makeMockAgent();
    const VERIFICATION_HUMAN_JSON = JSON.stringify({ mode: 'human', description: 'human checks output' });

    const provider = {
      type: 'openai',
      complete: vi.fn()
        .mockResolvedValueOnce(makeCompletionResponse(PLAN_JSON_SINGLE))      // generate plan
        .mockResolvedValueOnce(makeCompletionResponse(VERIFICATION_HUMAN_JSON)) // verification method sg-1
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON)),             // tasks sg-1
      stream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue(true),
    } satisfies ModelProvider;

    const humanReview = vi.fn().mockResolvedValue({ approved: true });
    const config = makeConfig();
    const loop = new PlanningLoop(agent, planStore, provider, provider, humanReview, config);
    const result = await loop.run('do a thing', 'session-1');

    expect(result.success).toBe(true);
    expect(humanReview).toHaveBeenCalledOnce();

    const plan = await planStore.load();
    const sg = plan!.subgoals[0]!;
    expect(sg.status).toBe('completed');
  });

  // ── 9. Human denied with instructions ────────────────────────────────────────

  it('calls executionLoop.run again when human denies with instructions', async () => {
    const agent = makeMockAgent();
    const VERIFICATION_HUMAN_JSON = JSON.stringify({ mode: 'human', description: 'human checks output' });

    const provider = {
      type: 'openai',
      complete: vi.fn()
        .mockResolvedValueOnce(makeCompletionResponse(PLAN_JSON_SINGLE))       // generate plan
        .mockResolvedValueOnce(makeCompletionResponse(VERIFICATION_HUMAN_JSON)) // verification method sg-1
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON))              // tasks sg-1
        .mockResolvedValueOnce(makeCompletionResponse(TASKS_JSON)),             // replan tasks (from instructions)
      stream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue(true),
    } satisfies ModelProvider;

    // deny with instructions → triggers re-execution
    const humanReview = vi.fn().mockResolvedValue({
      approved: false,
      instructions: 'fix the output format',
    });
    const config = makeConfig();
    const loop = new PlanningLoop(agent, planStore, provider, provider, humanReview, config);
    await loop.run('do a thing', 'session-1');

    // executionLoop.run called twice: initial + re-execution after human denial
    expect(agent.run).toHaveBeenCalledTimes(2);
  });

  // ── 10. Error handling ────────────────────────────────────────────────────────

  it('returns success:false with error message when provider.complete throws', async () => {
    const agent = makeMockAgent();
    const provider = {
      type: 'openai',
      complete: vi.fn().mockRejectedValue(new Error('API connection failed')),
      stream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue(true),
    } satisfies ModelProvider;

    const config = makeConfig();
    const loop = new PlanningLoop(agent, planStore, provider, provider, noopHumanReview, config);
    const result = await loop.run('build something', 'session-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('API connection failed');
    expect(result.subgoalsCompleted).toBe(0);
  });
});
