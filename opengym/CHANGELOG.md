# Changelog

All notable changes to the **Home Assistant app wrapper** are recorded here, newest first. This is not the upstream openGym release history; see [openGym releases](https://github.com/DuarteSantos8/openGym/releases) for its own changelog.

Versions are `<openGym upstream version>-<Home Assistant wrapper revision>`. Revisions may contain application features, Home Assistant integration updates, or packaging fixes. Entries describe repository changes; production behavior still depends on Home Assistant and browser versions. Historical entries below summarize the commits made while the wrapper was first developed.

## 1.4.3-6 — 2026-10-27

### Fixed
- Replaced invalid/corrupted openGym icon and logo files with verified PNG images generated from the official openGym barbell artwork; fixes missing branding in Home Assistant's installed-app list.
- Added a reproducible branding-generation script and PNG decode tests in CI, so malformed artwork fails validation before deployment.
- Documented how to refresh app repository metadata and the Home Assistant browser cache to pick up corrected branding.

## 1.4.3-5 — 2026-10-27

### Fixed
- Fixed Supervisor image builds failing with `/bin/ash: npm: not found` when Home Assistant uses its own `ghcr.io/home-assistant/base:latest` image.
- Explicitly install both Node.js (for the openGym API and MQTT sensor bridge) and npm (for the pinned MQTT client) in the final image.

### Changed
- Align `build.yaml`, the Dockerfile fallback, and GitHub Actions build tests with the Home Assistant Supervisor base image rather than a Node.js base image.
- Verify Node.js and npm availability during the Docker build so this failure is caught before publication.

