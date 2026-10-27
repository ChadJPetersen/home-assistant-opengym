# openGym for Home Assistant

Self-host [openGym](https://github.com/DuarteSantos8/openGym) inside Home Assistant using **Ingress**. Run the web UI and Node.js API inside one Supervisor-managed app, without exposing an additional host port.

> **Status:** Experimental. This is an independently maintained Home Assistant wrapper, not an official openGym or Home Assistant app.

## Features

- Home Assistant Ingress sidebar panel (automatic subpath routing, no dedicated hostname)
- Single container bundling pinned upstream API, web UI and exercise media
- Workout history, custom exercise media, progress photos and accounts preserved in `/data/opengym` and covered by Home Assistant cold backups
- Password sign-in with best-effort passkey/WebAuthn support when Home Assistant uses HTTPS (iframe/browser restrictions may still apply)
- AI Coach via OpenAI, Gemini, Anthropic and OpenAI-compatible/Ollama providers using upstream's standard API image (additional Codex/Claude agent executables are **not** bundled)
- First-account admin, configurable guest mode, session lifetime, upload quota and AI kill switch
- Health checks, restricted Ingress listener, CI validation, build smoke test and upstream release monitoring

## Install

1. Home Assistant **Settings → Apps → App Store → ⋮ → Repositories**: add `https://github.com/ChadJPetersen/home-assistant-opengym`.
2. Install **openGym**, then set **origin** to the **exact origin** (scheme, host and optional port) you use to open Home Assistant, e.g. `https://ha.example.com` or `http://homeassistant.local:8123`. Do **not** add a path or trailing slash.
3. Start openGym. Under **Open Web UI**, create your account **first**: the first account becomes the openGym admin.
4. In Settings → Account → Admin dashboard, configure AI Coach (optional).

For full installation, troubleshooting and security considerations see [DOCS.md](opengym/DOCS.md).


## Home Assistant workout sensors (optional)

The app can publish **MQTT-discovered Home Assistant sensor entities** from your saved openGym workout history. Sensors are **off by default**: your personal training data is not automatically shared with Home Assistant.

**Requires:** a working MQTT broker (for example, the Mosquitto Broker Home Assistant app) and the Home Assistant **MQTT integration** configured under **Settings → Devices & services**. Supervisor supplies broker connection details to openGym automatically: no MQTT passwords need to be entered in openGym options. This works entirely inside your local Home Assistant environment; it does not expose the openGym API.

In the openGym app's Configuration tab, set:

```yaml
home_assistant_sensors: true
ha_include_bodyweight: false  # separate, sensitive-data opt-in
ha_timezone: "America/Denver" # set to your actual IANA timezone
ha_poll_seconds: 120
```

After saving and restarting the app, look for **one openGym MQTT device per active account**, such as **openGym · Vivien** and **openGym · Guest**, under **Settings → Devices & services → MQTT**. Each device has its own entities:

| Entity | What it reports |
| --- | --- |
| Total workouts | Number of completed sessions in saved history |
| Workouts (7 days) | Completed sessions during the most recent 7 local calendar days, including today |
| Completed work sets (7 days) | Completed sets (warm-ups excluded); each per-side row counts once |
| Workout completed today | Binary sensor: on when a completed session is logged for the current local date |
| Last workout date | Latest completed workout's local date |
| Days since last workout | Calendar days since the latest completed session |
| Last workout duration | Minutes between the saved start/end timestamps, when available |
| Saved routines | Number of stored routines |
| Latest body weight | **Optional**; requires `ha_include_bodyweight: true` and a saved weight in kg or lb |

The bridge automatically creates **separate entities for every active openGym profile**; it never combines users’ workout data. Only enable this with the consent of everyone on the openGym server. MQTT device names include each openGym profile name, while MQTT topics use anonymized, stable identifiers. Exercise notes, account credentials, photo/media contents, individual exercise names, and raw sets are not published.

**Privacy warning:** MQTT retains each sensor's last value, and Home Assistant Recorder may preserve historical values. Enable this only on a trusted Home Assistant instance with a trusted MQTT broker. Even workout counts can reveal activity patterns; body weight is deliberately off by default. Turning off `home_assistant_sensors` and restarting the app attempts to remove its retained MQTT discovery/state messages. Home Assistant's already-recorded history is **not deleted**. To remove historic data, use Home Assistant's Recorder/purge procedures separately.

Without a broker, workout tracking and the AI Coach still work normally; the optional sensors simply don't become available. The bridge retries the broker and logs its connectivity status. For details and troubleshooting, see [Sensor documentation](opengym/DOCS.md#home-assistant-workout-sensors).

## nginx and reverse-proxy setup

**For a normal Home Assistant app install, no nginx changes are needed.** This app uses Home Assistant **Ingress**: Supervisor serves openGym under Home Assistant's session-specific `/api/hassio_ingress/…/` path and routes it internally to nginx on port **8099**. You do **not** need to:

- create an nginx location for `/opengym`, `/gym` or `/api/hassio_ingress`;
- expose, port-forward or reverse-proxy the openGym container's port 8099;
- modify Home Assistant's built-in nginx routing, or set an openGym `BASE_PATH`.

Set `origin` to your Home Assistant **browser origin** (e.g. `https://ha.example.com`, **without** a path or trailing slash), not the Ingress URL.

### If Home Assistant itself is already behind nginx / NGINX Proxy Manager

Keep proxying the **entire Home Assistant site** to Home Assistant's port **8123**. Your existing proxy must:

1. **Preserve the full request path** and query string, including `/api/hassio_ingress/…`. Do not strip or rewrite Ingress URLs.
2. **Support WebSockets** (HTTP/1.1, `Upgrade` and `Connection` headers).
3. **Forward the original Host and HTTPS scheme** via `Host` and `X-Forwarded-Proto`.
4. **Allow large request bodies** if you upload custom exercise videos/photos. `client_max_body_size 48m;` is a practical setting (openGym's default video limit is 40 MiB). Home Assistant Ingress streaming is enabled in the app.

In Home Assistant's **Settings → System → Network → HTTP server**, configure **Trust X-Forwarded-For** and **Trusted proxies** for your actual reverse-proxy IP/address if you're using a traditional reverse proxy. These settings are **not** needed for Home Assistant Cloud/Nabu Casa alone. Do not trust an entire LAN unless necessary.

Example **external nginx** proxy location (inside the existing HTTPS Home Assistant `server` block):

```nginx
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
```

Replace `HOME_ASSISTANT_IP` with the address your nginx host uses to reach Home Assistant. This snippet **does not** configure HTTPS certificates, DNS, firewalls, or a complete nginx server. Use it only if you already maintain an external nginx reverse proxy.

**NGINX Proxy Manager:** continue using the **existing Home Assistant Proxy Host** (not a new openGym host), enable **Websockets Support**, and set `client_max_body_size 48m;` in its advanced settings *if needed for uploads*.

**No external nginx?** Skip all of this section and install the app normally.

More explanation and troubleshooting: [nginx and Home Assistant Ingress](opengym/DOCS.md#nginx-and-home-assistant-ingress).

### Important limitations

Home Assistant Ingress handles authentication **to the app**, but openGym still requires its own local profile for per-person workout data and AI Coach administration. A Home Assistant user identity is not automatically mapped to an openGym account.

The app's web interface works via the Home Assistant Ingress path. **The standalone openGym Android/iOS mobile app cannot pair using a Home Assistant Ingress URL** because the mobile app has no Home Assistant session or permanent reachable API URL. For mobile pairing, use an independently secured direct HTTPS deployment.

An openGym session cookie is scoped to the Home Assistant host, so use a trusted Home Assistant origin. The required `origin` setting is a single origin: if you open Home Assistant from another hostname, origin-checked writes may fail.

This project is experimental until its complete Home Assistant Supervisor installation is tested. For source and upstream acknowledgments see [openGym](https://github.com/DuarteSantos8/openGym) (AGPL-3.0-or-later).

## Passkeys on HTTPS (experimental)

openGym supports passkeys through WebAuthn. For an attempt within Home Assistant Ingress, set `origin` to the exact **HTTPS** Home Assistant address (for example `https://ha.example.com`) and always launch openGym through that same hostname. The included nginx advertises `publickey-credentials-create=(self)` and `publickey-credentials-get=(self)` to permit same-origin WebAuthn where the browser/embedding Home Assistant frontend allows it.

This is **best-effort**, not guaranteed. Ingress is embedded in an iframe; a cross-origin frame cannot make passkeys work just by setting its own headers. Browser support and parent iframe permissions matter. Leave `password_login: true` until you have *both* registered and successfully used a passkey. Plain `http://homeassistant.local:8123` and LAN-IP HTTP generally cannot use passkeys; HTTPS or localhost is required. See [full notes](opengym/DOCS.md#passkeys-and-https).

## Monthly Home Assistant compatibility agent

A scheduled Codex agent reviews relevant Home Assistant **Supervisor, Core, and app developer documentation** on the **3rd of each month**. When it finds an actionable change, it edits a sandboxed checkout and **opens a pull request** for review; it never automatically merges or deploys. When nothing needs changing, it leaves the repo alone. The existing CI validates proposed changes.

**Required one-time setup:** In this repository open **Settings → Secrets and variables → Actions → New repository secret**, and create `OPENAI_API_KEY` with an OpenAI API platform key (this is not included with a ChatGPT subscription). Then, under **Settings → Actions → General**, permit GitHub Actions to create pull requests. Without the key the scheduled workflow skips AI edits; without PR permission the proposal job can succeed but opening the PR will fail. You can manually run it under **Actions → Monthly Home Assistant compatibility agent → Run workflow**. API use may incur charges. [Workflow definition](.github/workflows/monthly-home-assistant-agent.yml).

## App branding

`opengym/icon.png` and `opengym/logo.png` use the upstream openGym barbell mark from [openGym's SVG icon](https://github.com/DuarteSantos8/openGym/blob/main/frontend/resources/icon.svg). The Home Assistant app store uses these assets in its installed-app list and details page.
