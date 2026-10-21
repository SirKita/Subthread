import type { Mode } from '../api/prompts';
import type { ExtractedContext } from '../context/adapter';
import type { SideExchange } from '../context/budget';

export interface SavedThread {
  id: string;
  conversationId: string;
  createdAt: number;
  updatedAt: number;
  mode: Mode;
  highlight: string;
  ctx: ExtractedContext;
  exchanges: SideExchange[];
}

export const MAX_THREADS_PER_CONVERSATION = 50;
export const MAX_THREADS_TOTAL = 300;

// Layout: one key per conversation ("history:<conversationId>" -> SavedThread[])
// plus a flat index ("history:index" -> IndexEntry[]) so global eviction never
// has to load every conversation.
const INDEX_KEY = 'history:index';
const KEY_PREFIX = 'history:';

interface IndexEntry {
  conversationId: string;
  id: string;
  updatedAt: number;
}

const keyFor = (conversationId: string): string => KEY_PREFIX + conversationId;

/** Upsert by id; enforces the per-conversation and global caps. */
export async function saveThread(thread: SavedThread): Promise<void> {
  const threads = await readConversation(thread.conversationId);
  const next = [thread, ...threads.filter((t) => t.id !== thread.id)];
  next.sort((a, b) => b.updatedAt - a.updatedAt);

  const kept = next.slice(0, MAX_THREADS_PER_CONVERSATION);
  const evicted = next.slice(MAX_THREADS_PER_CONVERSATION);
  await writeConversation(thread.conversationId, kept);

  let index = (await readIndex()).filter(
    (entry) =>
      !(entry.conversationId === thread.conversationId && entry.id === thread.id) &&
      !evicted.some((t) => t.id === entry.id && entry.conversationId === thread.conversationId),
  );
  index.push({ conversationId: thread.conversationId, id: thread.id, updatedAt: thread.updatedAt });

  // Global cap: evict oldest updatedAt first, across all conversations.
  if (index.length > MAX_THREADS_TOTAL) {
    index.sort((a, b) => b.updatedAt - a.updatedAt);
    const overflow = index.slice(MAX_THREADS_TOTAL);
    index = index.slice(0, MAX_THREADS_TOTAL);
    const byConversation = new Map<string, Set<string>>();
    for (const entry of overflow) {
      const ids = byConversation.get(entry.conversationId) ?? new Set<string>();
      ids.add(entry.id);
      byConversation.set(entry.conversationId, ids);
    }
    for (const [conversationId, ids] of byConversation) {
      const remaining = (await readConversation(conversationId)).filter((t) => !ids.has(t.id));
      await writeConversation(conversationId, remaining);
    }
  }

  await writeIndex(index);
}

/** Threads for one conversation, newest updatedAt first. */
export async function listThreads(conversationId: string): Promise<SavedThread[]> {
  const threads = await readConversation(conversationId);
  return threads.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteThread(conversationId: string, id: string): Promise<void> {
  const remaining = (await readConversation(conversationId)).filter((t) => t.id !== id);
  await writeConversation(conversationId, remaining);
  await writeIndex(
    (await readIndex()).filter((e) => !(e.conversationId === conversationId && e.id === id)),
  );
}

export async function clearConversation(conversationId: string): Promise<void> {
  await chrome.storage.local.remove(keyFor(conversationId));
  await writeIndex((await readIndex()).filter((e) => e.conversationId !== conversationId));
}

export async function clearAll(): Promise<void> {
  // Enumerate real keys rather than trusting the index, so drift can't strand data.
  const all = await chrome.storage.local.get(null);
  const historyKeys = Object.keys(all).filter((key) => key.startsWith(KEY_PREFIX));
  if (historyKeys.length > 0) await chrome.storage.local.remove(historyKeys);
}

export async function countAll(): Promise<number> {
  return (await readIndex()).length;
}

async function readConversation(conversationId: string): Promise<SavedThread[]> {
  const result = await chrome.storage.local.get(keyFor(conversationId));
  return (result[keyFor(conversationId)] as SavedThread[] | undefined) ?? [];
}

async function writeConversation(conversationId: string, threads: SavedThread[]): Promise<void> {
  if (threads.length === 0) {
    await chrome.storage.local.remove(keyFor(conversationId));
  } else {
    await chrome.storage.local.set({ [keyFor(conversationId)]: threads });
  }
}

async function readIndex(): Promise<IndexEntry[]> {
  const result = await chrome.storage.local.get(INDEX_KEY);
  return (result[INDEX_KEY] as IndexEntry[] | undefined) ?? [];
}

async function writeIndex(index: IndexEntry[]): Promise<void> {
  if (index.length === 0) {
    await chrome.storage.local.remove(INDEX_KEY);
  } else {
    await chrome.storage.local.set({ [INDEX_KEY]: index });
  }
}
