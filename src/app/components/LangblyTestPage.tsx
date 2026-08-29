import { useState } from 'react';
import { getLangblyApiKey, setLangblyApiKey } from '../services/langblyService';
import { langblyProxyUrl } from '../services/bridgeUrls';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';

const LANGUAGES = [
  { code: 'ar',    label: 'Arabic' },
  { code: 'bn',    label: 'Bengali' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'nl',    label: 'Dutch' },
  { code: 'en',    label: 'English' },
  { code: 'fr',    label: 'French' },
  { code: 'de',    label: 'German' },
  { code: 'iw',    label: 'Hebrew' },
  { code: 'hi',    label: 'Hindi' },
  { code: 'id',    label: 'Indonesian' },
  { code: 'it',    label: 'Italian' },
  { code: 'ja',    label: 'Japanese' },
  { code: 'ko',    label: 'Korean' },
  { code: 'ms',    label: 'Malay' },
  { code: 'fa',    label: 'Persian' },
  { code: 'pl',    label: 'Polish' },
  { code: 'pt-BR', label: 'Portuguese (BR)' },
  { code: 'pt-PT', label: 'Portuguese (EU)' },
  { code: 'ru',    label: 'Russian' },
  { code: 'es',    label: 'Spanish' },
  { code: 'sw',    label: 'Swahili' },
  { code: 'tl',    label: 'Filipino' },
  { code: 'ta',    label: 'Tamil' },
  { code: 'tr',    label: 'Turkish' },
  { code: 'uk',    label: 'Ukrainian' },
  { code: 'ur',    label: 'Urdu' },
  { code: 'vi',    label: 'Vietnamese' },
];

interface TranslateResult {
  translatedText: string;
  detectedSourceLanguage: string;
}


export function LangblyTestPage({ onBack }: { onBack: () => void }) {
  const [apiKey, setApiKeyState]      = useState(() => getLangblyApiKey());
  const [apiKeyInput, setApiKeyInput]  = useState(() => getLangblyApiKey());
  const [inputText, setInputText]     = useState('');
  const [targetLang, setTargetLang]   = useState('en');
  const [customCode, setCustomCode]   = useState('');
  const [result, setResult]           = useState<TranslateResult | null>(null);
  const [status, setStatus]           = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError]             = useState<string | null>(null);

  const effectiveLang = targetLang === '__custom__' ? customCode.trim() : targetLang;

  const proxyBase = langblyProxyUrl();
  const translateEndpoint = `${proxyBase}/langbly-proxy/language/translate/v2`;

  const saveKey = () => {
    setLangblyApiKey(apiKeyInput);
    setApiKeyState(apiKeyInput.trim());
  };

  const handleTranslate = async () => {
    if (!inputText.trim() || !apiKey || !effectiveLang) return;
    setStatus('loading');
    setResult(null);
    setError(null);
    try {
      const res = await fetch(translateEndpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: inputText, target: effectiveLang }),
      });
      let data: Record<string, unknown> | null = null;
      try {
        data = await res.json();
      } catch {
        const text = await res.text();
        setError(`HTTP ${res.status}: ${text || 'Non-JSON response from proxy'}`);
        setStatus('error');
        return;
      }
      if (!res.ok) {
        const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? JSON.stringify(data);
        setError(`HTTP ${res.status}: ${msg}`);
        setStatus('error');
        return;
      }
      // Narrowed the same way the error branch above does. `data` is parsed
      // JSON typed as Record<string, unknown>, so reaching through it needs a
      // shape -- and it is nullable, which is the half that would actually
      // throw if the proxy ever answered 200 with an empty body.
      const translation = (data as { data?: { translations?: TranslateResult[] } } | null)
        ?.data?.translations?.[0];
      if (!translation) { setError('API returned no translations.'); setStatus('error'); return; }
      setResult(translation as TranslateResult);
      setStatus('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="p-6 flex flex-col gap-6">

        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={onBack} className="border-slate-400 text-white bg-slate-700 hover:bg-slate-600 hover:border-slate-300">
            ← Back
          </Button>
          <h1 className="text-xl font-bold text-orange-400">Langbly Settings</h1>
        </div>

        {/* API Key */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-200">API Key</h2>
            <span className={`text-xs px-2 py-0.5 rounded ${apiKey ? 'bg-green-500/20 text-green-300' : 'bg-slate-700 text-slate-500'}`}>
              {apiKey ? 'Key saved' : 'No key saved'}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Paste your Langbly API key..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveKey()}
              className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
            />
            <Button onClick={saveKey} className="bg-orange-600 hover:bg-orange-700">Save</Button>
          </div>
          {apiKey && (
            <p className="text-xs text-slate-500">
              Proxy: <span className="text-slate-400 font-mono">{proxyBase}/langbly-proxy/…</span>
            </p>
          )}
        </div>

        {/* Usage limits */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex flex-col gap-2">
          <h2 className="font-semibold text-slate-200">Usage &amp; Billing</h2>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Free tier</span>
            <span className="text-white font-mono">500,000 chars / month</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Paid rate</span>
            <span className="text-white font-mono">$5.00 / million chars</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Billing threshold</span>
            <span className="text-white font-mono">Charged in $5 increments</span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Usage and spending limits are managed on the Langbly dashboard —{' '}
            <a
              href="https://langbly.com/dashboard/usage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 underline"
            >
              usage
            </a>
            {' / '}
            <a
              href="https://langbly.com/dashboard/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 underline"
            >
              billing
            </a>.
          </p>
        </div>

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
              <option value="__custom__">Custom…</option>
            </select>
            <Button
              onClick={handleTranslate}
              disabled={!apiKey || !inputText.trim() || !effectiveLang || status === 'loading'}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
            >
              {status === 'loading' ? 'Translating…' : 'Translate'}
            </Button>
          </div>
          {targetLang === '__custom__' && (
            <div className="flex gap-2 items-center">
              <label className="text-sm text-slate-400 flex-shrink-0">Language code:</label>
              <Input
                placeholder="e.g. zh-CN, pt-BR, fr…"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 font-mono text-sm"
              />
            </div>
          )}

          {status === 'success' && result && (
            <div className="bg-green-500/10 border border-green-500/40 rounded p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-green-400">Result</p>
                <p className="text-xs text-slate-500">
                  Detected source: <span className="text-slate-300">{result.detectedSourceLanguage}</span>
                </p>
              </div>
              <p className="text-white text-sm">{result.translatedText}</p>
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
