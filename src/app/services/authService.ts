import { isLoopbackHost } from './bridgeUrls';
import { randomId } from './randomId';

const TOKEN_KEY = 'fr_dispatch_token';
const OAUTH_STATE_KEY = 'fr_oauth_state';

/** The FuelRats app is registered for this, and only this. */
const REGISTERED_REDIRECT = 'http://localhost:5173/callback';


/**
 * "Drilled Rat" — the group the board requires, and the only gate there is.
 *
 * Checked instead of the dispatch.read/dispatch.write permissions the gate
 * used to read. Those are granted by this very group (and by owner), so the
 * two agree today, but they are named after the dispatch board while being
 * granted by the *rat* group -- the `dispatch` group grants only
 * twitter.write. If those permission strings were ever moved onto the group
 * whose name they match, which is the obvious tidy-up for someone to make,
 * the old check would have silently started admitting Drilled Dispatch and
 * turning away Drilled Rats. The group is the thing actually meant.
 */
const RAT_GROUP = 'rat';

/**
 * The same group, by id.
 *
 * Needed because `/profile` does not always return group *attributes*. With
 * some tokens the `groups` relationship resolves and `included` carries the
 * right number of entries, but each one arrives as a bare resource identifier
 * with no `name` on it -- so matching by name silently finds nothing and
 * denies everyone.
 *
 * The id is on the relationship itself, which is always present, so it works
 * either way. It is fixed: the FuelRats groups were created in 2017 and the
 * ids have not moved since.
 */
const RAT_GROUP_ID = '38f37675-d019-4288-abad-b117df4ac09c';

export interface FuelRatsGroup {
  id: string;
  name: string;
  displayName: string;
  priority: number;
}

/** Cleared on sign-out so the next account is not judged on this one. */
let groupsCache: Promise<FuelRatsGroup[]> | null = null;


const CLIENT_ID = import.meta.env.VITE_CLIENT_ID as string;

/**
 * FuelRats will only send the token back to the URI registered on the app,
 * which is localhost:5173/callback. Using this page's origin when it is a
 * LAN address is rejected at authorize, so the click appeared to work and
 * then went nowhere useful. On localhost itself, origin is that URI.
 */
function redirectUri(): string {
  return isLoopbackHost(window.location.hostname)
    ? `${window.location.origin}/callback`
    : REGISTERED_REDIRECT;
}

// users.read.me and groups.read.me are what let /profile return the `groups`
// relationship, which the Drilled Rat gate reads. A token minted without them
// still answers /profile -- meta.permissions comes back regardless -- but the
// included groups may not, and a gate that cannot see groups denies everyone.
//
// Adding a scope does not upgrade tokens already issued: anyone signed in
// before this has to sign out and back in to get one that carries them.
// groups.read, not groups.read.me -- there is no such scope, and asking for it
// fails the whole authorisation with `invalid_scope`.
//
// The trap is that the `verified` group *holds* a permission called
// groups.read.me, so it looks like a scope you may request. It is not: the API
// declares the groups resource as ["read", "write"] only, with no .me variant,
// and the authorize endpoint validates against that declaration.
//
// This was invisible for four releases. Scope is only checked when a token is
// minted, and /profile returns meta.permissions whatever the token carries --
// so every account that had signed in before the scope was added kept working,
// and only a genuinely fresh login ever saw the error.
const SCOPES = 'openid profile rescues.read users.read.me groups.read';

export function isRemoteBoardOrigin(): boolean {
  return !isLoopbackHost(window.location.hostname);
}

export function hasOAuthClientId(): boolean {
  return !!CLIENT_ID;
}

export const authService = {
  // ── OAuth2 Implicit Grant ────────────────────────────────────────────────

  /**
   * Build the FuelRats authorize URL and remember the CSRF state.
   *
   * Separated from the navigation so a LAN tab can open it in a new window
   * and still be there to accept a pasted callback URL. FuelRats sends the
   * token to localhost:5173, which on another machine is that machine, not
   * this board.
   */
  authorizeUrl(): string {
    if (!CLIENT_ID) {
      throw new Error(
        'This build has no FuelRats client id. Add VITE_CLIENT_ID to .env and restart the dev server.',
      );
    }
    const state = randomId();
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    // Survives leaving for FuelRats and coming back in another tab to paste.
    localStorage.setItem(OAUTH_STATE_KEY, state);

    const params = new URLSearchParams({
      response_type: 'token',
      client_id: CLIENT_ID,
      redirect_uri: redirectUri(),
      scope: SCOPES,
      state,
    });

    return `https://fuelrats.com/authorize?${params}`;
  },

  /** Redirect this tab to the FuelRats login/authorise page. */
  login(): void {
    window.location.href = this.authorizeUrl();
  },

  /**
   * Call this on the /callback path to extract the token from the URL fragment.
   * Returns the access token on success, or throws on error / state mismatch.
   */
  handleCallback(): string {
    // Textbook implicit grant delivers the token in the URL fragment (#), but
    // FuelRats' /authorize actually redirects with it in the query string
    // instead -- confirmed via the raw redirect Location header, which comes
    // back as `/callback?access_token=...&state=...`, not `#access_token=...`.
    const params = new URLSearchParams(window.location.search);

    const error = params.get('error');
    if (error) {
      throw new Error(`OAuth error: ${error} — ${params.get('error_description') ?? ''}`);
    }

    const state = params.get('state');
    const savedState =
      sessionStorage.getItem(OAUTH_STATE_KEY) || localStorage.getItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    localStorage.removeItem(OAUTH_STATE_KEY);
    if (state !== savedState) {
      throw new Error('OAuth state mismatch — possible CSRF attack');
    }

    const token = params.get('access_token');
    if (!token) throw new Error('No access_token in callback URL');

    this.setToken(token);

    // Strip the fragment (and token) from the browser history entry so the
    // token cannot leak via Referer headers or be re-read from history.
    window.history.replaceState({}, '', window.location.pathname);

    return token;
  },

  /**
   * Finish sign-in from a pasted FuelRats callback address.
   *
   * On another machine, authorize returns to localhost:5173/callback — that
   * machine's localhost, which is not this board. Safari leaves the token in
   * the address bar of the failed tab; pasting it here is the rest of the
   * handshake.
   */
  completeFromCallbackInput(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error('Paste the callback address first.');
    let search = trimmed;
    try {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
        search = new URL(trimmed).search;
      } else if (trimmed.includes('?')) {
        search = trimmed.slice(trimmed.indexOf('?'));
      } else if (trimmed.includes('access_token=')) {
        search = trimmed.startsWith('?') ? trimmed : `?${trimmed}`;
      }
    } catch {
      throw new Error('That does not look like a callback address.');
    }
    const params = new URLSearchParams(
      search.startsWith('?') ? search.slice(1) : search,
    );
    const error = params.get('error');
    if (error) {
      throw new Error(`OAuth error: ${error} — ${params.get('error_description') ?? ''}`);
    }
    const state = params.get('state');
    const savedState =
      sessionStorage.getItem(OAUTH_STATE_KEY) || localStorage.getItem(OAUTH_STATE_KEY);
    if (state !== savedState) {
      throw new Error('OAuth state mismatch — start Sign in again from this page, then paste.');
    }
    const token = params.get('access_token');
    if (!token) throw new Error('No access_token in that address.');
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    localStorage.removeItem(OAUTH_STATE_KEY);
    this.setToken(token);
  },

  // ── Token storage (used by both OAuth and manual-token fallback) ─────────

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY) || null;
  },

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
    // The gate reads from this, so it has to go with the token.
    groupsCache = null;
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },

  logout(): void {
    this.clearToken();
  },

  // ── Permissions ───────────────────────────────────────────────────────────

  /**
   * The scopes granted to the token (SCOPES above) are just what this app asked
   * for. What a user can actually do comes from their group memberships, which
   * GET /profile reports back as `meta.permissions` regardless of token scope.
   */
  /**
   * The groups this account belongs to.
   *
   * Read rather than inferred from permissions, because the two do not line
   * up: `dispatch.read`/`dispatch.write` are named after this board's job but
   * come from the `rat` group, not `dispatch`. The group is the thing meant.
   */
  async getGroups(): Promise<FuelRatsGroup[]> {
    // Memoised so that a re-render, or a second caller, does not send the
    // board back to /profile for an answer it already has.
    if (!groupsCache) {
      groupsCache = this.loadGroups().catch((e) => {
        groupsCache = null;   // a failure should not be remembered
        throw e;
      });
    }
    return groupsCache;
  },

  async loadGroups(): Promise<FuelRatsGroup[]> {
    const token = this.getToken();
    if (!token) return [];

    const res = await fetch('https://api.fuelrats.com/profile', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    // `included` is shared by every relationship on the document, so it is
    // filtered against this user's own group ids rather than trusted whole.
    const memberOf = json?.data?.relationships?.groups?.data;
    if (!Array.isArray(memberOf)) {
      // Says which of the two went missing, because they fail for different
      // reasons: no relationship at all means the token was not allowed to
      // read groups, while an empty `included` means it was allowed and the
      // account simply has none.
      console.warn(
        '[board gate] /profile returned no groups relationship — ' +
        'the token probably lacks groups.read.me. Sign out and back in.',
      );
      return [];
    }
    // Built from the relationship, which always carries ids, and only then
    // enriched from `included`. The other way round -- filtering `included`
    // and reading names off it -- produced entries with empty names whenever
    // the API sent bare resource identifiers, which is how this gate came to
    // deny an account that is plainly in the group.
    const details = new Map<string, any>();
    for (const item of json?.included ?? []) {
      if (item?.type === 'groups' && item?.attributes) {
        details.set(String(item.id), item.attributes);
      }
    }

    return memberOf
      .filter((g: any) => g?.id)
      .map((g: any) => {
        const id = String(g.id);
        const a = details.get(id);
        return {
          id,
          name: String(a?.name ?? ''),
          displayName: String(a?.displayName ?? ''),
          priority: Number(a?.priority ?? 0),
        };
      });
  },

  /** Whether this account is a Drilled Rat — what the board requires. */
  async isDrilledRat(): Promise<boolean> {
    const groups = await this.getGroups();
    // By id first, since the name is not always sent. The name check stays as
    // the readable one for when attributes did come through.
    return groups.some((g) => g.id === RAT_GROUP_ID || g.name === RAT_GROUP);
  },

  async getPermissions(): Promise<string[]> {
    const token = this.getToken();
    if (!token) return [];

    const res = await fetch('https://api.fuelrats.com/profile', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    return (json.data?.meta?.permissions as string[] | undefined) ?? [];
  },
};
