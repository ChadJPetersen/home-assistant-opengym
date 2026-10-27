# Installation and configuration

## Add as a custom repository

Install from `https://github.com/ChadJPetersen/home-assistant-opengym` using **Settings → Apps → App Store → ⋮ → Repositories**.

Configure `origin` to exactly the origin in your browser address bar when you use Home Assistant. Examples:

- `https://home.example.com`
- `http://homeassistant.local:8123`

Do not specify the dynamic `/api/hassio_ingress/...` path. The app runs through Supervisor's ingress router. It does not expose port 8099 on the host.

## Accounts and administration

Password login is enabled by default, since WebAuthn/passkeys are unreliable inside an embedded iframe. Create the **first** openGym account yourself, immediately after starting the application. First-user admin is enabled; the first user becomes admin. Home Assistant's own sign-in does **not** automatically create or authenticate an openGym account. For added security you can disable guest mode (the default).

## Home Assistant workout sensors

The integration can publish automatically discovered **MQTT sensors**, but publishing is **disabled by default** for privacy. This feature reads the selected user's local `/data/opengym/state-<account-id>.json` file and publishes only summary numbers, never raw exercise details or credentials.

### Required setup

1. Install a MQTT broker, typically the **Mosquitto Broker** Home Assistant app.
2. Set up the **MQTT integration** in Home Assistant under **Settings → Devices & services**, and leave MQTT discovery enabled.
3. In the openGym app's Configuration tab, turn on `home_assistant_sensors`.
4. If there is more than one openGym account, set `ha_profile_id` to your **openGym account ID** (find it under openGym **Settings → Account**). Blank chooses the sole active account.
5. Set `ha_timezone` to your local IANA timezone (such as `America/Denver` or `Europe/London`).
6. Save, restart openGym, and look for the **openGym** device in **Settings → Devices & services → MQTT**.

The app receives broker credentials automatically through Home Assistant Supervisor's optional MQTT service discovery. You do not need to open any extra HTTP ports or modify your nginx proxy. The app runs normally without an MQTT broker; these optional sensors remain unavailable.

### Sensor settings

| Option | Default | Description |
| --- | --- | --- |
| `home_assistant_sensors` | `false` | Master opt-in to publish Home Assistant entities over MQTT. |
| `ha_profile_id` | empty | User ID to share. Blank auto-selects only if exactly one active openGym account exists. |
| `ha_include_bodyweight` | `false` | Additional privacy opt-in for the latest logged body weight. Requires kg/lb recorded in the profile. |
| `ha_timezone` | `UTC` | IANA timezone used to calculate today, days since last workout, and rolling seven-day calendar window. |
| `ha_poll_seconds` | `120` | Refresh frequency (30–3600 seconds). It does not alter openGym's own synchronization. |

### Entities

| Home Assistant entity | Notes |
| --- | --- |
| Total workouts | All saved completed sessions up to the current date |
| Workouts (7 days) | Sessions in the last seven local dates (including today) |
| Completed work sets (7 days) | Only sets marked complete, excluding warm-ups, counting per-side sets as one row |
| Workout completed today | Binary sensor based on local calendar date |
| Last workout date | ISO `YYYY-MM-DD` when data exists |
| Days since last workout | Local calendar days, not exact elapsed hours |
| Last workout duration | Based on saved start/end time; unavailable if missing or implausible |
| Saved routines | Count of routines in the saved profile |
| Latest body weight | Only created with `ha_include_bodyweight: true` and valid units |

These are **summary/activity** metrics, not medical measurements or proof that a planned workout happened. If there is no valid profile or its state cannot be read, the device is marked unavailable instead of publishing invented zeros.

### Example Home Assistant automation

Once your MQTT device is discovered, you can create an automation such as **“Switch on gym-prep lighting when today's workout becomes complete”** using the **Workout completed today** binary sensor. Discover the entity ID in Home Assistant first; it may differ depending on other integrations and devices.

### Privacy, retention and disabling

Publishing uses retained MQTT discovery/state topics so entities can recover after Home Assistant restarts. The bridge uses a persistent installation identifier; IDs remain stable through an app update. It does **not** send names, email addresses, credentials, per-set loads, photos, or exercise notes.

Home Assistant's Recorder can retain workout sensor history. Body weight is separately opt-in because it is more personal. When you turn off `home_assistant_sensors` and restart the app, the bridge attempts to clear its retained MQTT topics. **This does not remove Home Assistant Recorder history**. To delete previously stored history you must manage Recorder retention/purging separately.

If MQTT is down when sensors are disabled, cleanup is delayed until the broker returns. Do not assume that turning off a setting immediately erases messages from a disconnected broker.

### Troubleshooting

- **No sensors appear:** confirm Mosquitto (or another Supervisor-discoverable broker) is running and the **MQTT integration** is configured, that the publishing option is true, and inspect openGym app logs for `[HA sensors]`.
- **Account ID error:** with multiple active accounts, set `ha_profile_id` explicitly to the ID of the account whose history you want in Home Assistant.
- **Workout counts are wrong by one near midnight:** verify `ha_timezone` matches your training calendar's IANA timezone.
- **Body weight missing:** it is off by default, requires at least one logged weigh-in and kg/lb units, and is removed from MQTT discovery when disabled.
- **Numbers aren't instant:** publication occurs every `ha_poll_seconds` after openGym has synced the saved profile to its server.
- **Old entities after turning sensors off:** restart the app while the broker is online so retained discovery configuration can be cleaned up; Recorder history requires separate deletion.

## AI Coach

The bundled default API image supports standard API-based model providers (OpenAI, Anthropic, Gemini, OpenAI-compatible / Ollama). Enable it from **Settings → Account → Admin dashboard → AI Coach** after making your account. Extra native agent runtimes (Codex CLI and Claude Agent SDK) are not bundled; those require the upstream coach build target.

For local Ollama on another device, the app backend must be able to reach that device over the network. Do not accidentally expose an unauthenticated Ollama endpoint to the public Internet.

## Backups / restore

All server-side data including logins, signing secret, workout states and uploaded custom exercise media lives at `/data/opengym`. Home Assistant's cold app backups include this directory. Before upgrading, create a backup. Restore with the app stopped.

## Ingress and limitations

This deployment uses Home Assistant Ingress with a changing internal path prefix. openGym assets are relative and its API base derives from its current browser pathname. The Home Assistant proxy removes that prefix and the bundled nginx handles the resulting `/api/` and asset requests.

WebAuthn may not work due to iframe limitations; use password login. Standalone openGym mobile pairing cannot normally work through Home Assistant Ingress, because the standalone app has no Home Assistant session. If you need mobile pairing, deploy openGym on an external stable HTTPS address with separate authentication.

If Home Assistant is opened from a different origin than the configured `origin`, API calls may be blocked by upstream origin validation. Use a consistent hostname.

This integration is experimental and is not independently reviewed for medical privacy requirements. Do not make a public service out of the ingress URL.

## Troubleshooting

- **Blank page:** clear the browser cache, then check app logs and that your Home Assistant ingress path is proxying the frontend.
- **Login or changes refused:** confirm `origin` exactly matches your Home Assistant origin, including port.
- **504 from AI Coach:** inspect app logs and external provider connectivity.
- **Mobile app can't connect:** use a separate, securely exposed openGym deployment, not this Ingress-only server.


## nginx and Home Assistant Ingress

### Standard installation: no nginx changes

**You do not need to edit any nginx configuration to use this app in Home Assistant.** Ingress handles the app's session-specific `/api/hassio_ingress/…/` route, forwards it to the app's **internal** port 8099, and removes the dynamic prefix before the app receives the request. The app's bundled nginx then forwards `/api/*` to its Node.js API on port 3000. The `/api/hassio_ingress/…/` URL is not a permanent public API endpoint; do not copy it into `origin`.

No extra `location` rule, host-port exposure, custom subpath, or `BASE_PATH` option is necessary. Home Assistant's Ingress frontend is used instead of a dedicated domain.

### If your Home Assistant already uses an external nginx reverse proxy

Continue proxying the *whole Home Assistant site* to Home Assistant's port 8123. There is **no separate openGym Proxy Host**. Your external proxy should:

1. Pass URLs through unchanged: in particular, preserve `/api/hassio_ingress/…/` and its query string.
2. Support WebSockets and HTTP/1.1 forwarding.
3. Preserve `Host` and the original request scheme (`X-Forwarded-Proto`) so Home Assistant and openGym use the same origin.
4. Allow up to 48 MiB request bodies if you want to use openGym's custom exercise video uploads, plus sufficient upload/request timeouts.

Example for **an existing HTTPS nginx Home Assistant server block**:

```nginx
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

Replace `HOME_ASSISTANT_IP` with the IP/hostname reachable *from your nginx server*. This is only a location snippet; it does not include TLS certificates, firewall rules, or the enclosing `server { }`.

For **NGINX Proxy Manager**, configure the existing Home Assistant Proxy Host, enable **Websockets Support**, and, if you need media uploads, place `client_max_body_size 48m;` in its Advanced configuration. No custom location for openGym is required.

For **Home Assistant behind a traditional reverse proxy**, Home Assistant may also need `use_x_forwarded_for: true` and `trusted_proxies` configured under `http:` in Home Assistant's `configuration.yaml`; only include the IP(s) of trusted reverse proxies, not arbitrary clients. These settings are irrelevant to a plain local setup or Home Assistant Cloud by itself.

### Troubleshooting proxy errors

- **404 under the openGym sidebar:** make sure `/api/hassio_ingress/…` is not being stripped or redirected by the external proxy.
- **WebSocket failures:** enable WebSockets and verify the Upgrade and Connection forwarding headers.
- **413 Request Entity Too Large:** raise the external proxy body size limit; the app's own nginx already allows larger custom-exercise media.
- **Origin mismatch / inability to save:** set `origin` to the exact Home Assistant site origin you used to open the app, with no path/trailing slash, and restart.
- **Standalone mobile app can't pair:** the mobile app can't reuse Home Assistant's session-specific Ingress URL; a separate stable and secured endpoint is required.

