# Installation and configuration

## Add as a custom repository

Install from `https://github.com/ChadJPetersen/home-assistant-opengym` using **Settings → Apps → App Store → ⋮ → Repositories**.

Configure `origin` to exactly the origin in your browser address bar when you use Home Assistant. Examples:

- `https://home.example.com`
- `http://homeassistant.local:8123`

Do not specify the dynamic `/api/hassio_ingress/...` path. The app runs through Supervisor's ingress router. It does not expose port 8099 on the host.

## Accounts and administration

Password login is enabled by default, since WebAuthn/passkeys are unreliable inside an embedded iframe. Create the **first** openGym account yourself, immediately after starting the application. First-user admin is enabled; the first user becomes admin. Home Assistant's own sign-in does **not** automatically create or authenticate an openGym account. For added security you can disable guest mode (the default).

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
