import { langblyProxyUrl } from './bridgeUrls';

const LANGBLY_KEY_STORAGE = 'fr_langbly_api_key';

export function getLangblyApiKey(): string {
  return localStorage.getItem(LANGBLY_KEY_STORAGE) || '';
}

export function setLangblyApiKey(key: string): void {
  localStorage.setItem(LANGBLY_KEY_STORAGE, key.trim());
}

/**
 * Converts a BCP 47 or DeepL-style locale string to a Langbly/Google v2 target language code.
 * Langbly uses lowercase codes: "de", "fr", "zh-CN", "pt-BR", etc.
 */
export function toLangblyTargetLang(locale: string): string {
  const lower = locale.toLowerCase().replace('_', '-');
  if (lower.startsWith('zh')) return lower.includes('tw') ? 'zh-TW' : 'zh-CN';
  if (lower.startsWith('pt')) return lower.includes('br') ? 'pt-BR' : 'pt-PT';
  return lower.slice(0, 2);
}

/**
 * Translates text using the Langbly API (Google Translate v2-compatible).
 * Routes through the local bridge proxy to avoid CORS.
 * Returns null if the API key is missing, the text is already the target language, or the call fails.
 */
export async function langblyTranslate(text: string, targetLang = 'en'): Promise<string | null> {
  const apiKey = getLangblyApiKey();
  if (!apiKey) return null;

  const proxyBase = langblyProxyUrl();

  try {
    const res = await fetch(`${proxyBase}/langbly-proxy/language/translate/v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: text, target: targetLang }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const translation = data.data?.translations?.[0];
    if (!translation?.translatedText) return null;

    // Skip if already in the target language
    const detected = translation.detectedSourceLanguage?.toLowerCase();
    if (detected && targetLang.toLowerCase().startsWith(detected.slice(0, 2))) return null;

    return translation.translatedText as string;
  } catch {
    return null;
  }
}
