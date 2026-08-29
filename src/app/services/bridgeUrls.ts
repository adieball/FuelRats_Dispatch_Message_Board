/**
 * Where the board talks to FRBoard.exe (WebSocket + HTTP proxy).
 *
 * Defaults used to be hard-coded to localhost. That is right when the page
 * itself was opened at localhost, and wrong the moment it is opened from
 * another machine: `localhost` would mean that other machine, which is not
 * running the bridge. Derive the host from the address bar so a LAN tab
 * reaches the process that is actually serving it.
 *
 * A saved URL still wins -- the connection panel lets you point at a
 * non-default port -- except when that saved URL is localhost and the page
 * is not. That combination is almost always leftover from using the board
 * on this browser against a local instance, and would silently fail.
 */

export const IRC_URL_KEY = 'fr_irc_ws_url';
export const PROXY_URL_KEY = 'fr_deepl_proxy_url';
export const LANGBLY_PROXY_URL_KEY = 'fr_langbly_proxy_url';

export const WS_PORT = 8080;
export const PROXY_PORT = 8081;

export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function pageHost(): string {
  return window.location.hostname || 'localhost';
}

export function defaultWsUrl(): string {
  return `ws://${pageHost()}:${WS_PORT}`;
}

export function defaultProxyUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${proto}//${pageHost()}:${PROXY_PORT}`;
}

function resolve(stored: string | null, fallback: string): string {
  if (!stored) return fallback;
  if (!isLoopbackHost(pageHost()) && /localhost|127\.0\.0\.1/.test(stored)) {
    return fallback;
  }
  return stored;
}

export function bridgeWsUrl(): string {
  return resolve(localStorage.getItem(IRC_URL_KEY), defaultWsUrl());
}

export function bridgeProxyUrl(): string {
  return resolve(localStorage.getItem(PROXY_URL_KEY), defaultProxyUrl());
}

/** Langbly has its own override; fall through to the shared proxy otherwise. */
export function langblyProxyUrl(): string {
  return resolve(localStorage.getItem(LANGBLY_PROXY_URL_KEY), bridgeProxyUrl());
}
