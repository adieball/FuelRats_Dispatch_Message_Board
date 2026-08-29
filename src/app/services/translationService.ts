import { bridgeProxyUrl } from './bridgeUrls';

const DEEPL_KEY_STORAGE = 'fr_deepl_api_key';

export function getDeepLApiKey(): string {
  return localStorage.getItem(DEEPL_KEY_STORAGE) || '';
}

export function setDeepLApiKey(key: string): void {
  localStorage.setItem(DEEPL_KEY_STORAGE, key.trim());
}

/**
 * Converts a BCP 47 locale string (e.g. "de-DE", "pt-BR") to a DeepL target language code.
 * DeepL requires regional variants for Portuguese and English; everything else is just the 2-char code.
 */
export function toDeepLTargetLang(locale: string): string {
  const upper = locale.toUpperCase();
  if (upper.startsWith('PT')) return upper.includes('BR') ? 'PT-BR' : 'PT-PT';
  if (upper.startsWith('ZH')) return 'ZH';
  return upper.slice(0, 2);
}

/**
 * Translates text using the DeepL API.
 * Returns null if the text is already English, the API key is missing, or the call fails.
 */
export async function translateText(text: string, targetLang = 'EN'): Promise<string | null> {
  const apiKey = getDeepLApiKey();
  if (!apiKey) return null;

  // Route through the local bridge proxy to avoid CORS — port is user-configurable
  const proxyBase = bridgeProxyUrl();
  const isFree = apiKey.endsWith(':fx');
  const baseUrl = isFree ? `${proxyBase}/deepl-proxy` : `${proxyBase}/deepl-proxy-pro`;

  try {
    const res = await fetch(`${baseUrl}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: [text], target_lang: targetLang }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const detected: string | undefined = data.translations?.[0]?.detected_source_language;
    const translated: string | undefined = data.translations?.[0]?.text;

    // Skip if already English or translation came back empty
    if (!translated || detected === 'EN') return null;

    return translated;
  } catch {
    return null;
  }
}
