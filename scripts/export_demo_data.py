#!/usr/bin/env python3
"""
Export Demo Data for Screenshot Generation.

Reads from the live Spotlight Storage database (data/combined_data.db),
copies referenced part images to scripts/demo_assets/, and writes a
frozen snapshot to scripts/demo_data.json.

Usage:
    python scripts/export_demo_data.py

After running, commit:
    - scripts/demo_data.json
    - scripts/demo_assets/*.png  (images with transparent/neutral backgrounds)

Then update scripts/generate_screenshots.py to load from demo_data.json
instead of its hardcoded seed data.
"""

import os
import sys
import json
import shutil
import sqlite3

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(REPO_ROOT, "data", "combined_data.db")
IMAGES_DIR = os.path.join(REPO_ROOT, "images")
DEMO_ASSETS_DIR = os.path.join(REPO_ROOT, "scripts", "demo_assets")
OUTPUT_JSON = os.path.join(REPO_ROOT, "scripts", "demo_data.json")


def export_demo_data():
    if not os.path.exists(DB_PATH):
        print(f"[!] Database not found at {DB_PATH}")
        print("    Make sure the app has been run at least once to initialize the database.")
        sys.exit(1)

    os.makedirs(DEMO_ASSETS_DIR, exist_ok=True)

    print(f"[*] Reading from: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # --- Items ---
    cur.execute("""
        SELECT id, name, link, image, position, quantity, min_quantity, ip, tags
        FROM items
        ORDER BY id
    """)
    raw_items = [dict(row) for row in cur.fetchall()]

    import urllib.request
    import urllib.parse

    items = []
    copied_images = 0
    for idx, item in enumerate(raw_items, start=1):
        image_field = (item.get("image") or "").strip()
        new_image_field = ""

        if image_field:
            if image_field.startswith(("http://", "https://")):
                parsed = urllib.parse.urlparse(image_field)
                ext = os.path.splitext(parsed.path)[1]
                if not ext or len(ext) > 5:
                    ext = ".jpg"
                safe_name = f"item_{idx}_{abs(hash(image_field)) % 10000}{ext}"
                dest_path = os.path.join(DEMO_ASSETS_DIR, safe_name)
                try:
                    req = urllib.request.Request(
                        image_field,
                        headers={"User-Agent": "Mozilla/5.0 (SpotlightStorage-DemoExport/1.0)"}
                    )
                    with urllib.request.urlopen(req, timeout=5) as response, open(dest_path, "wb") as out_f:
                        out_f.write(response.read())
                    new_image_field = f"demo_assets/{safe_name}"
                    copied_images += 1
                    print(f"    Downloaded remote image: {image_field[:50]}... -> {safe_name}")
                except Exception as e:
                    print(f"    [!] Could not download remote image ({e}), keeping URL")
                    new_image_field = image_field
            else:
                basename = os.path.basename(image_field)
                src_path = os.path.join(IMAGES_DIR, basename)
                if os.path.exists(src_path):
                    dest_path = os.path.join(DEMO_ASSETS_DIR, basename)
                    shutil.copy2(src_path, dest_path)
                    new_image_field = f"demo_assets/{basename}"
                    copied_images += 1
                    print(f"    Copied local image: {basename}")
                else:
                    print(f"    [!] Local image not found: {src_path}")
                    new_image_field = image_field

        items.append({
            "name": item["name"],
            "link": item["link"] or "",
            "image": new_image_field,
            "position": item["position"] or "[]",
            "quantity": item["quantity"],
            "min_quantity": item["min_quantity"] or 0,
            "ip": item["ip"] or "",
            "tags": item["tags"] or "[]",
        })

    print(f"[*] Exported {len(items)} items, {copied_images} images cached.")

    # --- ESP Controllers ---
    cur.execute("""
        SELECT id, name, esp_ip, rows, cols, start_top, start_left,
               serpentine_direction, sections
        FROM esp
        ORDER BY id
    """)
    raw_esps = [dict(row) for row in cur.fetchall()]

    esps = []
    for esp in raw_esps:
        sections_raw = esp.get("sections")
        sections = None
        if sections_raw:
            try:
                sections = json.loads(sections_raw)
            except (json.JSONDecodeError, TypeError):
                sections = None

        esps.append({
            "name": esp["name"],
            "esp_ip": esp["esp_ip"],
            "rows": esp["rows"],
            "cols": esp["cols"],
            "startTop": esp["start_top"],
            "startLeft": esp["start_left"],
            "serpentineDirection": esp["serpentine_direction"],
            "sections": sections,
        })

    print(f"[*] Exported {len(esps)} ESP controller(s).")

    # --- Builds ---
    cur.execute("SELECT id, name FROM builds ORDER BY id")
    raw_builds = [dict(row) for row in cur.fetchall()]

    builds = []
    for build in raw_builds:
        cur.execute("""
            SELECT bi.item_id, bi.quantity_needed, i.name as item_name
            FROM build_items bi
            JOIN items i ON bi.item_id = i.id
            WHERE bi.build_id = ?
        """, (build["id"],))
        build_items = [dict(row) for row in cur.fetchall()]

        builds.append({
            "name": build["name"],
            "items": [
                {
                    "item_name": bi["item_name"],
                    "quantity_needed": bi["quantity_needed"],
                }
                for bi in build_items
            ]
        })

    print(f"[*] Exported {len(builds)} build(s).")

    # --- Settings ---
    cur.execute("SELECT * FROM settings ORDER BY id LIMIT 1")
    settings_row = cur.fetchone()
    settings = {}
    if settings_row:
        settings = dict(settings_row)

    conn.close()

    # --- Assemble output ---
    demo_data = {
        "_note": (
            "Frozen demo dataset for generate_screenshots.py. "
            "Generated by scripts/export_demo_data.py from data/combined_data.db. "
            "Do not edit manually."
        ),
        "settings": {
            "brightness": settings.get("brightness", 128),
            "timeout": settings.get("timeout", 15),
            "language": settings.get("language", "en"),
        },
        "esps": esps,
        "items": items,
        "builds": builds,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(demo_data, f, indent=2, ensure_ascii=False)

    print(f"\n[+] Demo data written to: {OUTPUT_JSON}")
    print(f"[+] Demo images written to: {DEMO_ASSETS_DIR}/")
    print()
    print("Next steps:")
    print("  1. Review scripts/demo_data.json and scripts/demo_assets/ to confirm everything looks correct.")
    print("  2. Update scripts/generate_screenshots.py to load from demo_data.json instead of hardcoded seed data.")
    print("  3. Run: python scripts/generate_screenshots.py")
    print("  4. git add scripts/demo_data.json scripts/demo_assets/ images/*.png")


if __name__ == "__main__":
    export_demo_data()
