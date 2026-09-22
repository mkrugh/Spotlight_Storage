#!/usr/bin/env python3
"""
Vendor Library Update Tool for Spotlight Storage.

Reads static/vendor/vendor_manifest.json, checks the npm registry for newer
versions, and optionally downloads updates.

Usage:
    python scripts/update_vendor.py --check          # Report outdated libraries
    python scripts/update_vendor.py --check --json   # Machine-readable output
    python scripts/update_vendor.py --update         # Download latest versions
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import date


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
VENDOR_DIR = os.path.join(PROJECT_ROOT, 'static', 'vendor')
MANIFEST_PATH = os.path.join(VENDOR_DIR, 'vendor_manifest.json')

# npm registry endpoint for version lookups
NPM_REGISTRY = 'https://registry.npmjs.org'


def load_manifest():
    """Load and return the vendor manifest."""
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_manifest(manifest):
    """Save the vendor manifest."""
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')


def get_latest_npm_version(package_name):
    """Query the npm registry for the latest version of a package."""
    # Handle scoped packages (e.g., @yaireo/tagify)
    encoded_name = package_name.replace('/', '%2f')
    url = f'{NPM_REGISTRY}/{encoded_name}/latest'

    req = urllib.request.Request(url, headers={
        'Accept': 'application/json',
        'User-Agent': 'SpotlightStorage-VendorUpdater/1.0'
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('version')
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as e:
        print(f"  Warning: Could not fetch version for {package_name}: {e}",
              file=sys.stderr)
        return None


def check_updates(manifest, as_json=False):
    """Check all libraries for available updates. Returns list of results."""
    results = []
    libraries = manifest.get('libraries', {})

    for lib_name, lib_info in libraries.items():
        current = lib_info.get('version', 'unknown')
        registry = lib_info.get('registry', lib_name)
        latest = get_latest_npm_version(registry)

        status = 'unknown'
        if latest is None:
            status = 'error'
        elif latest == current:
            status = 'current'
        else:
            status = 'outdated'

        results.append({
            'name': lib_name,
            'current': current,
            'latest': latest or 'unknown',
            'status': status,
            'registry': registry
        })

    if as_json:
        output = {
            'libraries': results,
            'has_updates': any(r['status'] == 'outdated' for r in results),
            'update_command': 'python scripts/update_vendor.py --update'
        }
        print(json.dumps(output, indent=2))
    else:
        print(f"\n{'Library':<15} {'Current':<12} {'Latest':<12} {'Status'}")
        print('-' * 55)
        for r in results:
            status_icon = {
                'current': '✅ Current',
                'outdated': '⚠️  Outdated',
                'error': '❌ Error',
                'unknown': '❓ Unknown'
            }.get(r['status'], r['status'])
            print(f"{r['name']:<15} {r['current']:<12} {r['latest']:<12} {status_icon}")

        outdated = [r for r in results if r['status'] == 'outdated']
        if outdated:
            print(f"\n{len(outdated)} library(ies) can be updated.")
            print("Run: python scripts/update_vendor.py --update")
        else:
            print("\nAll libraries are up to date.")

    return results


def download_file(url, dest_path):
    """Download a file from URL to the destination path."""
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    req = urllib.request.Request(url, headers={
        'User-Agent': 'SpotlightStorage-VendorUpdater/1.0'
    })

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read()
            if len(content) < 100:
                # Likely an error page, not a real file
                print(f"  Error: Downloaded content too small ({len(content)} bytes) "
                      f"for {url}", file=sys.stderr)
                return False
            with open(dest_path, 'wb') as f:
                f.write(content)
            return True
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        print(f"  Error downloading {url}: {e}", file=sys.stderr)
        return False


def update_libraries(manifest):
    """Download the latest versions of all libraries."""
    libraries = manifest.get('libraries', {})
    updated = []
    failed = []

    for lib_name, lib_info in libraries.items():
        current = lib_info.get('version', 'unknown')
        registry = lib_info.get('registry', lib_name)
        latest = get_latest_npm_version(registry)

        if latest is None:
            print(f"  Skipping {lib_name}: could not determine latest version")
            failed.append(lib_name)
            continue

        if latest == current:
            print(f"  {lib_name} v{current} is already current")
            continue

        print(f"  Updating {lib_name}: {current} → {latest}")
        files = lib_info.get('files', {})
        all_ok = True

        for rel_path, url_template in files.items():
            url = url_template.replace('{version}', latest)
            dest = os.path.join(VENDOR_DIR, rel_path)
            print(f"    Downloading {rel_path}...")
            if not download_file(url, dest):
                all_ok = False
                print(f"    FAILED: {rel_path}")

        if all_ok:
            lib_info['version'] = latest
            updated.append(f"{lib_name}: {current} → {latest}")
            print(f"  ✅ {lib_name} updated to {latest}")
        else:
            failed.append(lib_name)
            print(f"  ❌ {lib_name} update had errors — version NOT bumped in manifest")

    if updated:
        manifest['meta']['last_updated'] = str(date.today())
        save_manifest(manifest)
        print(f"\nUpdated {len(updated)} library(ies):")
        for u in updated:
            print(f"  • {u}")
        print(f"\nManifest saved to {MANIFEST_PATH}")
    else:
        print("\nNo updates applied.")

    if failed:
        print(f"\n{len(failed)} library(ies) had errors: {', '.join(failed)}")
        return False

    return True


def check_updates_api(manifest_path=None):
    """
    API-friendly version of check_updates.
    Returns a dict suitable for JSON response.
    Called by app.py's /api/vendor/check-updates endpoint.
    """
    path = manifest_path or MANIFEST_PATH
    with open(path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    results = []
    libraries = manifest.get('libraries', {})

    for lib_name, lib_info in libraries.items():
        current = lib_info.get('version', 'unknown')
        registry = lib_info.get('registry', lib_name)
        latest = get_latest_npm_version(registry)

        status = 'unknown'
        if latest is None:
            status = 'error'
        elif latest == current:
            status = 'current'
        else:
            status = 'outdated'

        results.append({
            'name': lib_name,
            'current': current,
            'latest': latest or 'unknown',
            'status': status
        })

    return {
        'libraries': results,
        'has_updates': any(r['status'] == 'outdated' for r in results),
        'last_checked': manifest.get('meta', {}).get('last_updated', 'unknown'),
        'update_command': 'python scripts/update_vendor.py --update'
    }


def main():
    parser = argparse.ArgumentParser(
        description='Check and update vendored frontend libraries'
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--check', action='store_true',
                       help='Check for available updates (read-only)')
    group.add_argument('--update', action='store_true',
                       help='Download and install latest versions')
    parser.add_argument('--json', action='store_true',
                        help='Output in JSON format (for CI/CD integration)')

    args = parser.parse_args()

    if not os.path.isfile(MANIFEST_PATH):
        print(f"Error: Manifest not found at {MANIFEST_PATH}", file=sys.stderr)
        sys.exit(1)

    manifest = load_manifest()

    if args.check:
        results = check_updates(manifest, as_json=args.json)
        has_updates = any(r['status'] == 'outdated' for r in results)
        sys.exit(1 if has_updates else 0)
    elif args.update:
        success = update_libraries(manifest)
        sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
