import contextlib
import json
import os
import shutil
import sqlite3
from collections import Counter, defaultdict

# Define the path for the combined database
COMBINED_DATABASE = os.getenv('COMBINED_DATABASE', 'data/combined_data.db')


def get_db_connection(database_name=None):
    """Function to get a database connection with WAL mode, foreign keys, and Row factory."""
    db_path = database_name or COMBINED_DATABASE
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute("PRAGMA journal_mode = WAL")
    except sqlite3.OperationalError:
        pass
    return conn


def init_db(database_name=None):
    """Initialize database tables, schema migrations, and performance indexes once."""
    db_path = database_name or COMBINED_DATABASE
    db_dir = os.path.dirname(db_path)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            conn.execute("PRAGMA journal_mode = WAL")
        except sqlite3.OperationalError:
            pass

        # Create items table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                link TEXT,
                image TEXT,
                position TEXT,
                quantity INTEGER,
                min_quantity INTEGER DEFAULT 3,
                ip TEXT,
                tags TEXT 
            )
        ''')

        # Create esp table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS esp (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                esp_ip TEXT,
                rows INTEGER,
                cols INTEGER,
                start_top TEXT,
                start_left TEXT,
                serpentine_direction TEXT,
                sections TEXT
            )
        ''')

        # Create settings table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                brightness INTEGER DEFAULT 100,
                timeout INTEGER DEFAULT 5,
                lightMode TEXT DEFAULT 'light',
                colors TEXT DEFAULT '["#00ff00", "#00ff00"]',
                language TEXT DEFAULT 'en'
            )
        ''')

        # Create builds table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS builds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            )
        ''')

        # Create build_items table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS build_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                build_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                quantity_needed INTEGER NOT NULL,
                FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE
            )
        ''')

        # Commit base schema
        conn.commit()

        # Check and add new columns if they don't exist
        cursor = conn.cursor()

        cursor.execute("PRAGMA table_info(settings)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'colors' not in columns:
            cursor.execute("ALTER TABLE settings ADD COLUMN colors TEXT DEFAULT '[\"#00ff00\", \"#00ff00\"]'")
            conn.commit()
        if 'language' not in columns:
            cursor.execute("ALTER TABLE settings ADD COLUMN language TEXT DEFAULT 'en'")
            conn.commit()

        cursor.execute("PRAGMA table_info(esp)")
        esp_columns = [column[1] for column in cursor.fetchall()]
        if 'sections' not in esp_columns:
            cursor.execute("ALTER TABLE esp ADD COLUMN sections TEXT")
            conn.commit()

        cursor.execute("PRAGMA table_info(items)")
        items_columns = [column[1] for column in cursor.fetchall()]
        if 'min_quantity' not in items_columns:
            cursor.execute("ALTER TABLE items ADD COLUMN min_quantity INTEGER DEFAULT 3")
            conn.commit()

        # Create missing performance indexes (M3)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_esp_ip ON esp(esp_ip)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_esp_name ON esp(name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_items_name ON items(name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_build_items_build_id ON build_items(build_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_build_items_item_id ON build_items(item_id)")
        conn.commit()


def create_combined_db():
    """Backward-compatible helper. Ensures DB is initialized and returns connection."""
    init_db(COMBINED_DATABASE)
    return get_db_connection(COMBINED_DATABASE)


# Function to read the data from the database
def read_items():
    with contextlib.closing(get_db_connection()) as conn:
        items = conn.execute('SELECT * FROM items').fetchall()
        return [dict(item) for item in items]


def write_item(item):
    min_qty = item.get('min_quantity')
    if min_qty is None or str(min_qty).strip() == '':
        min_qty = 3
    else:
        try:
            min_qty = int(min_qty)
        except (ValueError, TypeError):
            min_qty = 3

    pos = item.get('position')
    if isinstance(pos, int):
        pos = json.dumps([pos])
    elif isinstance(pos, (list, dict)):
        pos = json.dumps(pos)
    elif pos is None or str(pos).strip() in ('', 'None'):
        pos = '[]'
    else:
        pos = str(pos)

    with contextlib.closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO items (name, link, image, position, quantity, min_quantity, ip, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [item['name'], item.get('link', ''), item.get('image', ''), pos,
             item.get('quantity', 0), min_qty, item.get('ip', ''), item.get('tags', '')]
        )
        last_id = cursor.lastrowid
        conn.commit()
        return last_id


def update_item_image(item_id, new_image_url):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            cursor = conn.cursor()
            cursor.execute('UPDATE items SET image = ? WHERE id = ?', [new_image_url['image'], item_id])
            conn.commit()
        except sqlite3.Error as e:
            conn.rollback()
            print(e)
            raise


# Function to update data in the database
def update_item(id, data):
    min_qty = data.get('min_quantity')
    if min_qty is None or str(min_qty).strip() == '':
        min_qty = 3
    else:
        try:
            min_qty = int(min_qty)
        except (ValueError, TypeError):
            min_qty = 3

    pos = data.get('position')
    if isinstance(pos, int):
        pos = json.dumps([pos])
    elif isinstance(pos, (list, dict)):
        pos = json.dumps(pos)
    elif pos is None or str(pos).strip() in ('', 'None'):
        pos = '[]'
    else:
        pos = str(pos)

    with contextlib.closing(get_db_connection()) as conn:
        try:
            conn.execute(
                'UPDATE items SET name = ?, link = ?, image = ?, position = ?, quantity = ?, min_quantity = ?, ip = ?, tags = ? WHERE id = ?',
                [data['name'], data['link'], data['image'], pos, data['quantity'], min_qty, data['ip'], data['tags'], id]
            )
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            raise


def update_item_quantity(id, data):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            conn.execute(
                'UPDATE items SET quantity = ? WHERE id = ?',
                [data['quantity'], id]
            )
            conn.commit()
        except sqlite3.Error as e:
            conn.rollback()
            print(e)
            raise


def get_item(id):
    with contextlib.closing(get_db_connection()) as conn:
        item = conn.execute('SELECT * FROM items WHERE id = ?', [id]).fetchone()
        return dict(item) if item else None


def delete_item(id):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            conn.execute('DELETE FROM build_items WHERE item_id = ?', [id])
            conn.execute('DELETE FROM items WHERE id = ?', [id])
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            raise


def _format_esp_dict(row):
    if row is None:
        return None
    d = dict(row)
    sections_raw = d.get('sections')
    if sections_raw:
        if isinstance(sections_raw, str):
            try:
                d['sections'] = json.loads(sections_raw)
            except Exception:
                d['sections'] = None
        elif isinstance(sections_raw, list):
            d['sections'] = sections_raw
        else:
            d['sections'] = None
    else:
        d['sections'] = None
    return d


def get_esp_by_ip_excluding_id(ip, exclude_id=None):
    """Retrieve an ESP controller matching the given IP, optionally excluding a specific ID."""
    if not ip:
        return None
    ip_clean = str(ip).strip().lower()
    with contextlib.closing(get_db_connection()) as conn:
        if exclude_id is not None:
            try:
                ex_id = int(exclude_id)
            except (ValueError, TypeError):
                ex_id = exclude_id
            row = conn.execute(
                "SELECT * FROM esp WHERE LOWER(TRIM(esp_ip)) = ? AND id != ?",
                (ip_clean, ex_id)
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM esp WHERE LOWER(TRIM(esp_ip)) = ?",
                (ip_clean,)
            ).fetchone()
        return dict(row) if row else None


# Function to write ESP settings to the database
def write_esp_settings(esp_settings):
    sections = esp_settings.get('sections')
    if isinstance(sections, list) and len(sections) > 0:
        if not esp_settings.get('rows'):
            esp_settings['rows'] = sum(int(s.get('rows', 1)) for s in sections)
        if not esp_settings.get('cols'):
            esp_settings['cols'] = max(int(s.get('cols', 1)) for s in sections)
        if not esp_settings.get('startTop'):
            esp_settings['startTop'] = sections[0].get('start_top', 'Top')
        if not esp_settings.get('startLeft'):
            esp_settings['startLeft'] = sections[0].get('start_left', 'Left')
        if not esp_settings.get('serpentineDirection'):
            esp_settings['serpentineDirection'] = sections[0].get('serpentine_direction', 'Horizontal')

    required_fields = ['name', 'esp_ip', 'rows', 'cols', 'startTop', 'startLeft', 'serpentineDirection']
    if not all(field in esp_settings for field in required_fields):
        print("Missing required fields in esp_settings")
        return None

    target_ip = str(esp_settings.get('esp_ip') or '').strip()
    if target_ip:
        existing = get_esp_by_ip_excluding_id(target_ip)
        if existing:
            existing_name = existing.get('name') or 'Existing Controller'
            raise ValueError(f"A controller with IP '{target_ip}' already exists ('{existing_name}').")

    sections_str = json.dumps(sections) if sections else None

    with contextlib.closing(get_db_connection()) as conn:
        try:
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO esp (name, esp_ip, rows, cols, start_top, start_left, serpentine_direction, sections) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    esp_settings['name'],
                    esp_settings['esp_ip'],
                    int(esp_settings['rows']),
                    int(esp_settings['cols']),
                    esp_settings['startTop'],
                    esp_settings['startLeft'],
                    esp_settings['serpentineDirection'],
                    sections_str
                ])
            last_id = cursor.lastrowid
            conn.commit()
            return last_id
        except Exception as e:
            print(f"Database error: {e}")
            conn.rollback()
            return None


# Function to update ESP settings in the database
def update_esp_settings(id, esp_settings):
    sections = esp_settings.get('sections')
    if isinstance(sections, list) and len(sections) > 0:
        if not esp_settings.get('rows'):
            esp_settings['rows'] = sum(int(s.get('rows', 1)) for s in sections)
        if not esp_settings.get('cols'):
            esp_settings['cols'] = max(int(s.get('cols', 1)) for s in sections)
        if not esp_settings.get('startTop'):
            esp_settings['startTop'] = sections[0].get('start_top', 'Top')
        if not esp_settings.get('startLeft'):
            esp_settings['startLeft'] = sections[0].get('start_left', 'Left')
        if not esp_settings.get('serpentineDirection'):
            esp_settings['serpentineDirection'] = sections[0].get('serpentine_direction', 'Horizontal')

    target_ip = str(esp_settings.get('esp_ip') or '').strip()
    if target_ip:
        existing = get_esp_by_ip_excluding_id(target_ip, exclude_id=id)
        if existing:
            existing_name = existing.get('name') or 'Existing Controller'
            raise ValueError(f"A controller with IP '{target_ip}' already exists ('{existing_name}').")

    sections_str = json.dumps(sections) if sections else None

    with contextlib.closing(get_db_connection()) as conn:
        try:
            conn.execute(
                'UPDATE esp SET name = ?, esp_ip = ?, rows = ?, cols = ?, start_top = ?, start_left = ?, serpentine_direction = ?, sections = ? WHERE id = ?',
                [
                    esp_settings['name'],
                    esp_settings['esp_ip'],
                    int(esp_settings['rows']),
                    int(esp_settings['cols']),
                    esp_settings['startTop'],
                    esp_settings['startLeft'],
                    esp_settings['serpentineDirection'],
                    sections_str,
                    id
                ])
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            raise


def enrich_esp_metrics(esps, conn=None):
    """
    Enriches a list of ESP dictionaries with:
    - total_bins (int): Total drawer/LED capacity
    - occupied_bins (int): Number of unique LED indices assigned in items table
    - fill_percentage (float): Percentage of bins occupied (0.0 to 100.0)
    """
    if not esps:
        return esps

    def get_total_bins(esp):
        sections = esp.get('sections')
        if isinstance(sections, list) and len(sections) > 0:
            return sum(
                int(s.get('rows', 1)) * int(s.get('cols', 1))
                for s in sections
                if isinstance(s, dict)
            )
        try:
            r = int(esp.get('rows') or 0)
            c = int(esp.get('cols') or 0)
            return r * c
        except (ValueError, TypeError):
            return 0

    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True

    try:
        id_to_esp = {}
        lookup_to_id = {}
        query_targets = set()

        for esp in esps:
            esp_id = esp.get('id')
            id_to_esp[esp_id] = esp
            if esp.get('esp_ip'):
                ip_clean = str(esp['esp_ip']).strip().lower()
                lookup_to_id[ip_clean] = esp_id
                query_targets.add(ip_clean)
            if esp_id is not None:
                id_clean = str(esp_id).strip().lower()
                lookup_to_id[id_clean] = esp_id
                query_targets.add(id_clean)

        if not query_targets:
            items = []
        else:
            placeholders = ', '.join(['?'] * len(query_targets))
            items = conn.execute(
                f"SELECT ip, position FROM items WHERE LOWER(TRIM(ip)) IN ({placeholders}) AND position IS NOT NULL AND position != '' AND position != '[]'",
                list(query_targets)
            ).fetchall()

        occupied_leds = {esp.get('id'): set() for esp in esps}

        for item in items:
            item_ip = str(item['ip'] or '').strip().lower()
            target_esp_id = lookup_to_id.get(item_ip)
            if target_esp_id is None or target_esp_id not in occupied_leds:
                continue

            pos_val = item['position']
            parsed = []
            if isinstance(pos_val, str):
                try:
                    parsed = json.loads(pos_val)
                except Exception:
                    parsed = []
            elif isinstance(pos_val, (list, tuple)):
                parsed = pos_val
            elif isinstance(pos_val, int):
                parsed = [pos_val]

            if isinstance(parsed, int):
                occupied_leds[target_esp_id].add(parsed)
            elif isinstance(parsed, (list, tuple)):
                for idx in parsed:
                    if isinstance(idx, int):
                        occupied_leds[target_esp_id].add(idx)
                    elif isinstance(idx, str) and idx.isdigit():
                        occupied_leds[target_esp_id].add(int(idx))

        for esp in esps:
            total = get_total_bins(esp)
            occupied = len(occupied_leds.get(esp.get('id'), set()))
            esp['total_bins'] = total
            esp['occupied_bins'] = occupied
            if total > 0:
                esp['fill_percentage'] = round((occupied / total) * 100, 1)
            else:
                esp['fill_percentage'] = 0.0

        return esps
    finally:
        if close_conn and conn:
            conn.close()


# Function to get ESP settings from the database by ID
def get_esp_settings(id, include_metrics=True):
    with contextlib.closing(get_db_connection()) as conn:
        esp_settings = conn.execute('SELECT * FROM esp WHERE id = ?', [id]).fetchone()
        if esp_settings:
            formatted = _format_esp_dict(esp_settings)
            if include_metrics and formatted:
                enrich_esp_metrics([formatted], conn)
            return formatted
        return None


def read_esp(include_metrics=True):
    with contextlib.closing(get_db_connection()) as conn:
        esps = conn.execute('SELECT * FROM esp').fetchall()
        result = [_format_esp_dict(esp) for esp in esps]
        if include_metrics and result:
            enrich_esp_metrics(result, conn)
        return result


# Function to delete ESP settings from the database by ID
def delete_esp_settings(id):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            conn.execute('DELETE FROM esp WHERE id = ?', [id])
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            raise


def get_esp_settings_by_id(id, include_metrics=True):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM esp WHERE id = ?', (id,))
            row = cursor.fetchone()

            if row is None:
                return None

            esp_settings = {col[0]: row[idx] for idx, col in enumerate(cursor.description)}
            formatted = _format_esp_dict(esp_settings)
            if include_metrics and formatted:
                enrich_esp_metrics([formatted], conn)
            return formatted

        except Exception as e:
            print(f"Database error: {e}")
            return None


def get_esp_settings_by_ip(ip, include_metrics=True):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM esp WHERE esp_ip = ?', (ip,))
            row = cursor.fetchone()

            if row is None:
                return None

            esp_settings = {col[0]: row[idx] for idx, col in enumerate(cursor.description)}
            formatted = _format_esp_dict(esp_settings)
            if include_metrics and formatted:
                enrich_esp_metrics([formatted], conn)
            return formatted

        except Exception as e:
            print(f"Database error: {e}")
            return None


def get_ip_by_name(esp_name):
    with contextlib.closing(get_db_connection()) as conn:
        esp = conn.execute('SELECT esp_ip FROM esp WHERE name = ?', (esp_name,)).fetchone()
        return esp['esp_ip'] if esp else None


# Function to read settings from the database
def read_settings():
    with contextlib.closing(get_db_connection()) as conn:
        try:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM settings')
            settings = cursor.fetchone()
            if settings is None:
                return {
                    'brightness': 100,
                    'timeout': 5,
                    'lightMode': 'light',
                    'colors': ['#ffff00', '#00ffff'],
                    'language': 'en'
                }
            else:
                settings_dict = dict(zip([column[0] for column in cursor.description], settings))
                if 'colors' in settings_dict:
                    try:
                        settings_dict['colors'] = json.loads(settings_dict['colors'])
                    except (ValueError, TypeError):
                        settings_dict['colors'] = ['#00ff00', '#00ff00']
                return settings_dict
        except sqlite3.Error as e:
            print(f"SQLite error while reading settings: {e}")
            return {}


# Function to update settings in the database
def update_settings(settings):
    colors_json = json.dumps(settings['colors'])
    with contextlib.closing(get_db_connection()) as conn:
        try:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM settings')
            cursor.execute('''
                INSERT INTO settings (brightness, timeout, lightMode, colors, language)
                VALUES (?, ?, ?, ?, ?)
            ''', [settings['brightness'], settings['timeout'], settings['lightMode'], colors_json, settings['language']])
            conn.commit()
        except sqlite3.Error as e:
            print(f"SQLite error while updating settings: {e}")
            conn.rollback()
            raise


def get_all_tags():
    with contextlib.closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT tags FROM items')
        raw_tags = [tag['tags'] for tag in cursor.fetchall() if tag['tags']]

        # Parse tags, defensively handling malformed JSON and legacy formats
        tags = []
        for raw_tag in raw_tags:
            try:
                parsed = json.loads(raw_tag)
                if isinstance(parsed, list):
                    tags.extend(set(str(t).strip() for t in parsed if str(t).strip()))
                elif isinstance(parsed, str) and parsed.strip():
                    tags.append(parsed.strip())
            except (json.JSONDecodeError, TypeError, ValueError):
                tags.extend(set(t.strip() for t in raw_tag.split(',') if t.strip()))
        tag_counts = Counter(tags)
        unique_tags_with_count = [{'tag': tag, 'count': count} for tag, count in tag_counts.items()]
        unique_tags_with_count.sort(key=lambda x: x['count'], reverse=True)
        return unique_tags_with_count


def read_builds(include_parts=False):
    with contextlib.closing(get_db_connection()) as conn:
        builds = conn.execute('SELECT * FROM builds').fetchall()
        result = [dict(b) for b in builds]
        if include_parts and result:
            rows = conn.execute(
                '''SELECT bi.id, bi.build_id, bi.item_id, bi.quantity_needed,
                          i.name, i.quantity, i.image
                   FROM build_items bi
                   JOIN items i ON bi.item_id = i.id'''
            ).fetchall()
            items_by_build = defaultdict(list)
            for r in rows:
                d = dict(r)
                build_id = d.pop('build_id')
                items_by_build[build_id].append(d)
            for b in result:
                b['items'] = items_by_build.get(b['id'], [])
        elif include_parts:
            for b in result:
                b['items'] = []
        return result


def write_build(name):
    with contextlib.closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT INTO builds (name) VALUES (?)', [name])
        last_id = cursor.lastrowid
        conn.commit()
        return last_id


def update_build_name(build_id, name):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            conn.execute('UPDATE builds SET name = ? WHERE id = ?', [name, build_id])
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            raise


def delete_build(build_id):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            conn.execute('DELETE FROM builds WHERE id = ?', [build_id])
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            raise


def get_build_items(build_id):
    with contextlib.closing(get_db_connection()) as conn:
        rows = conn.execute(
            '''SELECT bi.id, bi.item_id, bi.quantity_needed,
                      i.name, i.quantity, i.image
               FROM build_items bi
               JOIN items i ON bi.item_id = i.id
               WHERE bi.build_id = ?''',
            [build_id]
        ).fetchall()
        return [dict(r) for r in rows]


def set_build_items(build_id, items):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            conn.execute('DELETE FROM build_items WHERE build_id = ?', [build_id])
            for item in items:
                conn.execute(
                    'INSERT INTO build_items (build_id, item_id, quantity_needed) VALUES (?, ?, ?)',
                    [build_id, item['item_id'], item['quantity_needed']]
                )
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            raise


def execute_build(build_id):
    with contextlib.closing(get_db_connection()) as conn:
        try:
            rows = conn.execute(
                'SELECT bi.item_id, bi.quantity_needed, i.quantity, i.name '
                'FROM build_items bi JOIN items i ON bi.item_id = i.id '
                'WHERE bi.build_id = ?', [build_id]
            ).fetchall()

            warnings = []
            for row in rows:
                if row['quantity'] < row['quantity_needed']:
                    warnings.append({'name': row['name'], 'have': row['quantity'], 'need': row['quantity_needed']})
                new_qty = max(0, row['quantity'] - row['quantity_needed'])
                conn.execute('UPDATE items SET quantity = ? WHERE id = ?', [new_qty, row['item_id']])

            conn.commit()
            return warnings
        except sqlite3.Error:
            conn.rollback()
            raise


# Migration only needed if you are coming from an older version.

DATABASE = 'data.db'
DATABASE_ESP = 'esp.db'
DATABASE_SETTING = 'settings.db'


def migrate_items():
    """Migrate items from data.db to combined_data.db."""
    conn_data = get_db_connection(DATABASE)
    conn_combined = sqlite3.connect(COMBINED_DATABASE)

    # Fetch all items from the source database
    items = conn_data.execute('SELECT * FROM items').fetchall()

    # Check if 'tags' column exists in the source database
    column_names = [description[0] for description in conn_data.execute('PRAGMA table_info(items)').fetchall()]
    has_tags_column = 'tags' in column_names

    for item in items:
        # Extract the first 6 columns
        columns_to_insert = [
            item['name'], item['link'], item['image'],
            item['position'], item['quantity'], item['ip']
        ]

        # Add 'tags' column if it exists, otherwise, add an empty string
        if has_tags_column:
            columns_to_insert.append(item['tags'])
        else:
            columns_to_insert.append("")

        # Insert data into the destination database
        conn_combined.execute(
            'INSERT INTO items (name, link, image, position, quantity, ip, tags) VALUES (?, ?, ?, ?, ?, ?, ?)',
            columns_to_insert
        )

    # Commit changes and close connections
    conn_combined.commit()
    conn_data.close()
    conn_combined.close()


def migrate_esp_settings():
    """Migrate ESP settings from esp.db to combined_data.db."""
    conn_esp = get_db_connection(DATABASE_ESP)
    esp_settings_list = conn_esp.execute('SELECT * FROM esp').fetchall()
    conn_combined = sqlite3.connect(COMBINED_DATABASE)
    for esp_settings in esp_settings_list:
        conn_combined.execute(
            'INSERT INTO esp (name, esp_ip, rows, cols, start_top, start_left, serpentine_direction) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [esp_settings['name'], esp_settings['esp_ip'], esp_settings['rows'], esp_settings['cols'],
             esp_settings['start_top'], esp_settings['start_left'], esp_settings['serpentine_direction']]
        )

    conn_combined.commit()
    conn_esp.close()
    conn_combined.close()


def migrate_settings():
    """Migrate general settings from settings.db to combined_data.db."""
    conn_settings = get_db_connection(DATABASE_SETTING)
    settings = conn_settings.execute('SELECT * FROM settings').fetchone()

    conn_combined = sqlite3.connect(COMBINED_DATABASE)
    conn_combined.execute(
        'INSERT INTO settings (brightness, timeout, lightMode) VALUES (?, ?, ?)',
        [settings['brightness'], settings['timeout'], settings['lightMode']]
    )

    conn_combined.commit()
    conn_settings.close()
    conn_combined.close()


def is_database_empty(database_name, table_name):
    """Check if a table in a database is empty."""
    conn = get_db_connection(database_name)
    cursor = conn.cursor()
    cursor.execute(f'SELECT COUNT(*) FROM {table_name}')
    count = cursor.fetchone()[0]
    conn.close()
    return count


def should_perform_migration(database_path, table_name):
    """Check if migration should be performed for a specific database and table."""

    # Check if the individual database exists
    if os.path.exists(database_path):
        # Check if the combined database is not empty for the specified table
        return not is_database_empty(COMBINED_DATABASE, table_name)
    return False


def perform_migration():
    """Perform migration."""
    create_combined_db()
    # Check and migrate items
    if should_perform_migration(DATABASE, 'items'):
        migrate_items()
        print("Items migration successful.")
    # Check and migrate ESP settings
    if should_perform_migration(DATABASE_ESP, 'esp'):
        migrate_esp_settings()
        print("ESP settings migration successful.")
    # Check and migrate general settings
    if should_perform_migration(DATABASE_SETTING, 'settings'):
        migrate_settings()
        print("General settings migration successful.")

    # Call the function to perform the check and move
    move_db_to_data_dir()


def move_db_to_data_dir():
    main_dir_db = 'combined_data.db'  # The original path in the main directory
    data_dir_db = 'data/combined_data.db'  # The new path inside the data directory

    # Check if the database exists in the main directory
    if os.path.exists(main_dir_db):
        # Ensure the data directory exists, create if it doesn't
        if not os.path.exists('data'):
            os.makedirs('data')

        # Move the database to the data directory
        shutil.move(main_dir_db, data_dir_db)
        print(f"Database moved to {data_dir_db}")


# Perform migration
perform_migration()
