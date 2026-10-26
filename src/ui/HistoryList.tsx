import { useEffect, useState } from 'preact/hooks';
import {
  clearConversation,
  deleteThread,
  listThreads,
  type SavedThread,
} from '../lib/history/store';
import { t } from '../lib/i18n';

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
    return <div class="st-empty">{t('historyEmpty')}</div>;
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
              title={t('historyDelete')}
              aria-label={t('historyDelete')}
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
          {t('historyClearConversation')}
        </button>
      </div>
    </>
  );
}

function truncate(text: string, max: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > max ? singleLine.slice(0, max) + '…' : singleLine;
}

// Plural-safe: minutes/hours use unit abbreviations, one day is its own message, and the
// days message only ever receives 2 or more.
function relativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('timeJustNow');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('timeMinutesAgo', String(minutes));
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('timeHoursAgo', String(hours));
  const days = Math.round(hours / 24);
  return days <= 1 ? t('timeYesterday') : t('timeDaysAgo', String(days));
}
