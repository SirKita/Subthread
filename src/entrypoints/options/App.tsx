import { useEffect, useState } from 'preact/hooks';
import { sendTestConnection } from '../../lib/messaging/protocol';
import { DEFAULT_SETTINGS, getSettings, setSettings } from '../../lib/storage/settings';

const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — fast (default)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — smarter, slower' },
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

  useEffect(() => {
    void getSettings().then((s) => {
      setApiKey(s.apiKey);
      setModel(s.model);
      setMaxContextTokens(s.maxContextTokens);
    });
  }, []);

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

  return (
    <main class="settings">
      <h1>side-question</h1>
      <p class="hint">
        Answers use your own Anthropic API key. It is stored locally and read only by this
        extension&apos;s background worker.{' '}
        <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
          Get an API key
        </a>
      </p>

      <label>
        API key
        <span class="key-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            placeholder="sk-ant-..."
            autocomplete="off"
            onInput={(e) => setApiKey(e.currentTarget.value)}
          />
          <button type="button" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>

      <label>
        Model
        <select value={model} onInput={(e) => setModel(e.currentTarget.value)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Max context tokens
        <input
          type="number"
          min={1000}
          step={1000}
          value={maxContextTokens}
          onInput={(e) => setMaxContextTokens(Number(e.currentTarget.value) || 8000)}
        />
      </label>

      <div class="actions">
        <button type="button" class="primary" onClick={() => void save()}>
          Save
        </button>
        <button
          type="button"
          onClick={() => void testConnection()}
          disabled={test.phase === 'testing'}
        >
          {test.phase === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
        {saved && <span class="status ok">Saved</span>}
      </div>

      {test.phase === 'ok' && (
        <p class="status ok">
          OK — {test.model} <span class="sample">“{test.sample}”</span>
        </p>
      )}
      {test.phase === 'error' && (
        <p class="status error">
          {test.kind}: {test.message}
        </p>
      )}
    </main>
  );
}
