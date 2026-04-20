/**
 * Memory consolidation pipeline.
 *
 * At the end of a session, this pipeline:
 *   1. Chunks the conversation messages into overlapping windows
 *   2. Calls gpt-4o-mini on each chunk to extract structured memory candidates
 *   3. Embeds each candidate via text-embedding-3-small
 *   4. Deduplicates via cosine similarity against the existing EmbeddingIndex:
 *        cosine > 0.9    → merge: LLM call to produce a unified entry; update existing
 *        0.8 < cos ≤ 0.9 → related: save new entry + stub relatedTo: [existing.id]
 *        cosine ≤ 0.8    → new: save new entry
 *   5. Writes non-duplicate entries with their embedding via memoryStore.save()
 *
 * Runs fire-and-forget after agent_end — failures are silently swallowed.
 */

import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { encodingForModel } from 'js-tiktoken';
import type { ConversationMessage } from '../types/messages.js';
import type { MemoryStore, EmbeddingIndex } from '../types/memory.js';
import type { MemoryKind, MemoryEntry } from '../types/memory.js';

/** Maximum tokens per chunk window fed to the extraction LLM. */
const CHUNK_MAX_TOKENS = 3000;

/** Token overlap between consecutive windows (carried over from end of previous chunk). */
const CHUNK_OVERLAP_TOKENS = 500;

/** Tiktoken encoding used by gpt-4o-mini (cl100k_base). Lazily initialized and reused. */
let _enc: ReturnType<typeof encodingForModel> | null = null;
function getEncoding(): ReturnType<typeof encodingForModel> {
  if (_enc === null) {
    _enc = encodingForModel('gpt-4o-mini');
  }
  return _enc;
}

/** Returns the token count for a string using the gpt-4o-mini encoding. */
function countTokens(text: string): number {
  return getEncoding().encode(text).length;
}

/** Cosine threshold above which two entries are considered duplicates → merge. */
const MERGE_THRESHOLD = 0.9;

/** Cosine threshold above which entries are related but distinct → stub relatedTo. */
const RELATED_THRESHOLD = 0.8;

/** Embedding model used for all vector calls. */
const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * A single memory extracted by the LLM from a conversation chunk.
 */
interface ExtractedMemory {
  kind: MemoryKind;
  content: string;
  tags: string[];
  ttlDays?: number;
}

interface ExtractionResult {
  memories: ExtractedMemory[];
}

interface MergeResult {
  content: string;
  tags: string[];
}

/**
 * Configuration for the consolidation pipeline.
 */
export interface ConsolidationConfig {
  /** OpenAI API key. If absent, consolidation is skipped. */
  apiKey: string;
  /** LLM model for extraction and merge calls (default: gpt-4o-mini). */
  model?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Returns the formatted text of a single message for token counting.
 * Matches the format produced by formatChunk().
 */
function messageText(m: ConversationMessage): string {
  if (m.role !== 'user' && m.role !== 'assistant') return '';
  return `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`;
}

/**
 * Splits messages into overlapping token-bounded windows.
 *
 * Each window contains as many consecutive messages as fit within CHUNK_MAX_TOKENS.
 * The next window rewinds by CHUNK_OVERLAP_TOKENS worth of messages from the end of
 * the current window, ensuring cross-boundary context is not lost.
 *
 * Only user and assistant messages are counted; tool messages are excluded (they are
 * also filtered by formatChunk() at extraction time).
 *
 * @param messages - Full conversation message list
 * @returns Array of message windows, each within the token budget
 */
export function chunkMessages(
  messages: readonly ConversationMessage[]
): ConversationMessage[][] {
  const arr = Array.from(messages).filter(m => m.role === 'user' || m.role === 'assistant');
  if (arr.length === 0) return [];

  const chunks: ConversationMessage[][] = [];
  let start = 0;

  while (start < arr.length) {
    // Accumulate messages until the token budget is exhausted
    let tokens = 0;
    let end = start;
    while (end < arr.length) {
      const t = countTokens(messageText(arr[end]!));
      if (end > start && tokens + t > CHUNK_MAX_TOKENS) break;
      tokens += t;
      end++;
    }

    chunks.push(arr.slice(start, end));
    if (end >= arr.length) break;

    // Rewind by CHUNK_OVERLAP_TOKENS to compute the next window start.
    // Always overlap by at least 1 message to preserve cross-boundary context,
    // even when a single message exceeds the overlap token budget.
    let overlapTokens = 0;
    let overlapStart = end;
    while (overlapStart > start) {
      const t = countTokens(messageText(arr[overlapStart - 1]!));
      if (overlapTokens > 0 && overlapTokens + t > CHUNK_OVERLAP_TOKENS) break;
      overlapTokens += t;
      overlapStart--;
    }
    start = overlapStart;
  }

  return chunks;
}

/**
 * Computes the cosine similarity between two vectors.
 * Returns 0 if either vector has zero magnitude.
 *
 * @param a - First vector
 * @param b - Second vector
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// LLM + embedding helpers
// ---------------------------------------------------------------------------

/**
 * Formats a message window into a user/assistant transcript for the LLM.
 */
function formatChunk(messages: ConversationMessage[]): string {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
}

/**
 * Calls gpt-4o-mini to extract structured memories from a conversation chunk.
 * Returns [] on parse failure or empty response.
 */
async function extractMemories(
  client: OpenAI,
  model: string,
  transcript: string
): Promise<ExtractedMemory[]> {
  if (transcript.trim().length === 0) return [];

  const systemPrompt = `You are a memory extraction assistant. Given a conversation excerpt, extract only what will genuinely help future sessions.

## The core question
Before extracting anything, ask: "Would knowing this in a future conversation make the agent meaningfully more useful?" If no, skip it.

## Memory kinds — read carefully before assigning
- **preference**: Rules for how to treat the user — tone, communication style, explicit behavioral feedback, things they dislike. Must be something the user directly expressed, not inferred. Example: "User prefers concise answers without trailing summaries."
- **experiential**: A high-value methodology lesson distilled after completing a non-trivial task — what approach worked, what pitfall was hit, how to tackle similar work next time. VERY high bar. Do NOT use for: observations about the user's attitude ("user is open to X"), single-session debug details, or task-specific steps. Example: "When refactoring this codebase's plugin system, read plugin.json manifests first before touching handlers — the manifest is the source of truth for dangerous flags."
- **semantic**: Stable objective facts about the project, tech stack, architecture, or domain. Not opinions, not behavior rules. Example: "The project uses gpt-4o-mini for consolidation and text-embedding-3-small for embeddings."
- **episodic**: Short-lived context: active tasks, recent decisions, ongoing bugs or goals. Use ttlDays (7–90). This is the most commonly used kind. Example: "User is currently implementing a write-back LRU cache for JsonMemoryStore to fix a scanKind bottleneck."

## What NOT to extract
- Anything specific to a single debugging session (stack traces, one-off errors, intermediate fix attempts)
- Soft observations like "user is open to suggestions" or "user is receptive to X" — these are not preferences
- Step-by-step task instructions that won't recur
- Information derivable from reading the code or git history
- Pleasantries, clarifications, and conversational filler

## Calibration
Err toward extracting nothing. A session with 0–2 memories is healthy. Most chunks should produce 0. { "memories": [] } is a valid and often correct output.

Respond ONLY with valid JSON: { "memories": [...] }
Each memory: { "kind": "...", "content": "one clear specific sentence", "tags": ["2-4 keywords"], "ttlDays": N (episodic only) }
If nothing is worth remembering: { "memories": [] }`;

  try {
    const resp = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Conversation:\n${transcript}` },
      ],
    });

    const parsed = JSON.parse(resp.choices[0]?.message?.content ?? '{}') as ExtractionResult;
    if (!Array.isArray(parsed.memories)) return [];

    const validKinds = new Set<string>(['preference', 'experiential', 'semantic', 'episodic']);
    return parsed.memories.filter(
      (m): m is ExtractedMemory =>
        typeof m.content === 'string' &&
        m.content.trim().length >= 40 &&
        typeof m.kind === 'string' &&
        validKinds.has(m.kind) &&
        Array.isArray(m.tags)
    );
  } catch {
    return [];
  }
}

/**
 * Embeds a single text string via text-embedding-3-small.
 * Returns null on failure.
 *
 * @param client - OpenAI client
 * @param text - Text to embed
 */
async function embedText(client: OpenAI, text: string): Promise<number[] | null> {
  try {
    const resp = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return resp.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * Calls gpt-4o-mini to produce a single merged memory from an existing and a new candidate.
 * Returns null on failure — caller falls back to saving the new entry as-is.
 *
 * @param client - OpenAI client
 * @param model - LLM model name
 * @param existing - Content of the existing entry
 * @param candidate - Content of the new extracted memory
 */
async function mergeContents(
  client: OpenAI,
  model: string,
  existing: string,
  candidate: string
): Promise<MergeResult | null> {
  try {
    const resp = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are merging two nearly identical memory entries into one authoritative sentence.
Combine them, preferring more specific or recent information.
Respond ONLY with JSON: { "content": "...", "tags": [...] }`,
        },
        {
          role: 'user',
          content: `Existing: ${existing}\nNew: ${candidate}`,
        },
      ],
    });
    const parsed = JSON.parse(resp.choices[0]?.message?.content ?? '{}') as MergeResult;
    if (typeof parsed.content === 'string' && parsed.content.trim().length > 0) {
      return { content: parsed.content, tags: Array.isArray(parsed.tags) ? parsed.tags : [] };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Result of resolving a single extracted candidate against the existing index.
 */
type DeduplicateResult =
  | { action: 'duplicate'; existingId: string; mergedContent: string; mergedTags: string[] }
  | { action: 'related';   existingId: string }
  | { action: 'new' };

/**
 * Resolves a candidate's embedding against the existing EmbeddingIndex.
 *
 * @param embeddingIndex - The embedding index to query
 * @param candidateVec - Embedding vector of the candidate
 * @param client - OpenAI client (for merge call)
 * @param model - LLM model name
 * @param candidateContent - Raw content of the candidate
 * @param existingEntries - All current entries (to look up content for merge)
 */
async function deduplicateCandidate(
  embeddingIndex: EmbeddingIndex,
  candidateVec: number[],
  client: OpenAI,
  model: string,
  candidateContent: string,
  existingEntries: readonly MemoryEntry[]
): Promise<DeduplicateResult> {
  const topMatches = await embeddingIndex.searchByCosine(candidateVec, 3);
  if (topMatches.length === 0) return { action: 'new' };

  const best = topMatches[0]!;

  if (best.score > MERGE_THRESHOLD) {
    const existingEntry = existingEntries.find(e => e.id === best.id);
    const merged = existingEntry
      ? await mergeContents(client, model, existingEntry.content, candidateContent)
      : null;
    return {
      action: 'duplicate',
      existingId: best.id,
      mergedContent: merged?.content ?? candidateContent,
      mergedTags: merged?.tags ?? [],
    };
  }

  if (best.score > RELATED_THRESHOLD) {
    return { action: 'related', existingId: best.id };
  }

  return { action: 'new' };
}

/**
 * Runs the full consolidation pipeline on a completed session's messages.
 *
 * @param messages - All conversation messages from the session
 * @param memoryStore - The MemoryStore to read from and write new entries into
 * @param config - OpenAI API key and optional model override
 * @param embeddingIndex - Optional EmbeddingIndex for cosine-based deduplication.
 *                         When absent, falls back to saving all extracted memories without dedup.
 */
export async function consolidate(
  messages: readonly ConversationMessage[],
  memoryStore: MemoryStore,
  config: ConsolidationConfig,
  embeddingIndex?: EmbeddingIndex
): Promise<void> {
  if (!config.apiKey || messages.length === 0) return;

  const model = config.model ?? 'gpt-4o-mini';
  const client = new OpenAI({ apiKey: config.apiKey });

  // Load all existing entries once — used for merge content lookup and within-session dedup
  const existingEntries = await memoryStore.search({});

  // Track content strings already saved this session to avoid within-session duplicates
  // when no embeddingIndex is available (fallback path).
  const savedThisSession: Array<{ content: string; vec: number[] }> = [];

  for (const chunk of chunkMessages(messages)) {
    const transcript = formatChunk(chunk);
    const extracted = await extractMemories(client, model, transcript);

    for (const mem of extracted) {
      const vec = await embedText(client, mem.content);

      if (vec && embeddingIndex) {
        // --- Embedding-based deduplication path ---
        const result = await deduplicateCandidate(
          embeddingIndex,
          vec,
          client,
          model,
          mem.content,
          existingEntries
        );

        if (result.action === 'duplicate') {
          // Merge: update the existing entry with combined content + new embedding
          const newVec = await embedText(client, result.mergedContent) ?? vec;
          await memoryStore.update(result.existingId, {
            content: result.mergedContent,
            ...(result.mergedTags.length > 0 ? { tags: result.mergedTags } : {}),
          });
          await embeddingIndex.set(result.existingId, newVec);
          continue;
        }

        const relatedTo: string[] | undefined =
          result.action === 'related' ? [result.existingId] : undefined;

        const now = Date.now();
        const entry: MemoryEntry = {
          id: randomUUID(),
          kind: mem.kind,
          content: mem.content,
          tags: mem.tags,
          embedding: vec,
          ...(relatedTo ? { relatedTo } : {}),
          ...(mem.kind === 'episodic' && mem.ttlDays !== undefined ? { ttlDays: mem.ttlDays } : {}),
          createdAt: now,
          updatedAt: now,
        };
        await memoryStore.save(entry);
        // embeddingIndex.set is called inside memoryStore.save when entry.embedding is present

      } else {
        // --- Fallback path: no embedding index or embedding call failed ---
        // Use cosine similarity against vectors already saved this session to avoid
        // within-session duplicates, and skip if too similar to an already-saved vector.
        if (vec) {
          const tooSimilar = savedThisSession.some(
            s => cosineSimilarity(vec, s.vec) > MERGE_THRESHOLD
          );
          if (tooSimilar) continue;
          savedThisSession.push({ content: mem.content, vec });
        }

        const now = Date.now();
        const entry: MemoryEntry = {
          id: randomUUID(),
          kind: mem.kind,
          content: mem.content,
          tags: mem.tags,
          ...(vec ? { embedding: vec } : {}),
          ...(mem.kind === 'episodic' && mem.ttlDays !== undefined ? { ttlDays: mem.ttlDays } : {}),
          createdAt: now,
          updatedAt: now,
        };
        await memoryStore.save(entry);
      }
    }
  }
}
