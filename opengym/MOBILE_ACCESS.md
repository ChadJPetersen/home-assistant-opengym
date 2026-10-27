# Connect the official openGym phone app to Home Assistant

Version **1.4.3-7** introduced an optional **API-only** port to the Home Assistant
openGym wrapper. It uses the **same** openGym API, persistent account database,
workout history, routines, and AI Coach as the existing Ingress web UI.
No separate openGym installation or database is required.

## Security model

- Home Assistant's browser UI remains on Ingress port `8099`.
- An additional nginx listener runs on container port `8100`, forwarding
  only `/api/*` to the existing authenticated openGym backend. Other paths
  return 404, so this is **not** a second public browser UI.
- Home Assistant Supervisor sets `8100/tcp: null` by default, meaning
  **no host port is published** until you deliberately enable one under the
  app's **Configuration → Network** settings.
- **Home Assistant login does NOT protect port 8100.** Authentication to
  openGym is performed using its own login endpoints, one-time mobile
  pairing code and bearer session tokens. Anyone who can connect to the
  port can reach the openGym public API endpoints, including login.

**Never port-forward unencrypted TCP 8100 directly to the internet.**
The listener speaks plain HTTP. Terminate TLS through a trusted HTTPS reverse
proxy, or keep access on a trusted private VPN. Enabling the port on a LAN
makes it reachable on that LAN, so consider firewall restrictions. This
feature is opt-in and experimental.

## Step 1: Update and back up

1. Back up openGym through Home Assistant before changing access settings.
2. Update to `1.4.3-8` using **Settings → Apps → App Store → ⋮ →
   Check for updates**, then **Update** on the openGym app page.
3. Verify the normal Home Assistant Ingress interface still works.
4. Leave `origin` configured as your exact **Home Assistant web address**,
   **not** the new mobile API hostname.

## Step 2: Configure an HTTPS endpoint for the phone

Set up a hostname such as `https://gym.example.com` using your existing
TLS reverse proxy (nginx, NGINX Proxy Manager, Caddy, or similar). It should
forward `https://gym.example.com/*` to
`http://YOUR_HOME_ASSISTANT_LAN_IP:8100/*`, preserving paths and query
strings. This is a **separate proxy host** from your Home Assistant site.

1. Configure a valid TLS certificate and enforce HTTPS on the external
   `gym.example.com` address.
2. In **Settings → Apps → openGym → Configuration → Network**, set
   `8100/tcp` to host port `8100`; **save/restart the app**. Do this
   only when you trust the host network and TLS proxy setup.
3. Point the proxy's upstream host at your **Home Assistant machine's LAN
   IP**, port `8100`, with upstream protocol `http`. If using NGINX
   Proxy Manager, create a new *Proxy Host* for `gym.example.com` and
   enable *Force SSL* in its SSL tab.
4. Avoid SSO/forward-auth, Cloudflare Access browser prompts, and HTTP
   Basic Auth on `/api/*`. Those interrupt native pairing.
5. Do **not** rewrite `/api/`, inject CORS headers or intercept OPTIONS
   preflights. openGym implements its own API authentication and CORS.
6. For exercise media upload, permit requests up to 48 MiB and configure
   reasonable proxy timeouts. Do not open a second router port-forward to
   unencrypted TCP 8100; only expose your TLS entry point.
7. If practical, firewall port 8100 to allow the reverse proxy and trusted
   local devices only.

If you prefer a **private VPN** (e.g. Tailscale), you can reach the host's
mapped 8100 port over the VPN. Use TLS even over the VPN when possible.
The official Android app can accept a manually entered LAN `http://` URL,
but that transport is not encrypted; do not use it on untrusted networks.

### Standard nginx: new virtual host (copy/paste example)

**Do not change nginx *inside* the openGym app** or your existing Home
Assistant reverse-proxy block. The web UI still uses the HA ingress route.
Add a **second** virtual host for the mobile API only.

1. Use a DNS hostname such as `gym.example.com` pointing to your existing
   HTTPS reverse proxy. Ensure you have a valid TLS certificate for this name.
   If you use an existing wildcard certificate, you can reuse it here.
2. Confirm openGym is updated to **1.4.3-8**; take an app backup. Under
   **Settings → Apps → openGym → Configuration → Network**, set the
   `8100/tcp` mapping to host port `8100`. Save and restart the app.
   *Do not enable the port until your proxy/network restrictions are ready.*
3. Download/copy [the complete nginx example](../examples/nginx/opengym-mobile.conf.example)
   onto the **nginx proxy machine**, e.g. as
   `/etc/nginx/sites-available/opengym-mobile.conf` (Debian/Ubuntu).
   Replace:
   - `gym.example.com` with **your mobile API hostname**, not the HA hostname;
   - `192.0.2.10` with the Home Assistant host's **LAN IP**;
   - the two `ssl_certificate` paths with your actual cert/key paths.
4. On an nginx install that uses `sites-enabled`, enable the new site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/opengym-mobile.conf \
       /etc/nginx/sites-enabled/opengym-mobile.conf
   ```
   Use `/etc/nginx/conf.d/opengym-mobile.conf` directly instead on
   installations that include `conf.d/*.conf`. Do **not** create both copies,
   and confirm the file is loaded by your main `nginx.conf`.
5. Validate **before** reloading and preserve the working HA proxy if it
   reports errors:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```
   Run the second command only if the first succeeds. If nginx runs inside
   a container, execute `nginx -t` and `nginx -s reload` *inside the
   nginx container* rather than using systemctl.
6. Verify `https://gym.example.com/api/health` returns JSON and `/`
   returns HTTP 404, then follow the CORS and pairing checks below.

**Important:** A valid HTTPS certificate must be provisioned **before**
nginx will successfully load the `listen 443 ssl` block. If your reverse
proxy already terminates HTTPS for other services, add this as another
hostname on that proxy; do **not** modify Home Assistant's `8123`
upstream. The example includes a redirect from port 80 to HTTPS, but
certificate issuance itself depends on your proxy/DNS/ACME arrangement.
For any remote-access hostname, also apply firewall controls and keep the
openGym API updated. The API endpoints remain publicly reachable to
unauthenticated clients for pairing/login, by design, even with HTTPS.

### NGINX Proxy Manager: a second Proxy Host

If you manage nginx through **NGINX Proxy Manager (NPM)**, don't copy the
traditional nginx `server { }` example into its **Advanced** box.
Instead, open NPM → **Hosts → Proxy Hosts → Add Proxy Host** and set:

| Field | Value |
| --- | --- |
| Domain Names | `gym.example.com` (replace with your hostname) |
| Scheme | `http` |
| Forward Hostname / IP | The Home Assistant **host's LAN IP**, not `homeassistant.local` from the app container |
| Forward Port | `8100` |
| Block Common Exploits | Enable if it does not interfere with API requests |
| Websockets Support | Optional; the mobile pairing API uses ordinary HTTP requests |

Under the **SSL** tab select/request a valid certificate, enable
**Force SSL**, and save. NPM itself will forward requests including
`/api/...`. Only expose the NPM HTTPS entry point, not the raw 8100
port, to untrusted networks.

For video uploads, the NPM proxy host's **Advanced** section can contain
only this additional directive:

```nginx
client_max_body_size 48m;
```

**Do not** paste a complete `server { }` block there, add duplicate
`Access-Control-Allow-Origin` headers, add an `OPTIONS` handler, or
route the mobile hostname to Home Assistant port `8123`: the official
app's requests must reach openGym port `8100` directly through HTTPS.

### Keep existing Home Assistant nginx configuration untouched

Your current `https://ha.example.com` virtual host should still proxy
to Home Assistant on `8123` (including all `/api/hassio_ingress/...`
routes). The mobile hostname is **another server/vhost** that proxies
only `/api/` to port `8100`. Do not create a `/gym` subpath inside
the existing Home Assistant site: the official phone app expects a stable
server URL and needs to make `/api/` requests without the HA session.

Network and API transport:

| Flow | Address / port | Authentication |
| --- | --- | --- |
| Browser → HA | `https://ha.example.com` → `8123` → ingress `8099` | Home Assistant + openGym |
| Phone → proxy | `https://gym.example.com` → `8100` → openGym API `3000` | openGym pairing token |
| Raw host port (opt-in) | `http://HOME_ASSISTANT_IP:8100` | openGym only; **no TLS** |

The separate host port can be reached over your LAN while enabled. Limit
network access to your nginx machine and trusted devices where your
firewall permits it. **Never forward raw TCP 8100 from the public
internet.**

### Test before pairing

From a device able to reach your HTTPS endpoint:

```bash
curl -i https://gym.example.com/api/health
# Expected: 200 and JSON containing "ok":true

curl -i https://gym.example.com/
# Expected: 404 (the mobile endpoint intentionally does not serve HTML)

curl -si -X OPTIONS https://gym.example.com/api/pair/redeem \
  -H 'Origin: https://localhost' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization'
# Expected: 204 and Access-Control-Allow-Origin: https://localhost
```

The iOS app uses `Origin: capacitor://localhost` instead.

If `/api/health` returns 502/504, check that the external proxy can reach
`http://HOME_ASSISTANT_IP:8100/api/health` over its own network and that
the Home Assistant Network port mapping is actually enabled. If the proxy
can't resolve the hostname, check DNS; if TLS errors occur, check the
certificate before testing pairing. Avoid running a manual `nginx -t`
or reload inside the Home Assistant openGym container itself. If the response
is a redirect or an HTML login page, the proxy is interfering. If multiple
`Access-Control-Allow-Origin` headers appear, remove proxy-added CORS
headers. Do not point the phone at the HA Ingress launcher or its rotating
`/api/hassio_ingress/` session URL.

## Step 3: Pair the official openGym app

1. Open openGym **inside Home Assistant Ingress** and sign into your
   existing openGym account.
2. Under **Settings → Account → Pair the mobile app**, confirm with your
   openGym password or passkey and obtain the **one-time pairing code**
   (valid for about five minutes).
3. In the official Android/iOS openGym app, choose **Connect to my server**
   on first launch or under **Settings → Account**.
4. Enter your mobile API origin (e.g. `https://gym.example.com`, no
   `/api` suffix) and the one-time code.
5. Check that routines and workouts from your Home Assistant-hosted
   account appear on the phone. Record a test workout, sync, and ensure
   it appears in the Ingress web UI.

If you already have unsynced local-only phone workouts, **export a backup
first** and review any merge/replace prompt carefully. Pairing uses openGym
credentials, not your Home Assistant login.

## Step 4: Sync supported data to Google Fit via Health Connect

1. On Android, open official openGym **Settings → Health Connect**;
   grant the requested permissions and enable workout/weight export.
2. In Google Fit, enable its Health Connect integration and relevant
   read permissions (menu labels can differ by Android/Fit version).
3. Record a test workout in openGym and inspect Health Connect first,
   then Google Fit. Exported data depends on both apps' supported record
   types and granted permissions.

Health Connect is managed by the **Android app**, not Home Assistant
or the server. Home Assistant MQTT workout summaries are a separate feature.

## Troubleshooting / revocation

- Phone cannot connect: test your mapped host port, external HTTPS hostname,
  proxy upstream and `/api/health`; ensure CORS OPTIONS is not blocked.
- Wrong credentials: generate a fresh one-time code from the signed-in
  openGym account and use the exact API hostname.
- Privacy: disable `8100/tcp` in **Configuration → Network** and restart
  the app to close the host mapping. To revoke a previously paired phone,
  use openGym's account **Sign out everywhere** / session revocation.
- Keep the app's `origin` option set to the Home Assistant browser origin,
  **not** the phone's proxy hostname.

**Testing limits:** GitHub CI checks the Docker image, both nginx listeners,
the mobile `/api/health` endpoint, CORS, and 404 for mobile HTML paths.
Actual Supervisor host-port mapping, your HTTPS certificate/proxy, native
app pairing and Google Fit/Health Connect must be verified on your devices.

Upstream reference:
[openGym mobile pairing](https://github.com/DuarteSantos8/openGym/blob/main/docs/MOBILE.md),
[openGym self-hosting/CORS](https://github.com/DuarteSantos8/openGym/blob/main/docs/SELF_HOSTING.md).
