## Changelog

### Unreleased
- **LAN access**, off until enabled. Menu → Allow LAN access rebinds the board, the IRC WebSocket and the proxy onto the local network so another machine can open the page. AdiIRC and HexChat stay on this computer -- FRBoard.exe is the relay, which is why a remote tab can send and receive IRC without an IRC client of its own. The frontend talks to the host in the address bar rather than to localhost, so a LAN tab does not try to find a bridge that is not there. Windows Firewall may prompt for ports 5173, 8080 and 8081.
- Sign in from another machine actually leaves the login page. Safari treats `http://192.168.x.x` as an insecure context, so `crypto.randomUUID()` threw and the button did nothing. FuelRats will only return the token to `http://localhost:5173/callback`, which on that other machine is not the board -- the login page now opens FuelRats in a new tab and accepts the callback address pasted back
- Toggling LAN access no longer kills IRC for the rest of the session. Closing the WebSocket listener waited for the AdiIRC reader, which only wakes on a line from the client, so the rebind never finished and the board stayed disconnected until a full restart. Turning it off now leaves the sockets where they are and refuses non-local peers; turning it on still rebinds once, then the board reconnects

### v2.0.9
- The O2 countdown now shows in rat mode. It existed only on the dispatcher side -- the case window and the sidebar list -- and rat mode swaps the whole main area for RatBoard, which never rendered it, so the one number telling a rat how hard to push was the one number they could not see. It sits beside the CODE RED marker in both views, where the urgency already is. Read-only there: correcting a grab the parser read wrong belongs with dispatch, who can see the quote it came from. Nothing new appears on ordinary cases
- Station suggestions no longer offer surface ports. A settlement 73ls away is not a useful answer to "where do I send the client" when it means putting a ship on a surface, and in a system like HIP 101597 they crowded out the real stations forty to nine. Anything on a planet is now excluded -- matched on the words rather than a list of types, because EDSM spells these several ways and keeps adding more, so a hardcoded list would quietly start leaking again the next time Frontier ships a new surface type. The full "Stations in System" list is untouched and still shows everything
- The station sections list every orbital station, nearest first, rather than the nearest large pad plus a small or medium only when it happened to be closer. That rule existed to pick between two entries and has no purpose once all of them are shown. The nearby-system fallback is unchanged: with no large pad in system, or no stations at all, it still searches populated systems within 50ly and labels them with the detour distance
- The O2 countdown survives a reload. It was only derived in the branch that merges a fetched case against one already on the board, and on load there is nothing to merge against -- so every case arrived without a timer and stayed that way until a later poll happened to take the merge path, which looked like the timer needing someone to say something on the case first. Both new-case paths now read the latest grab straight out of the quotes. It starts paused, as the merge path already does when there is no prior timer: whether a rat is with the client is IRC-derived and there is no history to replay at that point, so it starts ticking on the next `wr+`/`bc+`/`open`
- `sysconf` joins the phrases that can start the countdown

### v2.0.8
- The O2 countdown reads an estimate written as a clock, not just in words. `3:32 o2` parsed as nothing before, which was awkward given the badge displays m:ss and reading one back off it is the obvious thing to do. A clock only counts with `o2` or `oxygen` beside it in the same part of the note -- dispatchers inject meetup times constantly, and `meetup time 6:32 utc` read as six and a half minutes of air would overwrite a correct countdown with a number that was never about oxygen
- `#N mm` stops the countdown. It previously needed `mm+` or `mm confirm`, so the way rats actually say it matched nothing and the clock kept running on a client already sat at the main menu -- the one moment the number on screen is most confidently wrong. `mmconf` and `mmconfirm` count too; `mm-` does not, since a trailing minus is the negative in this shorthand
- The O2 badge tells running from paused by colour rather than brightness. The two differed by opacity alone, a dimmed red against a red on a badge two characters wide, when whether the number is still falling is the most important thing about it. Paused is now the same inert slate the rest of the board uses for things that are not happening, and a dashed red outline means a code red still waiting on its first estimate
- Fixed an empty translation on a grabbed quote putting an empty string into the countdown instead of a number of seconds
- The client test page can now be driven by hand: set the case up (number, client, system, platform, rats, status including code red), talk as the client, dispatch or any assigned rat, and inject case notes with presets for a grab. It exercises the real board logic rather than an imitation -- distance reports, jump calls, rat status and the countdown are now read by one shared function that the board itself uses, so the sandbox cannot quietly disagree with the thing it stands in for. Still no IRC anywhere near it; everything that would go out is written to a log instead
- Fixed the update badge clipping the top of the connection status bar. It is a `<button>`, and the stylesheet gives every button a line height half again taller than the indicators beside it -- only visible on the rare load where an update is actually waiting, which is why it lasted
- The update badge only appears once the release actually has installers attached to it. A release exists the moment it is published and its files arrive afterwards, so a board checking during that gap offered an update the installer then refused -- a button that did nothing, for a reason nothing on screen explained. The badge now applies the installer's own test
- Releases are now built by GitHub on a tagged push rather than on somebody's machine, and land as a draft with the installers already attached

### v2.0.7
- Case numbers (in the case window and the sidebar list) now open EDSM system data -- scoopable status, closest fuel system, stations, stars, planets -- in its own browser window instead of an in-page modal, so it can stay open alongside the board instead of blocking it. The EDSM fetch logic moved into one shared `edsmService` instead of being duplicated a third time
- Full Customization/Text Only (renamed from the bubble/nickname toggle) now also controls independent message-text and translation-text colors per role, on top of the bubble or nickname it already painted. Text Only shares one bubble color instead of a fixed neutral, matching how Full Customization behaves
- Settings page reorganized into a 2x2 grid (By Role, Dispatcher, Client, Active Rats) with the preview pinned above a scrollable panel

### v2.0.6
- Message colours gain a choice of what the colour paints: the whole bubble, as before, or just the nickname. Bubble colours are dark for white text to sit on, so nickname mode keeps its own palette rather than sharing one -- a dispatcher's near-black bubble colour would have been invisible painted onto a nickname. Nickname mode starts at the orange every nickname already was, so switching it on changes nothing about your own messages until you do
- Fixed the colours page scrolling off its own dark background past one screen, going white underneath everything past the fold
- `board:build` now clears PyInstaller's cache before packing, since it was reusing what it collected last time -- a rebuilt board could ship under a fresh timestamp while still being the previous one. This one had already shipped
- Update check now runs every 10 minutes instead of 30

### v2.0.5
- Sending from the board actually reaches IRC. The line executing what the bridge sends was commented out -- deliberate, so a freshly wired board could not send until enabled, but it meant "nothing happens" was the out-of-the-box experience with no visible cause. Uncommenting it revealed a second issue: a raw `PRIVMSG` reaches everyone except the sender, since a server never echoes your own messages back to you. Messages now go out via `/msg`, which AdiIRC renders locally; actions (`/me`) still go raw, since wrapping them in `/msg` would send the CTCP envelope as literal text
- `/me` now targets the channel the case window is actually addressing, rewritten into `/describe #channel`, instead of acting on whichever window AdiIRC happened to have focused
- Added per-role message bubble color settings (Dispatcher, Client, Active Rat), with a live mock-conversation preview

### v2.0.4
- Reconciliation polling cut from 360 requests/hour per open board to 120 while visible and 30 while hidden, plus an immediate reconcile on regaining focus -- WebSocket events remain the primary path; this timer only bounds how stale a dropped event can leave a case, and ten seconds was over-weighting that against the FuelRats API's 3,600/hour allowance

### v2.0.3
- Fixed a reload not actually re-checking for updates: the cached answer was valid for the same half hour as the timer that refreshes it, so a reload right after a release went out kept reporting the old version. Cache window cut to two minutes; the half-hourly background check is unchanged

### v2.0.2
- The board notices its own updates. When a newer release exists, a small chip appears beside the API and IRC indicators; clicking it downloads the update, replaces the board, the executable and the IRC script, and restarts the board. Nothing else is required of you
- Nothing is shown while you are current, so the status row is unchanged on almost every load. It rechecks every 30 minutes, so a board left open for a shift still notices a release that lands during it
- If the check cannot reach GitHub -- offline, rate-limited -- it stays silent rather than reporting a problem you did not have

### v2.0.1
- Fixed a fresh sign-in failing with `invalid_scope`. The board asked for `groups.read.me`, which is not a scope the API declares -- the groups resource has `read` and `write` only. It looked plausible because the `verified` group *holds* a permission by that name, but holding one and being able to request it are different things. Invisible for four releases, because scope is checked only when a token is minted and everyone signed in already had one
- The installer offers to open the board when it finishes, and names it as it appears in the Start Menu
- Running the bridge from a source checkout no longer serves the board on port 5173, which `npm run dev` uses. Only the packaged executable serves it, or `--serve` on request

### v2.0.0
- **One executable.** `FRBoard.exe` serves the board and bridges IRC in the same process, with `dist/` embedded inside it. Python is no longer needed to run the board, the `.bat` launcher is gone, and there is no longer a separate "is the board running or is the bridge running" to work out. It still serves on port `5173`, so the FuelRats sign-in redirect is unchanged
- **An installer.** `FRBoard-Setup.exe` installs to `%LOCALAPPDATA%\Programs\FRBoard`, creates a Start Menu entry, places the bridge script into AdiIRC or HexChat, and registers in Settings → Apps. Per-user, so no admin prompt. Run it again to update, or `--uninstall` to remove it
- The updater replaces the board, the executable **and** the IRC script together. Manually re-copying the `.mrc` after a release was the step most likely to be skipped, and skipping it is what left people on a broken bridge script
- Release archives are written with correct forward-slash paths. `Compress-Archive` emits backslash separators, which the ZIP spec does not permit — Windows copes, but on Linux and macOS every entry became one file with a backslash in its name rather than a directory

### v1.1.81
- A ship swap is noticed even if the board was closed when you made it. Detection compared against an in-memory record that emptied whenever `RatBoard` remounted, so a swap only registered if the board stayed open across it — reloading, opening the board afterwards, or toggling Rat/Dispatch mode all lost it. It now compares against the ship stored on the account, which survives all three
- Fixed the AdiIRC bridge script reporting `Listener: NOT ACTIVE` while it was serving, and `/bridge.start` then failing with `'ircbridge' socket in use`. AdiIRC returns empty for `$sock().listening` — unlike mIRC — and all three guards trusted it, so the status was a false negative and the advice it gave caused the error. Status now tests whether the socket exists, and start closes the name before listening
- `bridge.status` no longer lists the listener itself as a connected bridge, which made an idle client look like it had one attached
- Added `/bridge.debug`, which dumps the socket and connection state in one paste
- The launcher now says *why* Python is needed when it cannot find it — a static server, because browsers refuse ES modules over `file://` and sign-in needs a real address to return to — and warns that the Microsoft Store `python` stub is not a working install

### v1.1.8
- Case history and case search are open to every drilled rat. They were behind an additional **Drilled Dispatch** requirement, which has been removed. The board's own **Drilled Rat** requirement is unchanged
- Removed the second group lookup and the `useDispatcher` hook along with it

### v1.1.7
- Case history on each case: previous rescues for the client, matched on both `client` and `clientNick`, with the full API record, the case log and a paperwork link behind a toggle. Limited to **Drilled Dispatch**, and hidden rather than refused for anyone else
- **Menu → Case search** across the whole archive — client, system, rat, platform, status, outcome, date range, code red — paginated, same group requirement
- The board gate now reads the **Drilled Rat group** rather than the `dispatch.read`/`dispatch.write` permissions. Those come from that same group so the two agree today, but they are named after the dispatch board while being granted by the rat group, and would have changed meaning silently if that were ever tidied up
- Both gates share one `/profile` lookup instead of asking twice on every load
- Fixed the bridge treating a closed browser as a fault: a tab closing raised `ConnectionClosedOK` out of `websocket.send` and was reported as an error reading from IRC, which is the opposite end of the bridge

### v1.1.6
- The board verifies your account before it loads, requiring `dispatch.read` and `dispatch.write` — the permissions the **Drilled Rat** group carries. Anyone without them gets a screen pointing at how to get drilled or trained
- Fixed signing in with FuelRats never completing: `/authorize` redirects back with the token in the query string rather than the URL fragment, so the callback read an empty fragment and sent you back to the login screen after authorising successfully
- Journal reading is opt-in per account instead of adding every commander it finds. The import only fills gaps, so enabling it cannot clobber an account set up by hand, and disabling it leaves that account in place and stops updating it
- Case notes collapse runs of join/leave lines into one entry, so a client reconnecting repeatedly no longer buries the case
- Click a quote in the case notes to send it back as `!sub`, line and index already filled in
- Client-side sandbox at `#clienttest` for working on the case window without a live rescue
- Dropped twelve dependencies that were installed but never imported — `@mui/*`, `@emotion/*`, `date-fns`, `motion`, `react-dnd`, `react-slick`, `react-popper` among them
- Earlier releases of this fork were removed: the check lives in the app, so an older build was a way around it rather than an older version of it

### v1.1.5
- Rat Mode reads the game journal: your commanders are added automatically with their last system and current ship, taken from the game's own `Loadout` event
- Positions keep themselves current from the journal every 5 seconds, per-account, updating only the commander you are actually playing
- New-case alerts — Windows notification and/or sound, off until enabled, selectable per platform with PC split into Odyssey / Horizons / Legacy
- App version shown at the foot of the header menu
- `bridge.exe` down from 14.5 MB to 10.4 MB — PyInstaller was embedding a cryptography library the bridge never uses, picked up from the build machine
- Fixed an unnamed ship importing with a blank name: the game writes the ship name as a single space, so the fallback to the ship type was never reached. Affected pasted EDSY builds too
- Fixed a rescue with no platform or expansion throwing while being parsed, which would have taken the whole poll with it
- Fixed the rat status bar pushing its FR/WR/BC badges off the edge in a narrow column
- API requests no longer served from the browser cache, which could hand a poll a stale case list

### v1.1.4
- Case quotes (`!inject`/`!grab`) now shown raw alongside chat instead of flattened into the log, in both modes
- Rat mode brought to parity with dispatch: rats on case with FR/WR/BC/FUEL state, jump calls, supercruise ETA, client nick/language, and disconnected badge
- Fixed nearest scoopable star never appearing in rat mode
- Inactive cases now sorted below active ones and shown with an INACTIVE badge, instead of miscategorized as code-red
- Code red warning now shows on hidden cases in the case selector
- Rescues reconcile periodically while the WebSocket is connected, catching dropped events without a page reload
- Fixed cases flashing when nothing had actually arrived
- Jump count now clears when an unassigned caller stands down

### v1.1.3
- Spansh jump estimates in Rat Mode, with per-account short/long-range EDSY builds
- Click-to-copy system names in both modes
- Rat mode auto-translates incoming debrief messages
- Rat mode now shows translations on case messages
- `bridge:build` now uses whatever Python is on PATH instead of a hardcoded interpreter path

### v1.1.2
- Langbly translation settings page and service, alongside DeepL
- `#debrief` IRC channel messages now surface in Rat Mode
- Added Rat Mode with TAB-completion and per-account rat tracking
- Perl HexChat bridge script (replaces the old Python HexChat bridge)
- Fixed nick-change detection on client reconnect and channel-membership checks
- Fixed `!gofr -a`/`!go -a` re-announce flag being misread as a rat nick
- Fixed stale `scDistanceLs` reference in CaseWindow
- Added SC (supercruise) timer, scoopable improvements, disconnect icon, and configurable bridge port

### v1.1.1
- Station badge now shows a hover popup with S/M and Large pad stations — click either to copy to clipboard
- Station popup repositions automatically if it would clip the screen edge
- Removed verbose debug logging from API service, IRC bridge, and components
- Added site favicon

### v1.1.0
- DeepL auto-translation for incoming messages
- `bridge.exe --version` flag
- Fixed spurious WebSocket errors in bridge console on startup
- Launch script no longer auto-starts the bridge

### v1.0.0
- Initial release
