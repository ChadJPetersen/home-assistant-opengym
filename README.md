# openGym for Home Assistant

Self-host [openGym](https://github.com/DuarteSantos8/openGym) inside Home Assistant using **Ingress**. Run the web UI and Node.js API inside one Supervisor-managed app, without exposing an additional host port.

> **Status:** Experimental. This is an independently maintained Home Assistant wrapper, not an official openGym or Home Assistant app.

## Features

- Home Assistant Ingress sidebar panel (automatic subpath routing, no dedicated hostname)
- Single container bundling pinned upstream API, web UI and exercise media
- Workout history, custom exercise media, progress photos and accounts preserved in `/data/opengym` and covered by Home Assistant cold backups
- Password sign-in (recommended under Home Assistant's iframe; passkeys/WebAuthn aren't supported reliably there)
- AI Coach via OpenAI, Gemini, Anthropic and OpenAI-compatible/Ollama providers using upstream's standard API image (additional Codex/Claude agent executables are **not** bundled)
- First-account admin, configurable guest mode, session lifetime, upload quota and AI kill switch
- Health checks, restricted Ingress listener, CI validation, build smoke test and upstream release monitoring

## Install

1. Home Assistant **Settings → Apps → App Store → ⋮ → Repositories**: add `https://github.com/ChadJPetersen/home-assistant-opengym`.
2. Install **openGym**, then set **origin** to the **exact origin** (scheme, host and optional port) you use to open Home Assistant, e.g. `https://ha.example.com` or `http://homeassistant.local:8123`. Do **not** add a path or trailing slash.
3. Start openGym. Under **Open Web UI**, create your account **first**: the first account becomes the openGym admin.
4. In Settings → Account → Admin dashboard, configure AI Coach (optional).

For full installation, troubleshooting and security considerations see [DOCS.md](opengym/DOCS.md).

### Important limitations

Home Assistant Ingress handles authentication **to the app**, but openGym still requires its own local profile for per-person workout data and AI Coach administration. A Home Assistant user identity is not automatically mapped to an openGym account.

The app's web interface works via the Home Assistant Ingress path. **The standalone openGym Android/iOS mobile app cannot pair using a Home Assistant Ingress URL** because the mobile app has no Home Assistant session or permanent reachable API URL. For mobile pairing, use an independently secured direct HTTPS deployment.

An openGym session cookie is scoped to the Home Assistant host, so use a trusted Home Assistant origin. The required `origin` setting is a single origin: if you open Home Assistant from another hostname, origin-checked writes may fail.

This project is experimental until its complete Home Assistant Supervisor installation is tested. For source and upstream acknowledgments see [openGym](https://github.com/DuarteSantos8/openGym) (AGPL-3.0-or-later).
