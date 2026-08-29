import { useState } from 'react';
import { getDeepLApiKey, setDeepLApiKey } from '../services/translationService';
import { bridgeProxyUrl } from '../services/bridgeUrls';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';

const LANGUAGES = [
  { code: 'EN', label: 'English' },
  { code: 'DE', label: 'German' },
  { code: 'FR', label: 'French' },
  { code: 'ES', label: 'Spanish' },
  { code: 'PT-PT', label: 'Portuguese (EU)' },
  { code: 'PT-BR', label: 'Portuguese (BR)' },
  { code: 'IT', label: 'Italian' },
  { code: 'NL', label: 'Dutch' },
  { code: 'PL', label: 'Polish' },
  { code: 'RU', label: 'Russian' },
  { code: 'ZH', label: 'Chinese' },
  { code: 'JA', label: 'Japanese' },
];

interface TranslateResult {
  detected_source_language: string;
  text: string;
}

export function DeepLTestPage({ onBack }: { onBack: () => void }) {
  const [apiKey, setApiKeyState] = useState(() => getDeepLApiKey());
  const [apiKeyInput, setApiKeyInput] = useState(() => getDeepLApiKey());
  const [inputText, setInputText] = useState('');
  const [targetLang, setTargetLang] = useState('EN');
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [usageResult, setUsageResult] = useState<{ count: number; limit: number } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const proxyBase = bridgeProxyUrl();
  const isFree = apiKey.endsWith(':fx');
  const baseUrl = isFree ? `${proxyBase}/deepl-proxy` : `${proxyBase}/deepl-proxy-pro`;
  const tier = apiKey ? (isFree ? 'Free tier' : 'Pro tier') : 'No key saved';

  const saveKey = () => {
    setDeepLApiKey(apiKeyInput);
    setApiKeyState(apiKeyInput.trim());
  };

  const handleTranslate = async () => {
    if (!inputText.trim() || !apiKey) return;
    setStatus('loading');
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/v2/translate`, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: [inputText], target_lang: targetLang }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(`HTTP ${res.status}: ${data?.message ?? JSON.stringify(data)}`);
        setStatus('error');
        return;
      }

      const translation = data.translations?.[0];
      if (!translation) {
        setError('API returned no translations in the response.');
        setStatus('error');
        return;
      }

      setResult(translation);
      setStatus('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  };

  const handleCheckUsage = async () => {
    if (!apiKey) return;
    setUsageLoading(true);
    setUsageResult(null);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/v2/usage`, {
        headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(`HTTP ${res.status}: ${data?.message ?? 'Unknown error'}`);
      }
      const data = await res.json();
      setUsageResult({ count: data.character_count, limit: data.character_limit });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Usage check failed');
    } finally {
      setUsageLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onBack} className="border-slate-400 text-white bg-slate-700 hover:bg-slate-600 hover:border-slate-300">
          ← Back
        </Button>
        <h1 className="text-xl font-bold text-orange-400">DeepL Settings</h1>
      </div>

      {/* API Key */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-200">API Key</h2>
          <span className={`text-xs px-2 py-0.5 rounded ${apiKey ? (isFree ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300') : 'bg-slate-700 text-slate-500'}`}>
            {tier}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="Paste your DeepL API key..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()}
            className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
          />
          <Button onClick={saveKey} className="bg-orange-600 hover:bg-orange-700">Save</Button>
        </div>
        {apiKey && (
          <p className="text-xs text-slate-500">
            Endpoint: <span className="text-slate-400 font-mono">{baseUrl}</span>
          </p>
        )}
      </div>

      {/* Usage */}
      {apiKey && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-200">Usage</h2>
            <Button size="sm" variant="outline" onClick={handleCheckUsage} disabled={usageLoading} className="border-slate-400 text-white bg-slate-700 hover:bg-slate-600 hover:border-slate-300 disabled:opacity-40">
              {usageLoading ? 'Checking...' : 'Check Usage'}
            </Button>
          </div>
          {usageResult && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Characters used</span>
                <span className="text-white font-mono">{usageResult.count.toLocaleString()} / {usageResult.limit.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (usageResult.count / usageResult.limit) * 100).toFixed(1)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 text-right">
                {((usageResult.count / usageResult.limit) * 100).toFixed(1)}% used
              </p>
            </div>
          )}
        </div>
      )}

      {/* Translation Test */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex flex-col gap-3">
        <h2 className="font-semibold text-slate-200">Translation Test</h2>
        <textarea
          className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white placeholder:text-slate-500 text-sm resize-none h-24 focus:outline-none focus:ring-1 focus:ring-orange-500"
          placeholder="Enter text to translate..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <div className="flex gap-2 items-center">
          <label className="text-sm text-slate-400 flex-shrink-0">Translate to:</label>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <Button
            onClick={handleTranslate}
            disabled={!apiKey || !inputText.trim() || status === 'loading'}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
          >
            {status === 'loading' ? 'Translating...' : 'Translate'}
          </Button>
        </div>

        {status === 'success' && result && (
          <div className="bg-green-500/10 border border-green-500/40 rounded p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-green-400">Result</p>
              <p className="text-xs text-slate-500">Detected source: <span className="text-slate-300">{result.detected_source_language}</span></p>
            </div>
            <p className="text-white text-sm">{result.text}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 rounded p-3">
            <p className="text-xs text-red-400 mb-1">Error</p>
            <p className="text-red-300 text-sm font-mono">{error}</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
