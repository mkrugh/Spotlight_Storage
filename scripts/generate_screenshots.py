#!/usr/bin/env python3
"""
Automated Documentation Screenshot Generator for Spotlight Storage.

Uses Playwright to boot an isolated temporary SQLite instance populated from
scripts/demo_data.json and scripts/demo_assets/, navigates to key UI states,
and captures high-resolution Retina screenshots:
  - images/main-dashboard.png          (dark mode, full inventory view)
  - images/map-inspector.png           (map modal: Akro-bin_Multi, drawer #2 focused)
  - images/cabinet-sectioning.png      (ESP modal: Akro-bin_Multi multi-section canvas)
  - images/inventory-health-drawer.png (bottom placement drawer: Low Stock tab)
  - images/builds-modal.png            (builds list: 100% Ready and Shortage builds)
  - images/main-dashboard-light.png    (light mode, full inventory view)
"""

import os
import re
import sys
import json
import time
import shutil
import tempfile
import threading
from waitress.server import create_server
from playwright.sync_api import sync_playwright

# Ensure repo root is on sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import db
import app
from app import app as flask_app

OUTPUT_DIR = os.path.join(REPO_ROOT, "images")
DEMO_DATA_JSON = os.path.join(REPO_ROOT, "scripts", "demo_data.json")
DEMO_ASSETS_DIR = os.path.join(REPO_ROOT, "scripts", "demo_assets")


def seed_demo_database(db_path, upload_dir):
    """Initializes and seeds an isolated database from scripts/demo_data.json."""
    db.COMBINED_DATABASE = db_path
    os.environ['COMBINED_DATABASE'] = db_path
    db.init_db(db_path)

    # Copy demo images to temporary upload folder so server serves them directly
    if os.path.exists(DEMO_ASSETS_DIR):
        for f in os.listdir(DEMO_ASSETS_DIR):
            src = os.path.join(DEMO_ASSETS_DIR, f)
            if os.path.isfile(src):
                shutil.copy2(src, os.path.join(upload_dir, f))

    flask_app.config['UPLOAD_FOLDER'] = upload_dir
    app.UPLOAD_FOLDER = upload_dir

    with open(DEMO_DATA_JSON, 'r', encoding='utf-8') as f:
        demo = json.load(f)

    # 1. Settings (Dark Mode default)
    st = demo.get('settings', {})
    db.update_settings({
        'brightness': st.get('brightness', 128),
        'timeout': st.get('timeout', 15),
        'lightMode': 'dark',
        'colors': ['#00ff00', '#f0f0f0'],
        'language': st.get('language', 'en')
    })

    # 2. ESP Controllers
    esp_map = {}
    for esp_entry in demo.get('esps', []):
        esp_id = db.write_esp_settings(esp_entry)
        esp_map[esp_entry['name']] = esp_id

    # 3. Parts Inventory
    item_map = {}
    for it in demo.get('items', []):
        img_val = it.get('image') or ''
        if img_val and not img_val.startswith(('http://', 'https://')):
            # Normalize to images/<filename>
            basename = os.path.basename(img_val)
            it['image'] = f"images/{basename}"

        item_id = db.write_item(it)
        item_map[it['name']] = item_id

    # 4. Builds / Recipes
    for b in demo.get('builds', []):
        build_id = db.write_build(b['name'])
        build_items = []
        for bi in b.get('items', []):
            item_name = bi.get('item_name')
            if item_name in item_map:
                build_items.append({
                    'item_id': item_map[item_name],
                    'quantity_needed': bi.get('quantity_needed', 1)
                })
        if build_items:
            db.set_build_items(build_id, build_items)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        test_db_path = os.path.join(tmp_dir, "screenshot_demo.db")
        upload_dir = os.path.join(tmp_dir, "uploaded_images")
        os.makedirs(upload_dir, exist_ok=True)

        print(f"[*] Initializing test database at {test_db_path}...")
        seed_demo_database(test_db_path, upload_dir)

        flask_app.config['TESTING'] = True
        server = create_server(flask_app, host='127.0.0.1', port=0)
        port = server.effective_port
        server_thread = threading.Thread(target=server.run, daemon=True)
        server_thread.start()
        base_url = f"http://127.0.0.1:{port}"
        print(f"[*] Ephemeral Waitress server running at {base_url}")

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                # Retina 2x scale for crisp documentation images
                context = browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    device_scale_factor=2,
                    color_scheme="dark"
                )
                page = context.new_page()

                # ----------------------------------------------------
                # 1. Main Dashboard — Dark Mode (Hero Screenshot)
                # ----------------------------------------------------
                print("[1/6] Capturing main dashboard (images/main-dashboard.png)...")
                page.goto(base_url)
                page.wait_for_selector('#open-builds-btn', state='visible')
                page.evaluate("document.documentElement.setAttribute('data-bs-theme', 'dark');")
                page.wait_for_selector('.card', state='visible')
                # Wait for images to load cleanly
                page.evaluate("""() => {
                    return Promise.all(
                        Array.from(document.images).map(img => {
                            if (img.complete) return Promise.resolve();
                            return new Promise(resolve => {
                                img.addEventListener('load', resolve);
                                img.addEventListener('error', resolve);
                            });
                        })
                    );
                }""")
                page.wait_for_timeout(800)
                main_dash_path = os.path.join(OUTPUT_DIR, "main-dashboard.png")
                page.screenshot(path=main_dash_path, full_page=False)
                print(f"      Saved: {main_dash_path} ({os.path.getsize(main_dash_path):,} bytes)")

                # ----------------------------------------------------
                # 2. Interactive Map Inspector (Akro-bin_Multi, Bin #2)
                # ----------------------------------------------------
                print("[2/6] Capturing map inspector (images/map-inspector.png)...")
                page.click('#open-map-btn')
                page.wait_for_selector('#map-modal', state='visible')

                # Select 'Akro-bin_Multi' in the map cabinet dropdown
                page.evaluate("""() => {
                    const sel = document.getElementById('map-esp-select');
                    if (sel) {
                        for (let i = 0; i < sel.options.length; i++) {
                            if (sel.options[i].text.includes('Akro-bin_Multi')) {
                                sel.selectedIndex = i;
                                sel.dispatchEvent(new Event('change'));
                                break;
                            }
                        }
                    }
                }""")
                page.wait_for_timeout(500)

                page.wait_for_selector('#map-drawer-grid-view .map-drawer-card', state='visible')
                # Focus on Bin 2 (ESP32-S3-DevKitC-1)
                page.wait_for_selector('#map-drawer-grid-view .map-drawer-card[data-led="2"]', state='visible')
                page.click('#map-drawer-grid-view .map-drawer-card[data-led="2"]')
                page.wait_for_selector('#map-inspector-content .map-inspector-card', state='visible')
                page.wait_for_timeout(500)

                map_path = os.path.join(OUTPUT_DIR, "map-inspector.png")
                modal_locator = page.locator('#map-modal .modal-content')
                modal_locator.screenshot(path=map_path)
                print(f"      Saved: {map_path} ({os.path.getsize(map_path):,} bytes)")

                page.evaluate("DialogManager.close('map-modal');")
                page.wait_for_timeout(400)

                # ----------------------------------------------------
                # 3. Multi-Section Cabinet Builder (Akro-bin_Multi)
                # ----------------------------------------------------
                print("[3/6] Capturing cabinet sectioning (images/cabinet-sectioning.png)...")
                page.set_viewport_size({"width": 1280, "height": 1150})
                page.click('button[data-bs-target="#offcanvasSettings"]')
                page.wait_for_selector('#offcanvasSettings.show', state='visible')

                # Click edit on 'Akro-bin_Multi'
                edit_btn = page.locator('#esp_table button[data-bs-esp-name="Akro-bin_Multi"]')
                if edit_btn.count() > 0:
                    edit_btn.first.click()
                else:
                    page.locator('#esp_table [data-bs-mode="edit"]').first.click()

                page.wait_for_selector('#esp-modal', state='visible')
                page.wait_for_selector('#esp-responsive-canvas', state='visible')
                page.wait_for_timeout(1000)

                cabinet_path = os.path.join(OUTPUT_DIR, "cabinet-sectioning.png")
                esp_modal_locator = page.locator('#esp-modal .modal-content')
                esp_modal_locator.screenshot(path=cabinet_path)
                print(f"      Saved: {cabinet_path} ({os.path.getsize(cabinet_path):,} bytes)")

                # Close ESP modal and settings offcanvas, restore viewport
                page.evaluate("""() => {
                    DialogManager.close('esp-modal');
                    const settingsEl = document.getElementById('offcanvasSettings');
                    if (settingsEl && window.bootstrap) {
                        const inst = bootstrap.Offcanvas.getInstance(settingsEl);
                        if (inst) inst.hide();
                    }
                }""")
                page.set_viewport_size({"width": 1280, "height": 800})
                page.wait_for_timeout(500)

                # ----------------------------------------------------
                # 4. Inventory Health — Low Stock Tab
                # ----------------------------------------------------
                print("[4/6] Capturing inventory health drawer (images/inventory-health-drawer.png)...")
                page.wait_for_selector('#low-stock-pill-btn:not(.d-none)', state='visible')
                page.click('#low-stock-pill-btn')
                page.wait_for_selector('#unassigned-drawer.show', state='visible')
                # Ensure the Low Stock tab is active
                page.click('#tab-low-stock-btn')
                page.wait_for_timeout(600)

                drawer_path = os.path.join(OUTPUT_DIR, "inventory-health-drawer.png")
                page.screenshot(path=drawer_path, full_page=False)
                print(f"      Saved: {drawer_path} ({os.path.getsize(drawer_path):,} bytes)")

                page.evaluate("""() => {
                    const drawerEl = document.getElementById('unassigned-drawer');
                    if (drawerEl && window.bootstrap) {
                        const inst = bootstrap.Offcanvas.getInstance(drawerEl);
                        if (inst) inst.hide();
                    }
                }""")
                page.wait_for_timeout(500)

                # ----------------------------------------------------
                # 5. Builds & Recipes Modal
                # ----------------------------------------------------
                print("[5/6] Capturing builds modal (images/builds-modal.png)...")
                page.click('#open-builds-btn')
                page.wait_for_selector('#builds-list-modal', state='visible')
                page.wait_for_selector('#builds-list-container .build-item-card', state='visible')
                page.wait_for_timeout(600)

                builds_path = os.path.join(OUTPUT_DIR, "builds-modal.png")
                builds_modal_locator = page.locator('#builds-list-modal .modal-content')
                builds_modal_locator.screenshot(path=builds_path)
                print(f"      Saved: {builds_path} ({os.path.getsize(builds_path):,} bytes)")

                page.evaluate("DialogManager.close('builds-list-modal');")
                page.wait_for_timeout(400)

                # ----------------------------------------------------
                # 6. Main Dashboard — Light Mode
                # ----------------------------------------------------
                print("[6/6] Capturing light mode dashboard (images/main-dashboard-light.png)...")
                page.evaluate("""
                    document.documentElement.setAttribute('data-bs-theme', 'light');
                    if (window.setStoredTheme) setStoredTheme('light');
                """)
                page.wait_for_timeout(600)
                light_dash_path = os.path.join(OUTPUT_DIR, "main-dashboard-light.png")
                page.screenshot(path=light_dash_path, full_page=False)
                print(f"      Saved: {light_dash_path} ({os.path.getsize(light_dash_path):,} bytes)")

                browser.close()
                print("\n[+] All 6 screenshots generated successfully with your demo dataset!")

        finally:
            server.close()


if __name__ == '__main__':
    main()
