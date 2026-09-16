import json
import os
import shutil
import sqlite3
from collections import Counter

# Define the path for the combined database
COMBINED_DATABASE = os.getenv('COMBINED_DATABASE', 'data/combined_data.db')


def create_combined_db():
    # Ensure the database directory exists if specified
    db_dir = os.path.dirname(COMBINED_DATABASE)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir)  # Connect to the combined database

    conn_combined = sqlite3.connect(COMBINED_DATABASE)
    conn_combined.row_factory = sqlite3.Row
    conn_combined.execute("PRAGMA foreign_keys = ON")

    # Create items table in the combined database
    conn_combined.execute('''
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                link TEXT,
                image TEXT,
                position TEXT,
                quantity INTEGER,
                ip TEXT,
                tags TEXT 
            )
        ''')

    # Create esp table in the combined database
    conn_combined.execute('''
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

    # Create settings table in the combined database
    conn_combined.execute('''
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
    conn_combined.execute('''
            CREATE TABLE IF NOT EXISTS builds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            )
        ''')

    # Create build_items table
    conn_combined.execute('''
            CREATE TABLE IF NOT EXISTS build_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                build_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                quantity_needed INTEGER NOT NULL,
                FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE
            )
        ''')

    # Commit the changes
    conn_combined.commit()

    # Check and add new columns if they don't exist
    cursor = conn_combined.cursor()

    # Check for the existence of 'colors' and 'language' column in settings
    cursor.execute("PRAGMA table_info(settings)")
    columns = [column[1] for column in cursor.fetchall()]
    if 'colors' not in columns:
        cursor.execute("ALTER TABLE settings ADD COLUMN colors TEXT DEFAULT '[\"#00ff00\", \"#00ff00\"]'")
        conn_combined.commit()
    if 'language' not in columns:
        cursor.execute("ALTER TABLE settings ADD COLUMN language TEXT DEFAULT 'en'")
        conn_combined.commit()

    # Check for the existence of 'sections' column in esp
    cursor.execute("PRAGMA table_info(esp)")
    esp_columns = [column[1] for column in cursor.fetchall()]
    if 'sections' not in esp_columns:
        cursor.execute("ALTER TABLE esp ADD COLUMN sections TEXT")
        conn_combined.commit()

    return conn_combined


# Function to read the data from the database
def read_items():
    conn = create_combined_db()
    items = conn.execute('SELECT * FROM items').fetchall()
    conn.close()
    return [dict(item) for item in items]


def write_item(item):
    conn = create_combined_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO items (name, link, image, position, quantity, ip, tags) VALUES (?, ?, ?, ?, ?, ?, ?)',
                   [item['name'], item.get('link', ''), item.get('image', ''), item.get('position', '[]'),
                    item.get('quantity', 0), item.get('ip', ''), item.get('tags', '')])
    lastId = cursor.lastrowid
    conn.commit()
    conn.close()
    return lastId


def update_item_image(item_id, new_image_url):
    conn = create_combined_db()
    try:
        cursor = conn.cursor()
        # Update the image of the item with the specified item_id
        cursor.execute('UPDATE items SET image = ? WHERE id = ?', [new_image_url['image'], item_id])
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        print(e)
        raise
    finally:
        conn.close()


# Function to update data in the database
def update_item(id, data):
    conn = create_combined_db()

    try:

        conn.execute(
            'UPDATE items SET name = ?, link = ?, image = ?, position = ?, quantity = ?, ip = ?, tags = ? WHERE id = ?',
            [data['name'], data['link'], data['image'], data['position'], data['quantity'], data['ip'], data['tags'],
             id])
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_item_quantity(id, data):
    conn = create_combined_db()
    try:

        conn.execute(
            'UPDATE items SET  quantity = ? WHERE id = ?',
            [data['quantity'], id])
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        print(e)
        raise
    finally:
        conn.close()


def get_item(id):
    conn = create_combined_db()
    item = conn.execute('SELECT * FROM items WHERE id = ?', [id]).fetchone()
    conn.close()
    return dict(item) if item else None


def delete_item(id):
    conn = create_combined_db()
    conn.execute('DELETE FROM build_items WHERE item_id = ?', [id])
    conn.execute('DELETE FROM items WHERE id = ?', [id])
    conn.commit()
    conn.close()


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

    sections_str = json.dumps(sections) if sections else None

    conn = create_combined_db()
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
        lastId = cursor.lastrowid
        conn.commit()
    except Exception as e:
        print(f"Database error: {e}")
        conn.rollback()
        lastId = None
    finally:
        conn.close()

    return lastId


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

    sections_str = json.dumps(sections) if sections else None

    conn = create_combined_db()
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
    except sqlite3.Error as e:
        conn.rollback()
        raise
    finally:
        conn.close()


# Function to get ESP settings from the database by ID
def get_esp_settings(id):
    conn = create_combined_db()
    esp_settings = conn.execute('SELECT * FROM esp WHERE id = ?', [id]).fetchone()
    conn.close()
    if esp_settings:
        return _format_esp_dict(esp_settings)
    else:
        return None  # Return None if no matching settings are found


def read_esp():
    conn = create_combined_db()
    esps = conn.execute('SELECT * FROM esp').fetchall()
    conn.close()
    return [_format_esp_dict(esp) for esp in esps]


# Function to delete ESP settings from the database by ID
def delete_esp_settings(id):
    conn = create_combined_db()
    try:
        conn.execute('DELETE FROM esp WHERE id = ?', [id])
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_esp_settings_by_id(id):
    conn = create_combined_db()  # Get a database connection
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM esp WHERE id = ?', (id,))
        row = cursor.fetchone()

        if row is None:
            return None  # No record found for the given IP

        # Convert the row to a dictionary
        esp_settings = {col[0]: row[idx] for idx, col in enumerate(cursor.description)}

        return _format_esp_dict(esp_settings)

    except Exception as e:
        print(f"Database error: {e}")
        return None

    finally:
        conn.close()


def get_esp_settings_by_ip(ip):
    conn = create_combined_db()  # Get a database connection
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM esp WHERE esp_ip = ?', (ip,))
        row = cursor.fetchone()

        if row is None:
            return None  # No record found for the given IP

        # Convert the row to a dictionary
        esp_settings = {col[0]: row[idx] for idx, col in enumerate(cursor.description)}
        return _format_esp_dict(esp_settings)

    except Exception as e:
        print(f"Database error: {e}")
        return None

    finally:
        conn.close()


def get_ip_by_name(esp_name):
    conn = create_combined_db()
    esp = conn.execute('SELECT esp_ip FROM esp WHERE name = ?', (esp_name,)).fetchone()
    conn.close()
    return esp['esp_ip'] if esp else None


# Function to read settings from the database
def read_settings():
    conn = create_combined_db()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM settings')
        settings = cursor.fetchone()
        if settings is None:
            print("No settings found in the database.")
            return {
                'brightness': 100,
                'timeout': 5,
                'lightMode': 'light',
                'colors': ['#ffff00', '#00ffff'],
                'language': 'en'
            }
        else:
            # Convert the settings row to a dictionary
            settings_dict = dict(zip([column[0] for column in cursor.description], settings))
            # Deserialize the colors field if it exists
            if 'colors' in settings_dict:
                try:
                    settings_dict['colors'] = json.loads(settings_dict['colors'])
                except (ValueError, TypeError):
                    # Older databases may contain an invalid default like '[#00ff00, #00ff00]'
                    settings_dict['colors'] = ['#00ff00', '#00ff00']
            else:
                print("No 'colors' field found in the settings.")
            return settings_dict
    except sqlite3.Error as e:
        print(f"SQLite error while reading settings: {e}")
        return {}
    finally:
        conn.close()


# Function to update settings in the database
def update_settings(settings):
    try:
        # Serialize the colors list to a JSON string
        settings['colors'] = json.dumps(settings['colors'])
        conn = create_combined_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM settings')  # Clear existing settings
        cursor.execute('''
            INSERT INTO settings (brightness, timeout, lightMode, colors, language)
            VALUES (?, ?, ?, ?, ?)
        ''', [settings['brightness'], settings['timeout'], settings['lightMode'], settings['colors'], settings['language']])
        conn.commit()
    except sqlite3.Error as e:
        print(f"SQLite error while updating settings: {e}")
        raise
    finally:
        conn.close()


def get_all_tags():
    conn = create_combined_db()
    cursor = conn.cursor()

    try:
        # Fetch all distinct tags from the items table
        cursor.execute('SELECT tags FROM items')
        raw_tags = [tag['tags'] for tag in cursor.fetchall() if tag['tags']]

        # Parse tags, defensively handling malformed JSON and legacy formats
        tags = []
        for raw_tag in raw_tags:
            try:
                parsed = json.loads(raw_tag)
                if isinstance(parsed, list):
                    tags.extend(parsed)
                elif isinstance(parsed, str):
                    tags.append(parsed)
            except (json.JSONDecodeError, TypeError, ValueError):
                tags.extend([t.strip() for t in raw_tag.split(',') if t.strip()])
        # Count the occurrences of each tag
        tag_counts = Counter(tags)
        unique_tags_with_count = [{'tag': tag, 'count': count} for tag, count in tag_counts.items()]
        unique_tags_with_count.sort(key=lambda x: x['count'], reverse=True)
        return unique_tags_with_count
    finally:
        conn.close()


def read_builds():
    conn = create_combined_db()
    builds = conn.execute('SELECT * FROM builds').fetchall()
    conn.close()
    return [dict(b) for b in builds]


def write_build(name):
    conn = create_combined_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO builds (name) VALUES (?)', [name])
    last_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return last_id


def update_build_name(build_id, name):
    conn = create_combined_db()
    try:
        conn.execute('UPDATE builds SET name = ? WHERE id = ?', [name, build_id])
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_build(build_id):
    conn = create_combined_db()
    conn.execute('DELETE FROM builds WHERE id = ?', [build_id])
    conn.commit()
    conn.close()


def get_build_items(build_id):
    conn = create_combined_db()
    rows = conn.execute(
        '''SELECT bi.id, bi.item_id, bi.quantity_needed,
                  i.name, i.quantity, i.image
           FROM build_items bi
           JOIN items i ON bi.item_id = i.id
           WHERE bi.build_id = ?''',
        [build_id]
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def set_build_items(build_id, items):
    conn = create_combined_db()
    try:
        conn.execute('DELETE FROM build_items WHERE build_id = ?', [build_id])
        for item in items:
            conn.execute(
                'INSERT INTO build_items (build_id, item_id, quantity_needed) VALUES (?, ?, ?)',
                [build_id, item['item_id'], item['quantity_needed']]
            )
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute_build(build_id):
    conn = create_combined_db()
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
    except sqlite3.Error as e:
        conn.rollback()
        raise
    finally:
        conn.close()


# Migration only needed if you are coming from an older version.

DATABASE = 'data.db'
DATABASE_ESP = 'esp.db'
DATABASE_SETTING = 'settings.db'


def get_db_connection(database_name):
    """Function to get a database connection."""
    conn = sqlite3.connect(database_name)
    conn.row_factory = sqlite3.Row
    return conn


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
