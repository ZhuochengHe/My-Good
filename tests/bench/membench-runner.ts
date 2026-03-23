/**
 * MemBench runner — loads a MemBench dataset file, runs trajectories through
 * the MemBenchAdapter, and outputs accuracy + Recall@10 metrics.
 *
 * Usage (requires tsx or ts-node):
 *   npx tsx tests/bench/membench-runner.ts \
 *     --dataset tests/bench/data/membench/PS-FM.json \
 *     --output  tests/bench/membench-results/baseline-ps-fm.json \
 *     [--limit  100]     # run only first N trajectories (debug)
 *     [--verbose]        # print per-trajectory result
 *
 * Requirements:
 *   OPENAI_API_KEY env var must be set (used for the 4-choice LLM answer step)
 *
 * Dataset format (PS-FM / PS-RM):
 *   Array of trajectory objects:
 *   {
 *     tid: number,
 *     message_list: Array<Array<{ sid: number; user_message: string; assistant_message: string; ... }>>,
 *     QA: {
 *       question: string;
 *       choices: { A: string; B: string; C: string; D: string };
 *       ground_truth: "A" | "B" | "C" | "D";
 *       target_step_id: number[][];   // nested because multi-hop can have multiple targets
 *     }
 *   }
 *
 * Dataset format (OS-FM / OS-RM):
 *   Array of trajectory objects:
 *   {
 *     tid: number,
 *     message_list: Array<{ mid: number; message: string; ... }>,
 *     QA: { ... }   // same QA structure as above
 *   }
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parseArgs } from 'node:util';
import { JsonMemoryStore } from '../../src/memory/memory-store.js';
import { MemBenchAdapter } from './membench-adapter.js';
import OpenAI from 'openai';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QA {
  question: string;
  choices: { A: string; B: string; C: string; D: string };
  ground_truth: 'A' | 'B' | 'C' | 'D';
  /**
   * Each inner array is [sid, session_index].
   * sid is the step ID stored in sourceRef; used for Recall@10.
   */
  target_step_id: [number, number][];
}

/** One session-step in Participation mode (PS-*) datasets. */
interface PSStep {
  sid: number;
  user_message?: string;
  assistant_message?: string;
  message?: string; // some PS entries use a combined message field
}

/** One message in Observation mode (OS-*) datasets. */
interface OSMessage {
  mid: number;
  message: string;
}

/** Trajectory — either Participation (nested sessions) or Observation (flat list). */
type Trajectory =
  | { tid: number; message_list: PSStep[][]; QA: QA }
  | { tid: number; message_list: OSMessage[]; QA: QA };

interface BenchmarkResult {
  datasetPath: string;
  runAt: string;
  totalTrajectories: number;
  accuracy: number;
  recallAt10: number;
  perTrajectory?: Array<{
    tid: number;
    correct: boolean;
    predicted: string;
    expected: string;
    recallAt10: number;
  }>;
}

// ---------------------------------------------------------------------------
// LLM answer step
// ---------------------------------------------------------------------------

/**
 * Asks the LLM to choose the best answer A/B/C/D given context + question.
 * Uses a structured JSON output prompt so the response is always parseable.
 *
 * @param client   - OpenAI client
 * @param context  - Memory context string from adapter.recall()
 * @param question - The question string
 * @param choices  - The four answer choices
 * @returns The chosen letter "A" | "B" | "C" | "D", or "A" on parse error
 */
async function llmChoose(
  client: OpenAI,
  context: string,
  question: string,
  choices: { A: string; B: string; C: string; D: string }
): Promise<'A' | 'B' | 'C' | 'D'> {
  const choiceText = Object.entries(choices)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const prompt = `You are answering a multiple-choice question based on the memory context below.

Memory context:
${context || '(no relevant memories found)'}

Question: ${question}

Choices:
${choiceText}

Respond with ONLY a JSON object in this exact format: {"choice": "A"}
Pick the letter that best answers the question based on the memory context.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 20,
    response_format: { type: 'json_object' },
  });

  const text = response.choices[0]?.message?.content ?? '';
  try {
    const parsed = JSON.parse(text) as { choice?: string };
    const choice = parsed.choice?.toUpperCase();
    if (choice === 'A' || choice === 'B' || choice === 'C' || choice === 'D') {
      return choice;
    }
  } catch {
    // fall through to default
  }
  console.warn(`[warn] could not parse LLM response: "${text}", defaulting to A`);
  return 'A';
}

// ---------------------------------------------------------------------------
// Dataset utilities
// ---------------------------------------------------------------------------

/**
 * Returns true if the trajectory uses Participation (PS) format.
 * PS format: message_list is an array of arrays (sessions).
 */
function isPS(traj: Trajectory): traj is { tid: number; message_list: PSStep[][]; QA: QA } {
  return Array.isArray(traj.message_list[0]);
}

/**
 * Extracts (message, stepId) pairs from a trajectory.
 * Handles both PS (nested sessions) and OS (flat) layouts.
 */
function extractSteps(traj: Trajectory): Array<{ message: string; stepId: number }> {
  if (isPS(traj)) {
    // Participation: sessions × steps
    const steps: Array<{ message: string; stepId: number }> = [];
    for (const session of traj.message_list) {
      for (const step of session) {
        const text = step.user_message ?? step.message ?? '';
        if (text.trim()) {
          steps.push({ message: text, stepId: step.sid });
        }
      }
    }
    return steps;
  } else {
    // Observation: flat list
    return (traj.message_list as OSMessage[])
      .filter(m => m.message.trim())
      .map(m => ({ message: m.message, stepId: m.mid }));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dataset: { type: 'string' },
      output: { type: 'string' },
      limit: { type: 'string' },
      verbose: { type: 'boolean', default: false },
    },
    strict: true,
  });

  const datasetPath = values.dataset;
  const outputPath = values.output;

  if (!datasetPath) {
    console.error('Usage: membench-runner --dataset <path> --output <path> [--limit N] [--verbose]');
    process.exit(1);
  }

  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Load dataset.
  // MemBench JSON files use different top-level keys per question type:
  //   simple.json        -> { roles: [...], events: [...] }  — use `events`
  //   RecMultiSession.json -> { multi_agent: [...] }
  //   other files likely -> { <type_name>: [...] } or root array
  // Strategy: if root is an array, use it directly.  Otherwise, prefer known
  // keys in order (events > roles), then fall back to the first array value.
  const raw = await fs.readFile(datasetPath, 'utf-8');
  const parsed = JSON.parse(raw) as Trajectory[] | Record<string, Trajectory[]>;
  let trajectories: Trajectory[];
  if (Array.isArray(parsed)) {
    trajectories = parsed;
  } else {
    const PREFERRED = ['events', 'roles'];
    const key = PREFERRED.find(k => Array.isArray((parsed as Record<string, unknown>)[k])) ??
      Object.keys(parsed).find(k => Array.isArray((parsed as Record<string, unknown>)[k]));
    if (!key) throw new Error('Could not find trajectory array in dataset file');
    trajectories = (parsed as Record<string, Trajectory[]>)[key]!;
  }

  const limitN = values.limit !== undefined ? parseInt(values.limit, 10) : undefined;
  if (limitN !== undefined && limitN > 0) {
    trajectories = trajectories.slice(0, limitN);
    console.log(`[info] Running first ${limitN} trajectories (--limit mode)`);
  }

  console.log(`[info] Loaded ${trajectories.length} trajectories from ${datasetPath}`);

  // Setup
  // A fresh temporary memory directory is created for each full run.
  // adapter.reset() also clears all entries between individual trajectories,
  // so each trajectory starts from a completely empty memory store.
  const client = new OpenAI({ apiKey });
  const baseDir = path.join(tmpdir(), `membench-${randomUUID()}`);
  await fs.mkdir(baseDir, { recursive: true });
  const store = new JsonMemoryStore(baseDir);
  const adapter = new MemBenchAdapter(store);

  let correct = 0;
  let total = 0;
  const recallScores: number[] = [];
  const perTrajectory: BenchmarkResult['perTrajectory'] = [];

  try {
    // Run trajectories
    for (let i = 0; i < trajectories.length; i++) {
      const traj = trajectories[i]!;
      // Fresh memory state for each trajectory
      await adapter.reset();

      // Store phase
      const steps = extractSteps(traj);
      for (const { message, stepId } of steps) {
        await adapter.store(message, stepId);
      }

      // Query phase
      const { question, choices, ground_truth, target_step_id } = traj.QA;
      const context = await adapter.recall(question);
      const predicted = await llmChoose(client, context, question, choices);
      const isCorrect = predicted === ground_truth;

      if (isCorrect) correct++;
      total++;

      // Recall@10
      // target_step_id format: [[sid, session_idx], ...] — we care about the sid (pair[0]).
      const retrieved = await adapter.retri(question);
      const targets = new Set(target_step_id.map(pair => pair[0]!));
      const hits = retrieved.filter(id => targets.has(id)).length;
      const recall = targets.size > 0 ? hits / targets.size : 1;
      recallScores.push(recall);

      if (values.verbose) {
        perTrajectory!.push({
          tid: traj.tid,
          correct: isCorrect,
          predicted,
          expected: ground_truth,
          recallAt10: recall,
        });
        const status = isCorrect ? '✓' : '✗';
        console.log(
          `[${i + 1}/${trajectories.length}] tid=${traj.tid} ${status} ` +
            `pred=${predicted} exp=${ground_truth} recall=${recall.toFixed(2)}`
        );
      } else if ((i + 1) % 50 === 0) {
        const runningAcc = correct / total;
        console.log(
          `[${i + 1}/${trajectories.length}] accuracy=${runningAcc.toFixed(3)} ` +
            `recall@10=${(recallScores.reduce((a, b) => a + b, 0) / recallScores.length).toFixed(3)}`
        );
      }
    }
  } finally {
    // Clean up temp dir even if the run was interrupted
    await fs.rm(baseDir, { recursive: true, force: true });
  }

  // Aggregate metrics
  const accuracy = total > 0 ? correct / total : 0;
  const recallAt10 =
    recallScores.length > 0
      ? recallScores.reduce((a, b) => a + b, 0) / recallScores.length
      : 0;

  const result: BenchmarkResult = {
    datasetPath,
    runAt: new Date().toISOString(),
    totalTrajectories: total,
    accuracy,
    recallAt10,
    ...(values.verbose ? { perTrajectory } : {}),
  };

  console.log('\n=== Results ===');
  console.log(`Trajectories : ${total}`);
  console.log(`Accuracy     : ${(accuracy * 100).toFixed(1)}%`);
  console.log(`Recall@10    : ${(recallAt10 * 100).toFixed(1)}%`);

  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`\nResults written to ${outputPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
