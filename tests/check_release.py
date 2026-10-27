#!/usr/bin/env python3
"""Enforce release notes and an app version bump for deployable openGym changes.

Always verify the latest changelog entry matches config.yaml. When --base is
provided for a PR, inspect changed files and compare to the base commit.
Documentation/CI-only changes do not require publishing a new app version.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
import sys
import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG = "opengym/config.yaml"
CHANGELOG = "opengym/CHANGELOG.md"


def run_git(*args: str, required: bool = True) -> str | None:
    process = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if process.returncode:
        if required:
            raise RuntimeError(f"git {' '.join(args)}: {process.stderr.strip()}")
        return None
    return process.stdout


def current_version(config_text: str) -> str:
    config = yaml.safe_load(config_text)
    if not isinstance(config, dict) or not isinstance(config.get("version"), str):
        raise ValueError(f"Missing string version in {CONFIG}")
    return config["version"]


def headings(text: str) -> list[str]:
    return re.findall(r"^##\s+([^\n]+)\s*$", text, flags=re.MULTILINE)


def validate_release_notes(version: str, text: str) -> None:
    hs = headings(text)
    if not hs:
        raise ValueError("CHANGELOG.md must contain version headings of the form ## VERSION")
    versions = [h.strip().split(" — ", 1)[0].strip() for h in hs]
    if versions[0] != version:
        raise ValueError(
            f"First changelog entry must match the current app version: {version}; "
            f"found {versions[0]!r}"
        )
    if versions.count(version) != 1:
        raise ValueError(f"Version {version} must appear exactly once in CHANGELOG.md")


def deployed_file(file: str) -> bool:
    if not file.startswith("opengym/"):
        return False
    return file not in {"opengym/CHANGELOG.md", "opengym/DOCS.md"}


def check(base: str | None) -> None:
    version = current_version((ROOT / CONFIG).read_text(encoding="utf-8"))
    text = (ROOT / CHANGELOG).read_text(encoding="utf-8")
    validate_release_notes(version, text)
    if not base:
        print(f"Changelog current: {version}")
        return

    files = set(run_git("diff", "--name-only", "--diff-filter=ACMRT", base, "HEAD").splitlines())
    modified = sorted(f for f in files if deployed_file(f))
    old_config = run_git("show", f"{base}:{CONFIG}", required=False)
    old_version = current_version(old_config) if old_config is not None else None

    if modified:
        if version == old_version:
            raise ValueError(
                "Deployed app files changed without a version bump in "
                f"{CONFIG}: {', '.join(modified)}"
            )
        if CHANGELOG not in files:
            raise ValueError("New deployed app version requires an updated CHANGELOG.md")
        old_notes = run_git("show", f"{base}:{CHANGELOG}", required=False) or ""
        if old_notes == text:
            raise ValueError("The release notes must be changed for a new version")
    elif version != old_version:
        if CHANGELOG not in files:
            raise ValueError("Any version bump requires an updated CHANGELOG.md")
    print(
        f"Release policy OK: {old_version or '(initial)'} -> {version}; "
        f"{len(modified)} deployed files modified"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", help="PR base commit SHA for checking changes")
    args = parser.parse_args()
    try:
        check(args.base)
    except (ValueError, RuntimeError, OSError, yaml.YAMLError) as exc:
        print(f"Release policy FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
