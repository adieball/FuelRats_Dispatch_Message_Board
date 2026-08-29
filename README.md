# FuelRats Dispatch Board

[![CI](https://github.com/KillDave/FuelRats_Dispatch_Message_Board/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/KillDave/FuelRats_Dispatch_Message_Board/actions/workflows/ci.yml)
[![Release](https://github.com/KillDave/FuelRats_Dispatch_Message_Board/actions/workflows/release.yml/badge.svg)](https://github.com/KillDave/FuelRats_Dispatch_Message_Board/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/KillDave/FuelRats_Dispatch_Message_Board?label=latest)](https://github.com/KillDave/FuelRats_Dispatch_Message_Board/releases/latest)

A browser-based dispatch tool for Fuel Rats dispatchers, connecting to the FuelRats API and IRC bridge to manage active rescues in real time.

## Requirements

- A FuelRats account in the **Drilled Rat** group.
- [AdiIRC](https://www.adiirc.com/) (or HexChat — see [IRC client setup](#irc-client-setup))

That is the whole list. From v2.0 the board and the bridge are a single
`FRBoard.exe`, which carries its own web server, so Python is no longer needed
to run it — only to build it.

### Building from source

Create a `.env` in the project root before `npm run build`:

```
VITE_CLIENT_ID=<FuelRats OAuth client id>
```

`.env` is gitignored, and a build made without it compiles `client_id` to
`undefined` — the app loads and an existing session keeps working, so the only
symptom is that signing in dead-ends at the FuelRats authorize page. Worth
checking on any build you intend to hand to someone else.

---

## Setup

### The short way

Download **`FRBoard-Setup.exe`** from the [latest release](../../releases/latest) and run it.

It installs to `%LOCALAPPDATA%\Programs\FRBoard`, adds a Start Menu entry (so
Windows Search finds it), places the bridge script into AdiIRC or HexChat for
you, and registers in **Settings → Apps** so it uninstalls normally. No admin
rights, because everything is per-user.

Run it again any time to update — it replaces the board, the executable and the
IRC script together, which is the combination people otherwise forget. AdiIRC
notices the script changed and offers to reload it.

The only thing it will not do while AdiIRC is open is register a script AdiIRC
has never loaded before, since that needs a line adding to `config.ini` and
AdiIRC rewrites that file when it closes. Updating an already-registered script
is fine with it running.

```
FRBoard-Setup.exe              install or update, interactively
FRBoard-Setup.exe --check      report versions, change nothing
FRBoard-Setup.exe --update     files only, no registration
FRBoard-Setup.exe --uninstall  remove it
```

### The manual way

Everything below still works, and is what to read if you would rather place the
files yourself or are running from a source checkout.

### 1. Set up the IRC bridge

#### AdiIRC

1. Open AdiIRC → **Tools** → **Scripts**
2. Load `scripts/IRC/adiirc/adiirc_tcp_server.mrc`
3. In any AdiIRC window, type `/bridge.start` to start the TCP server
4. Verify with `/bridge.status` — it should report listening on port `12346`

#### HexChat *(work in progress)*

A Perl script is provided at `scripts/IRC/hexchat/hexchat_tcp_server.pl` but is not yet fully supported. Drop it in `%APPDATA%\HexChat\addons\` — HexChat loads addons on startup, so there is nothing to register. It needs HexChat's Perl plugin, which its Windows installer offers as an optional component.

### 2. Run FRBoard.exe

Download **`FRBoard.exe`** from the release and run it. It serves the board *and*
bridges IRC, so there is nothing else to start — it opens
`http://localhost:5173` in your browser by default (`--no-browser` to stop that).

A console window stays open while it runs; keep it there while dispatching, as
it prints the IRC connection state.

It also reads your Elite journals, which is how Rat Mode knows your commanders,
ships and current system. It finds them via the registry, since the Saved Games
folder can be relocated — set `JOURNAL_DIR` to override.

Optionally register the `fr-dispatch://` protocol handler, so the board can
start it for you on page load. This adds one entry to the Windows registry.

```
FRBoard.exe --register
FRBoard.exe --unregister
```

> **Upgrading from 1.x:** `bridge.exe` no longer ships. `FRBoard.exe` replaces
> both it and `Launch Dispatch Board.bat`, and needs no Python. Delete the old
> folder once you are happy.

`Dispatch_Board_vX.Y.Z.zip` is still published for anyone who would rather serve
`dist/` themselves — with the `.bat`, or any static web server. Note it contains
only the board: pair it with `FRBoard.exe` if you want the IRC bridge as well.

### 3. Log in

Click **Login** and you'll be redirected to [fuelrats.com](https://fuelrats.com). Log in and approve the authorisation request — you'll be sent back to the dispatch board automatically.

---

## Features

**Case Management**
- Live case board pulling from the FuelRats API with auto-refresh
- Cases auto-close when the API marks them resolved — no manual dismissal needed
- Per-case windows with platform, system, language, and landmark distance badges
- Scoopable star status fetched from EDSM

**Case history**
- Previous cases for the client, on each case window — matched on both `client`
  and `clientNick`, since the two disagree on roughly a quarter of rescues
- Only closed rescues count as history; the case on screen never lists itself
- Every row expands to the full API record, the case log, and a paperwork link
- **Menu → Case search** searches the whole archive by client, system, rat,
  platform, status, outcome, date range or code red
- A client is free text with no account behind it, so a name match is possible
  history rather than a confirmed identity, and is labelled as such

**Rat Tracking**
- Rat progress bar (FR / WR / BC / FUEL) with cascade logic
- IRC nick learning via MechaSqueak relay messages
- Nearest station badge per case
- Pinned jump calls panel in each case window

**Your Accounts (Rat Mode)**
- Commanders are picked up from the game journal on first open, with their last system and current ship
- Position follows the journal while you play — no EDSM account, API key, or public profile needed
- Jump estimates per case via Spansh, using short and long range EDSY builds per account

**Alerts**
- Windows notification and/or sound when a case comes in, both off until switched on
- Selectable per platform, with PC split into Odyssey / Horizons / Legacy

**Quick Messages**
- Fully customizable button groups — add, remove, and reorder top-level groups
- Platform variants, weighted random variants, and keepOpen popovers
- Message Editor with JSON export/import and bullet point toggle

**Translation**
- Incoming messages in other languages are automatically translated in-line using MechaSqueak[BOT] auto translation - See <a href=https://confluence.fuelrats.com/spaces/FRKB/pages/439648258/Machine+Translation+with+MechaSqueak#MachineTranslationwithMechaSqueak-ReceivingLiveTranslationsofClientMessages>Receiving Live Translations</a> for more info
- WIP - Incoming message can also be translated using DeepL - DeepL account required

**IRC Bridge**
- WebSocket IRC bridge with auto-connect and persistent URL
- Nick change detection and deduplication
- AdiIRC and HexChat script support (see `scripts/IRC/`)
- Optional `fr-dispatch://` protocol handler for one-click bridge launch
- Optional LAN bind so another machine on the same network can open the board
  (Menu → Allow LAN access; the IRC client stays on this PC)

---

## Changelog

Release history lives in [CHANGELOG.md](CHANGELOG.md).

### LAN access

Off by default. **Menu → Allow LAN access** rebinds the board, the IRC
WebSocket and the proxy onto all interfaces so another machine on the same
network can open the page.

AdiIRC and HexChat are unchanged: they still listen on this computer
(`127.0.0.1:12346`). FRBoard.exe is the relay — a browser on the other
machine talks to it, and it talks to the IRC client here. You do not need to
install anything on the other machine, and you should not move the IRC client
there.

The menu shows an address like `http://192.168.x.x:5173` once it is on. Windows
Firewall may prompt, or silently block ports `5173`, `8080` and `8081`.

FuelRats sign-in is registered for `http://localhost:5173/callback`. A
browser on another machine is sent there after authorising — that machine's
localhost, not this board. Copy the address from the failed tab (the token is
still in it) and paste it on the login page. Safari used to swallow the Sign
in click entirely: `crypto.randomUUID()` is not allowed on `http://` LAN
addresses.
