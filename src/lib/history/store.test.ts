import { describe, expect, it } from 'vitest';
import type { ExtractedContext } from '../context/adapter';
import {
  clearAll,
  clearConversation,
  countAll,
  deleteThread,
  listThreads,
  MAX_THREADS_PER_CONVERSATION,
  MAX_THREADS_TOTAL,
  saveThread,
  type SavedThread,
} from './store';

const CTX: ExtractedContext = {
  highlight: 'needle',
  containingMessage: { role: 'assistant', text: 'a message with a needle in it' },
  priorTurns: [],
  strategy: 'structured',
};

function makeThread(overrides: Partial<SavedThread> = {}): SavedThread {
  const id = overrides.id ?? crypto.randomUUID();
  const updatedAt = overrides.updatedAt ?? 1000;
  return {
    id,
    conversationId: 'conv-a',
    createdAt: updatedAt,
    updatedAt,
    mode: 'explain',
    highlight: 'needle',
    ctx: CTX,
    exchanges: [{ question: undefined, answer: 'an answer' }],
    ...overrides,
  };
}

// The fake chrome.storage.local from tests/setup.ts is cleared before each test.

async function indexEntries(): Promise<Array<{ conversationId: string; id: string }>> {
  const stored = await chrome.storage.local.get('history:index');
  return (stored['history:index'] ?? []) as Array<{ conversationId: string; id: string }>;
}

describe('history store', () => {
  it('upserts by id and lists newest-updated first', async () => {
    await saveThread(makeThread({ id: 't1', updatedAt: 100 }));
    await saveThread(makeThread({ id: 't2', updatedAt: 200 }));
    await saveThread(makeThread({ id: 't1', updatedAt: 300, highlight: 'updated' }));

    const threads = await listThreads('conv-a');
    expect(threads.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(threads[0]!.highlight).toBe('updated');
    expect(await countAll()).toBe(2);
  });

  it('deleteThread removes the thread and its index entry', async () => {
    await saveThread(makeThread({ id: 't1', updatedAt: 100 }));
    await saveThread(makeThread({ id: 't2', updatedAt: 200 }));

    await deleteThread('conv-a', 't1');

    expect((await listThreads('conv-a')).map((t) => t.id)).toEqual(['t2']);
    expect(await countAll()).toBe(1);
    expect(await indexEntries()).toEqual([
      expect.objectContaining({ conversationId: 'conv-a', id: 't2' }),
    ]);
  });

  it('clearConversation removes only that conversation', async () => {
    await saveThread(makeThread({ id: 'a1', conversationId: 'conv-a', updatedAt: 100 }));
    await saveThread(makeThread({ id: 'b1', conversationId: 'conv-b', updatedAt: 200 }));

    await clearConversation('conv-a');

    expect(await listThreads('conv-a')).toEqual([]);
    expect((await listThreads('conv-b')).map((t) => t.id)).toEqual(['b1']);
    expect(await countAll()).toBe(1);
  });

  it('clearAll removes every history key including the index', async () => {
    await saveThread(makeThread({ id: 'a1', conversationId: 'conv-a' }));
    await saveThread(makeThread({ id: 'b1', conversationId: 'conv-b' }));

    await clearAll();

    expect(await listThreads('conv-a')).toEqual([]);
    expect(await listThreads('conv-b')).toEqual([]);
    expect(await countAll()).toBe(0);
    const all = await chrome.storage.local.get(null);
    expect(Object.keys(all).filter((k) => k.startsWith('history:'))).toEqual([]);
  });

  it('caps a conversation at MAX_THREADS_PER_CONVERSATION, evicting oldest updatedAt', async () => {
    for (let i = 0; i < MAX_THREADS_PER_CONVERSATION + 5; i++) {
      await saveThread(makeThread({ id: `t${i}`, updatedAt: i }));
    }

    const threads = await listThreads('conv-a');
    expect(threads).toHaveLength(MAX_THREADS_PER_CONVERSATION);
    // The 5 oldest (t0..t4) are gone.
    const ids = new Set(threads.map((t) => t.id));
    for (let i = 0; i < 5; i++) expect(ids.has(`t${i}`)).toBe(false);
    expect(ids.has(`t${MAX_THREADS_PER_CONVERSATION + 4}`)).toBe(true);
    // Index matches exactly.
    expect(await countAll()).toBe(MAX_THREADS_PER_CONVERSATION);
  });

  it('caps the total at MAX_THREADS_TOTAL, evicting oldest updatedAt across conversations', async () => {
    // 7 conversations x 45 threads = 315 saves; updatedAt increases globally,
    // so the oldest threads all live in the first conversation.
    const perConversation = 45;
    const conversations = 7;
    let clock = 0;
    for (let c = 0; c < conversations; c++) {
      for (let i = 0; i < perConversation; i++) {
        await saveThread(
          makeThread({ id: `c${c}-t${i}`, conversationId: `conv-${c}`, updatedAt: clock++ }),
        );
      }
    }

    expect(await countAll()).toBe(MAX_THREADS_TOTAL);

    // 315 - 300 = 15 oldest evicted, all from conv-0.
    const first = await listThreads('conv-0');
    expect(first).toHaveLength(perConversation - 15);
    const firstIds = new Set(first.map((t) => t.id));
    for (let i = 0; i < 15; i++) expect(firstIds.has(`c0-t${i}`)).toBe(false);
    expect(firstIds.has('c0-t15')).toBe(true);

    // Later conversations are untouched.
    expect(await listThreads('conv-6')).toHaveLength(perConversation);

    // Index is consistent with stored threads.
    let storedTotal = 0;
    for (let c = 0; c < conversations; c++) {
      storedTotal += (await listThreads(`conv-${c}`)).length;
    }
    expect(storedTotal).toBe(MAX_THREADS_TOTAL);
    expect(await indexEntries()).toHaveLength(MAX_THREADS_TOTAL);
  });
});
