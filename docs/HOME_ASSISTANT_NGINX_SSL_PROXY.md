# Home Assistant NGINX SSL proxy app: same-hostname /opengym path

This configuration uses the **official Home Assistant app** named
**NGINX Home Assistant SSL proxy**, *not* NGINX Proxy Manager and *not* an
nginx installation in a separate Linux VM. It follows the same approach as
the existing OrcaSlicer location snippet.

The official Android/iOS openGym application accepts server URLs containing
a path. In upstream openGym v1.4.3, `normalizeServerUrl()` returns
`origin + pathname`, and the API client appends `/api/...`.
Therefore the URL `https://YOUR_HA_DOMAIN/opengym` is supported.

**Routing:** `https://YOUR_HA_DOMAIN/opengym/api/health` becomes
`http://3fa96add-opengym:8100/api/health`. The normal Home Assistant
`location /` and its Ingress sidebar remain unchanged.

## Installation

1. Install/update the Home Assistant openGym wrapper to **1.4.3-8 or later**,
   and back up openGym beforehand. Start it and check the browser Ingress
   page still opens. The API-only internal port `8100` exists even when
   the optional **Network → 8100/tcp host mapping is null**.
   **Leave that host mapping disabled** for this same-Home-Assistant-app setup.
2. In File Editor, Studio Code Server or the Samba share, create this file:

   `/share/nginx_proxy_default_opengym.conf`

   Copy the contents of
   [nginx_proxy_default_opengym.conf](../../examples/nginx/home-assistant-ssl-proxy/nginx_proxy_default_opengym.conf)
   into it. It is a **location snippet**, not a complete nginx vhost.
   Do **not** use `/share/nginx_proxy/opengym.conf` for this particular
   file: the `servers` folder is for separate `server {}` blocks, not
   additional paths within the default Home Assistant HTTPS host.
3. In **Settings → Apps → NGINX Home Assistant SSL proxy → Configuration**,
   set/confirm the following values, preserving other options:

   ```yaml
   customize:
     active: true
     default: nginx_proxy_default*.conf
     servers: nginx_proxy/*.conf
   ```

   This wildcard loads **all** matching files under `/share`, so it can
   coexist with your existing OrcaSlicer `nginx_proxy_default*.conf`
   snippets. Do not delete/replace the OrcaSlicer file.
4. Keep using the same valid HTTPS Home Assistant hostname and certificate.
   Do **not** add a new DNS hostname, `server {}` block, certificate,
   or public port. **Restart the NGINX Home Assistant SSL proxy app** from
   its Info tab, and review its Logs tab for `nginx: [emerg]` errors.
   If the app refuses to start, temporarily move the new `.conf` file
   out of `/share` (or disable custom config) and restart.
5. Test from a device that reaches your HTTPS Home Assistant hostname:

   ```bash
   curl -i https://YOUR_HA_DOMAIN/opengym/api/health
   # Expected: 200, JSON with "ok":true

   curl -i https://YOUR_HA_DOMAIN/opengym/
   # Expected: 404 — web UI is still available only through Ingress.

   curl -si -X OPTIONS https://YOUR_HA_DOMAIN/opengym/api/pair/redeem \
      -H 'Origin: https://localhost' \
      -H 'Access-Control-Request-Method: POST' \
      -H 'Access-Control-Request-Headers: content-type,authorization'
   # Expected: 204 with exactly one Access-Control-Allow-Origin: https://localhost
   ```

   The iOS WebView origin is `capacitor://localhost`. If you get 502/504
   from the first check, check that openGym is running and the internal
   hostname `3fa96add-opengym` is correct for your installed app.
   This hostname is the installed full slug with underscores converted
   to hyphens. If openGym was installed from a different repository, the
   prefix may differ. The actual installed app slug was
   `3fa96add_opengym` when this example was written.
6. In the existing openGym Ingress interface, sign in and go to
   **Settings → Account → Pair the mobile app**. Generate a one-time code.
   In the **official Android app**, choose **Connect to my server** and use:

   `https://YOUR_HA_DOMAIN/opengym`

   Enter the pairing code. Do **not** use `/opengym/api`,
   `/api/hassio_ingress/...`, or `/hassio/ingress/...` as the mobile
   app's base address.
7. In the official Android app, enable its **Health Connect** integration
   and grant permissions. Then enable compatible Health Connect sharing
   in Google Fit, and verify with a test workout.

## Security and troubleshooting

- The path is HTTPS at the external Home Assistant proxy, but it is a
  **direct route to the openGym API**, so **Home Assistant authentication
  does not apply**. The openGym API handles its own one-time pairing codes
  and bearer tokens. Login, registration and one-time-code redemption
  endpoints must be reachable before the phone is paired. Do not use this
  route on a hostname shared with untrusted clients unless you understand
  that this publishes openGym's login/pairing endpoints.
- No direct HTTP port-forwarding of `8100` is necessary or recommended.
  The apps communicate through Home Assistant's private Supervisor network.
  An NGINX app reload may be needed after an openGym app reinstall or
  container IP change if the upstream hostname's address was cached.
- If NGINX won't start and logs say `host not found in upstream`, check
  that openGym is **running**, then ensure the full slug (with hyphens
  instead of underscores) is correct. This same-hostname approach assumes
  both apps are on Home Assistant Supervisor's internal network.
- If NGINX logs `duplicate location`, your OrcaSlicer or another existing
  custom snippet may already define `/opengym`. Keep only one definition.
- If the browser returns the Home Assistant UI for
  `/opengym/api/health`, the file likely wasn't picked up by
  `customize.default`. Check its exact filename and location.
- If the phone app says CORS error, ensure no custom nginx CORS response
  headers or OPTIONS interception is configured. Upstream openGym replies
  to mobile preflights.
- The Home Assistant **Ingress launcher** continues serving the full
  openGym browser UI, which is intentionally NOT exposed at the new
  mobile-API path.
- Actual NGINX Home Assistant SSL proxy integration and phone Health
  Connect behavior require testing on your particular running setup.
  GitHub CI validates the new nginx snippet's syntax and request routing
  using a local stand-in backend.

Official Home Assistant references:
[NGINX app configuration](https://github.com/home-assistant/apps/blob/master/nginx_proxy/DOCS.md),
[Supervisor app networking](https://contributors.home-assistant.io/apps/reference/environment/).
