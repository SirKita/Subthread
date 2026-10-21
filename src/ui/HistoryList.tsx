import { useEffect, useState } from 'preact/hooks';
import {
  clearConversation,
  deleteThread,
  listThreads,
  type SavedThread,
} from '../lib/history/store';

interface Props {
  conversationId?: string;
  onOpen: (thread: SavedThread) => void;
}

export function HistoryList({ conversationId, onOpen }: Props) {
  const [threads, setThreads] = useState<SavedThread[] | null>(null);

  const refresh = async (): Promise<void> => {
    setThreads(conversationId ? await listThreads(conversationId) : []);
  };

  useEffect(() => {
    void refresh();
    // eslint note: refresh is stable per render; conversationId is the real input
  }, [conversationId]);

  if (threads === null) return <div class="st-pending">…</div>;

  if (threads.length === 0) {
    return <div class="st-empty">No side questions in this conversation yet.</div>;
  }

  return (
    <>
      <ul class="st-history">
        {threads.map((thread) => (
          <li class="st-history-item" key={thread.id}>
            <button type="button" class="st-history-row" onClick={() => onOpen(thread)}>
              <span class="st-history-highlight">{truncate(thread.highlight, 60)}</span>
              <span class="st-history-snippet">
                {truncate(thread.exchanges[0]?.answer ?? '', 80)}
              </span>
              <span class="st-history-time">{relativeTime(thread.updatedAt)}</span>
            </button>
            <button
              type="button"
              class="st-close"
              title="Delete"
              aria-label="Delete"
              onClick={() => {
                if (!conversationId) return;
                void deleteThread(conversationId, thread.id).then(refresh);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div class="st-history-footer">
        <button
          type="button"
          onClick={() => {
            if (!conversationId) return;
            void clearConversation(conversationId).then(refresh);
          }}
        >
          Clear history for this conversation
        </button>
      </div>
    </>
  );
}

function truncate(text: string, max: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > max ? singleLine.slice(0, max) + '…' : singleLine;
}

function relativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
