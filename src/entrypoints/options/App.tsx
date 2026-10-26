import { useEffect, useState } from 'preact/hooks';
import { BRAND } from '../../lib/brand';
import { clearAll, countAll } from '../../lib/history/store';
import { t, uiLanguage, type MessageKey } from '../../lib/i18n';
import { sendTestConnection } from '../../lib/messaging/protocol';
import {
  CONTEXT_LEVELS,
  contextLevelForTokens,
  DEFAULT_SETTINGS,
  getSettings,
  setSettings,
  tokensForContextLevel,
} from '../../lib/storage/settings';

const MODELS: ReadonlyArray<{ id: string; label: MessageKey }> = [
  { id: 'claude-haiku-5-5', label: 'optionsModelHaiku' },
  { id: 'claude-sonnet-5-5', label: 'optionsModelSonnet' },
];

type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'ok'; model: string; sample: string }
  | { phase: 'error'; kind: string; message: string };

export function App() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_SETTINGS.model);
  const [maxContextTokens, setMaxContextTokens] = useState(8000);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ phase: 'idle' });
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void getSettings().then((s) => {
      setApiKey(s.apiKey);
      setModel(s.model);
      setMaxContextTokens(s.maxContextTokens);
    });
    void countAll().then(setHistoryCount);
  }, []);

  async function clearHistory() {
    await clearAll();
    setHistoryCount(0);
    setConfirmClear(false);
  }

  async function save() {
    await setSettings({ apiKey: apiKey.trim(), model, maxContextTokens });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  async function testConnection() {
    setTest({ phase: 'testing' });
    const result = await sendTestConnection();
    if (result.ok) {
      setTest({ phase: 'ok', model: result.model, sample: result.sample });
    } else {
      setTest({ phase: 'error', kind: result.error.kind, message: result.error.message });
    }
  }

  const contextTokens = tokensForContextLevel(contextLevelForTokens(maxContextTokens));

  return (
    <main class="settings">
      <h1>{BRAND.name}</h1>
      <p class="hint">
        {t('optionsIntro')}{' '}
        <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
          {t('optionsGetKey')}
        </a>
      </p>

      <label>
        {t('optionsApiKey')}
        <span class="key-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            placeholder={t('optionsApiKeyPlaceholder')}
            autocomplete="off"
            onInput={(e) => setApiKey(e.currentTarget.value)}
          />
          <button type="button" onClick={() => setShowKey(!showKey)}>
            {showKey ? t('optionsHideKey') : t('optionsShowKey')}
          </button>
        </span>
      </label>

      <label>
        {t('optionsModel')}
        <select value={model} onInput={(e) => setModel(e.currentTarget.value)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {t(m.label)}
            </option>
          ))}
        </select>
      </label>

      <label>
        {t('optionsContext')}
        <span class="slider-row">
          <span class="slider-end">{t('optionsContextLess')}</span>
          <input
            type="range"
            min={0}
            max={CONTEXT_LEVELS.length - 1}
            step={1}
            value={contextLevelForTokens(maxContextTokens)}
            onInput={(e) =>
              setMaxContextTokens(tokensForContextLevel(Number(e.currentTarget.value)))
            }
          />
          <span class="slider-end">{t('optionsContextMore')}</span>
        </span>
        <span class="help tokens">
          {t('optionsContextTokens', contextTokens.toLocaleString(uiLanguage()))}
        </span>
        <span class="help">{t('optionsContextHelp')}</span>
      </label>

      <div class="actions">
        <button type="button" class="primary" onClick={() => void save()}>
          {t('optionsSave')}
        </button>
        <button
          type="button"
          onClick={() => void testConnection()}
          disabled={test.phase === 'testing'}
        >
          {test.phase === 'testing' ? t('optionsTesting') : t('optionsTest')}
        </button>
        {saved && <span class="status ok">{t('optionsSaved')}</span>}
      </div>

      {test.phase === 'ok' && (
        <p class="status ok">
          {t('optionsTestOk', test.model)}{' '}
          <span class="sample">{t('optionsTestSample', test.sample)}</span>
        </p>
      )}
      {test.phase === 'error' && (
        <p class="status error">
          {test.kind}: {test.message}
        </p>
      )}

      <section class="history-section">
        <h2>{t('optionsHistory')}</h2>
        <p class="hint">
          {historyCount === null
            ? t('optionsHistoryCounting')
            : historyCount === 1
              ? t('optionsHistoryCountOne')
              : t('optionsHistoryCountMany', String(historyCount))}{' '}
          {t('optionsHistoryLocal')}
        </p>
        {confirmClear ? (
          <div class="actions">
            <span>{t('optionsClearConfirm')}</span>
            <button type="button" class="danger" onClick={() => void clearHistory()}>
              {t('optionsClearYes')}
            </button>
            <button type="button" onClick={() => setConfirmClear(false)}>
              {t('optionsCancel')}
            </button>
          </div>
        ) : (
          <div class="actions">
            <button type="button" onClick={() => setConfirmClear(true)} disabled={!historyCount}>
              {t('optionsClearAll')}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
