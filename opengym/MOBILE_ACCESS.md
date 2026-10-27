# Connect the official openGym phone app to Home Assistant

Version **1.4.3-7** adds an optional **API-only** port to the Home Assistant
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
2. Update to `1.4.3-7` using **Settings → Apps → App Store → ⋮ →
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

The iOS app uses `Origin: capacitor://localhost` instead. If the response
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
