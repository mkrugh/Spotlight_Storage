# Spotlight Storage Test Suite & Security Hardening Walkthrough

## Overview
This document provides an architectural walkthrough and verification report for the automated test suite, security hardening, multi-threaded concurrency safeguards, and production container modernization implemented for **Spotlight Storage**.

The complete test suite contains **178 automated tests across 26 test modules**.

---

## Test Suite Structure

```text
tests/
├── __init__.py
├── conftest.py                       # Isolated temp SQLite DB & Flask client fixtures
│
├── unit/
│   ├── __init__.py
│   ├── test_matrix_math.py           # LED serpentine math, layout, corner offsets, multi-section (13 tests)
│   ├── test_color_conversion.py      # Hex to RGB conversions & fallback behavior (6 tests)
│   ├── test_validation.py            # IP/URL validation & file extension checks (6 tests)
│   ├── test_db_items.py              # Item CRUD, quantities, image updates, tags (8 tests)
│   ├── test_db_esp.py                # ESP device CRUD, lookups, and validations (6 tests)
│   ├── test_db_builds.py             # Builds / BOM recipes, stock deduction, cascades (9 tests)
│   ├── test_db_settings.py           # App settings & color array serialization (2 tests)
│   └── test_i18n_keys.py             # JSON translation validity & 100% key parity (3 tests)
│
├── integration/
│   ├── __init__.py
│   ├── test_api_items.py             # /api/items CRUD & custom headers (13 tests)
│   ├── test_api_esp.py               # /api/esp/ CRUD, lookups, multi-section payloads (8 tests)
│   ├── test_api_esp_test.py          # /api/esp/test connection verification & double-flash pulse (13 tests)
│   ├── test_api_builds.py            # /api/builds creation, update, and execution (8 tests)
│   ├── test_api_settings.py          # /api/settings GET and POST (2 tests)
│   ├── test_api_tags.py              # /api/tags frequency extraction and per-item deduplication (3 tests)
│   ├── test_image_handling.py        # /upload and /proxy-image validation (8 tests)
│   ├── test_security.py              # SSRF, SVG blocking, size caps, UUID filenames, headers (7 tests)
│   ├── test_security_expanded.py     # Path traversal, advanced SSRF, SQLi, input fuzzing (20 tests)
│   ├── test_api_endpoints_misc.py    # /test_lights, /api/translations, /favicon.ico, /, links (6 tests)
│   ├── test_concurrency.py           # Thread-safe state_lock & concurrent transactions (3 tests)
│   ├── test_performance.py           # Bulk inventory and tag scale benchmarks (2 tests)
│   ├── test_db_refactor.py           # Database transaction integrity and connection handling (4 tests)
│   └── test_wled_controller.py       # WLED JSON API interaction & timeouts (4 tests)
│
├── ui/
│   ├── conftest.py                   # Playwright browser context & server fixtures
│   ├── test_builds_modal_interactions.py # Builds modal lifecycle, part picker, search, unsaved guard (6 tests)
│   └── test_item_modal_interactions.py   # Item modal lifecycle, dirty state tracking, crop/rotate, navbar sizing (9 tests)
│
└── build/
    ├── __init__.py
    ├── test_requirements.py          # Core imports, Dockerfile, non-root user, healthcheck sanity (4 tests)
    ├── test_static_assets.py         # Template HTML static link & non-empty asset validation (5 tests)
    └── test_docker_build.sh          # Container build, startup, and curl smoke test script
```

---

## Test Modules & Coverage Breakdown

| Category | Modules | Test Count | Key Coverage |
| :--- | :--- | :--- | :--- |
| **Unit Logic** | `test_matrix_math.py`, `test_color_conversion.py`, `test_validation.py` | 25 | LED serpentine math, matrix corner offsets, multi-section sequential routing, hex colors, IP/URL & port validation |
| **Database Operations** | `test_db_items.py`, `test_db_esp.py`, `test_db_builds.py`, `test_db_settings.py`, `test_db_refactor.py` | 29 | CRUD operations, tag aggregations, BOM recipe stock deductions, cascade deletes, transaction atomicity |
| **Internationalization (i18n)** | `test_i18n_keys.py` | 3 | JSON parsing validity & 100% key parity across all 6 translations (`de`, `en`, `fi`, `fr`, `nl`, `pl`) |
| **REST APIs & Hardware** | `test_api_items.py`, `test_api_esp.py`, `test_api_esp_test.py`, `test_api_builds.py`, `test_api_settings.py`, `test_api_tags.py`, `test_api_endpoints_misc.py`, `test_wled_controller.py` | 57 | REST endpoints, multi-section ESP configurations, WLED verification, pulse sequence, UI links, `/favicon.ico` |
| **Image & File Handling** | `test_image_handling.py` | 8 | File extension allowlisting, upstream proxying, 5MB memory buffer cap |
| **Security & Hardening** | `test_security.py`, `test_security_expanded.py` | 27 | Advanced SSRF (decimal, octal, hex, IPv6), path traversal, SQLi, DOM XSS, security headers |
| **Concurrency & Thread-Safety** | `test_concurrency.py` | 3 | Multi-threaded `app.state_lock`, simultaneous timer updates, SQLite concurrent transactions |
| **Performance & Scaling** | `test_performance.py` | 2 | 300-item bulk inventory queries (< 50ms) and tag aggregations under scale |
| **Build & Static Assets** | `test_requirements.py`, `test_static_assets.py` | 9 | Dockerfile non-root user, healthcheck, dependency import sanity, HTML static link verification |
| **UI & End-to-End (Playwright)** | `test_builds_modal_interactions.py`, `test_item_modal_interactions.py` | 15 | Builds and item modal open/close lifecycle, search picker, tokenized tags, unsaved warning guards, crop/rotate workflows, navbar touch targets |
| **Total** | **26 Modules** | **178 Tests** | **100% Passing (0 Warnings)** |

---

## Key Software Safeguards & Hardening

### 1. Advanced Security & Attack Vector Protection
- **Path Traversal Defense ([`app.py`](../app.py))**:
  - Image downloads via `/images/<name>` use Flask's `send_from_directory`, strictly blocking directory traversal escapes (`../`, `%2e%2e%2f`) with `404 Not Found`.
  - Image uploads via `/upload` strip all directory path separators (`os.path.basename`) prior to running Werkzeug's `secure_filename`, preventing arbitrary writes outside `UPLOAD_FOLDER`.
- **Server-Side Request Forgery (SSRF) Defense ([`app.py`](../app.py))**:
  - `is_safe_public_url()` blocks private IPv4 subnets, loopback addresses (`127.0.0.0/8`, `::1`, `0.0.0.0`), cloud metadata endpoints (`169.254.169.254`), and internal domain suffixes (`.local`, `.lan`, `.internal`, `.home`, `.localdomain`).
  - Supports alternative IP encodings via `socket.inet_aton()`, rejecting decimal integer IPs (`2130706433`), octal IPs (`0177.0.0.1`), hex IPs (`0x7f.0.0.1`), shorthand IPs (`127.1`), and IPv4-mapped IPv6 addresses (`[::ffff:127.0.0.1]`).
  - Strict URI scheme allowlist (`http`, `https` only; rejects `file://`, `gopher://`, `dict://`, `data:`, `javascript:`).
  - Outbound image proxy requests disable automatic redirects (`allow_redirects=False`) to prevent redirect-based SSRF bypasses.
- **SQL Injection Resiliency ([`db.py`](../db.py))**:
  - All database queries across items, ESPs, settings, and builds are strictly parameterized using SQLite `?` placeholders.
  - Validated against stacked queries, OR conditions, quotes, and `UNION SELECT` attack vectors.
- **Cross-Site Scripting (XSS) Hardening**:
  - Blocked `image/svg+xml` in the image proxy to prevent stored and reflected SVG script execution.
  - Sanitized DOM manipulation in `static/settings.js`, `static/esp.js`, and `static/tags.js` using `.textContent` and HTML escaping.
- **Defense-in-Depth HTTP Headers ([`app.py`](../app.py))**:
  - Injected `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy: strict-origin-when-cross-origin` on all responses.

### 2. Multi-Threaded Concurrency & State-Lock
- Integrated the production **Waitress WSGI Server** (`waitress.serve(app, host="0.0.0.0", port=5000, threads=6)`).
- Wrapped in-memory mutable dictionaries (`app.off_timers` and `app.previous_positions`) with a re-entrant lock `app.state_lock`.
- Validated via `tests/integration/test_concurrency.py` using concurrent threads calling locate operations and writing to SQLite simultaneously without deadlocks or race conditions.

### 3. Referential Integrity & Build BOM Cascades ([`db.py`](../db.py))
- Hardened `delete_item(id)` to automatically delete referencing rows from `build_items`, eliminating orphaned BOM entries.
- Validated multiple consecutive build executions to ensure stock decrements accurately down to zero and emits depletion warnings.

### 4. Translation Key Parity ([`static/translations/`](../static/translations/))
- Validated that all language translation files (`de.json`, `es.json`, `fi.json`, `fr.json`, `nl.json`, `pl.json`) match the keys of `en.json` exactly.
- Added missing key `"edit_inventur_btn_label"` to `de.json` to guarantee 100% key completeness across the UI.

### 5. Static Asset Integrity Smoke Test ([`templates/index.html`](../templates/index.html))
- Automatically parses all `<script>` and `<link>` tags in HTML templates and verifies that every referenced file exists on disk and is non-empty.

---

## Production Container Modernization

1. **Non-Root Container User ([`Dockerfile`](../Dockerfile))**:
   - Created dedicated `appuser` (`UID 1000`, `GID 1000`), matching standard Linux host volume mount ownership.
   - Enforced `USER appuser` to eliminate root execution.
2. **Container Healthcheck ([`Dockerfile`](../Dockerfile))**:
   - Configured Docker healthcheck using Alpine's built-in `curl`:
     ```dockerfile
     HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
         CMD curl -f http://localhost:5000/ || exit 1
     ```

---

## How to Run the Test Suite

Run the full test suite with verbose output:

```bash
pytest tests/ -v
```

Run specific test categories:

```bash
# Unit tests
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# Security regression tests
pytest tests/integration/test_security.py tests/integration/test_security_expanded.py -v

# Concurrency & thread-safety tests
pytest tests/integration/test_concurrency.py -v

# Build & static asset tests
pytest tests/build/ -v
```

---

## Verification Results

```text
============================= 178 passed in 19.85s =============================
```
- **178 passed, 0 failed.**
- **0 deprecation warnings.**
- **0 pytest warnings.**
