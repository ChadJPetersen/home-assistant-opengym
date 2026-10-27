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


## nginx and reverse-proxy setup

**For a normal Home Assistant app install, no nginx changes are needed.** This app uses Home Assistant **Ingress**: Supervisor serves openGym under Home Assistant's session-specific \`/api/hassio_ingress/…/\` path and routes it internally to nginx on port **8099**. You do **not** need to:

- create an nginx location for \`/opengym\`, \`/gym\` or \`/api/hassio_ingress\`;
- expose, port-forward or reverse-proxy the openGym container's port 8099;
- modify Home Assistant's built-in nginx routing, or set an openGym \`BASE_PATH\`.

Set \`origin\` to your Home Assistant **browser origin** (e.g. \`https://ha.example.com\`, **without** a path or trailing slash), not the Ingress URL.

### If Home Assistant itself is already behind nginx / NGINX Proxy Manager

Keep proxying the **entire Home Assistant site** to Home Assistant's port **8123**. Your existing proxy must:

1. **Preserve the full request path** and query string, including \`/api/hassio_ingress/…\`. Do not strip or rewrite Ingress URLs.
2. **Support WebSockets** (HTTP/1.1, \`Upgrade\` and \`Connection\` headers).
3. **Forward the original Host and HTTPS scheme** via \`Host\` and \`X-Forwarded-Proto\`.
4. **Allow large request bodies** if you upload custom exercise videos/photos. \`client_max_body_size 48m;\` is a practical setting (openGym's default video limit is 40 MiB). Home Assistant Ingress streaming is enabled in the app.

In Home Assistant's **Settings → System → Network → HTTP server**, configure **Trust X-Forwarded-For** and **Trusted proxies** for your actual reverse-proxy IP/address if you're using a traditional reverse proxy. These settings are **not** needed for Home Assistant Cloud/Nabu Casa alone. Do not trust an entire LAN unless necessary.

Example **external nginx** proxy location (inside the existing HTTPS Home Assistant \`server\` block):

\`\`\`nginx
# Preserve the original path, including /api/hassio_ingress/...
client_max_body_size 48m;

location / {
    proxy_pass http://HOME_ASSISTANT_IP:8123;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
}
\`\`\`

Replace \`HOME_ASSISTANT_IP\` with the address your nginx host uses to reach Home Assistant. This snippet **does not** configure HTTPS certificates, DNS, firewalls, or a complete nginx server. Use it only if you already maintain an external nginx reverse proxy.

**NGINX Proxy Manager:** continue using the **existing Home Assistant Proxy Host** (not a new openGym host), enable **Websockets Support**, and set \`client_max_body_size 48m;\` in its advanced settings *if needed for uploads*.

**No external nginx?** Skip all of this section and install the app normally.

More explanation and troubleshooting: [nginx and Home Assistant Ingress](opengym/DOCS.md#nginx-and-home-assistant-ingress).

### Important limitations

Home Assistant Ingress handles authentication **to the app**, but openGym still requires its own local profile for per-person workout data and AI Coach administration. A Home Assistant user identity is not automatically mapped to an openGym account.

The app's web interface works via the Home Assistant Ingress path. **The standalone openGym Android/iOS mobile app cannot pair using a Home Assistant Ingress URL** because the mobile app has no Home Assistant session or permanent reachable API URL. For mobile pairing, use an independently secured direct HTTPS deployment.

An openGym session cookie is scoped to the Home Assistant host, so use a trusted Home Assistant origin. The required `origin` setting is a single origin: if you open Home Assistant from another hostname, origin-checked writes may fail.

This project is experimental until its complete Home Assistant Supervisor installation is tested. For source and upstream acknowledgments see [openGym](https://github.com/DuarteSantos8/openGym) (AGPL-3.0-or-later).
