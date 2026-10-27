# Changelog

All notable changes to the **Home Assistant app wrapper** are recorded here, newest first. This is not the upstream openGym release history; see [openGym releases](https://github.com/DuarteSantos8/openGym/releases) for its own changelog.

Versions are `<openGym upstream version>-<Home Assistant wrapper revision>`. Revisions may contain application features, Home Assistant integration updates, or packaging fixes. Entries describe repository changes; production behavior still depends on Home Assistant and browser versions. Historical entries below summarize the commits made while the wrapper was first developed.

## 1.4.3-4 — 2026-10-27

### Changed
- Refined official openGym artwork for the Home Assistant app listing and details page.
- Enabled Ingress streaming for larger custom-exercise media requests.
- Documented a bookmarkable Home Assistant Ingress launch URL and how to refresh/update the installed app.
- Advertised the updated wrapper version so Home Assistant can offer an app update.

## 1.4.3-3 — 2026-10-27

### Added
- Per-profile MQTT device discovery: separate workout sensors for each active openGym account.
- Cleanup of retained MQTT discoveries for disabled or deleted accounts.
- Best-effort, same-origin WebAuthn Permissions-Policy header for HTTPS Ingress; password sign-in remains available.
- Scheduled, review-only monthly Home Assistant compatibility coding workflow and its agent instructions.
- openGym app logo and icon assets for Home Assistant.

### Changed
- Removed the single-account `ha_profile_id` sensor option.
- Expanded documentation and privacy guidance for multiple accounts.

## 1.4.3-2 — 2026-10-27

### Added
- Optional MQTT-discovered workout summary sensors for Home Assistant.
- Workout totals, recent sessions and completed sets, last workout, duration, today's workout, and saved-routine counts.
- Separately opt-in body-weight sensor, timezone selection, and refresh interval.
- Configurable MQTT sensor settings, UI descriptions, tests, and documentation.

### Security & privacy
- Workout data publishing disabled by default.
- MQTT publishes aggregated metrics, rather than full exercise histories or credentials.

## 1.4.3-1 — 2026-10-27

### Added
- Initial experimental Home Assistant Ingress app for openGym 1.4.3 on AMD64 and ARM64.
- Bundled frontend, Node.js API, internal nginx routing, and persistent `/data` storage.
- First-account administrator option, password login, configurable guest access, upload limits, and AI Coach support via the standard openGym API runtime.
- Docker build/startup smoke tests, app metadata validation, and upstream release monitoring.
- Installation, networking, and Home Assistant reverse-proxy documentation.

---

## Maintaining this changelog

- Every change to the **deployed app** must increment `opengym/config.yaml` `version` and add a matching `## VERSION` heading to this file, with user-facing `Added`, `Changed`, `Fixed`, or `Security` notes.
- Upstream openGym upgrades must document the old and new upstream versions and link to upstream release notes when possible. Pin the API/web images and build arguments consistently.
- Changes limited to the README, documentation, CI, tests, or agent prompts do **not** require a new wrapper version unless they affect app deployment.
- CI verifies the current version has an entry and rejects both pull requests and pushes that change deployed app files without a version bump and a changelog update.
- Automated agents should propose changelog changes in their pull requests; they must never merge updates automatically.
