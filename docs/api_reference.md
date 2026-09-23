# API Reference

This document details the RESTful API exposed by Spotlight Storage. You can use these endpoints to programmatically manage your inventory, trigger LEDs, and integrate with home automation systems like Home Assistant or Node-RED.

**Base URL**: `http://localhost:5000` (or your host IP)

> [!IMPORTANT]
> All mutating requests (POST, PUT, DELETE) must include `Content-Type: application/json`. Form-encoded data is not accepted.

---

## Items

### `GET /api/items`
Returns a JSON array of all items in the inventory.
- **Response**: Array of item objects. Each item contains: `id`, `name`, `quantity`, `min_quantity`, `position` (JSON array of LED indices), `ip` (cabinet name or IP), `tags` (comma-separated string), `url`, `image`.

### `POST /api/items`
Create a new item.
- **Body**: `{"name": "required", "quantity": 0, "min_quantity": 0, "position": [], "ip": "", "tags": "", "url": ""}`
- **Response**: Returns the created item object with its assigned `id`. Returns `400 Bad Request` if `name` is missing.

### `GET /api/items/<id>`
Get a single item by its ID.
- **Response**: Item object or `404 Not Found`.

### `PUT /api/items/<id>`
Update an existing item.
- **Body**: Full item object.
- **Response**: Returns the updated item object.
- **Special Headers**:
  - `Update-Quantity: true` — only updates the `quantity` field.
  - `Update-Image: true` — only updates the `image` field.

### `DELETE /api/items/<id>`
Delete an item.
- **Response**: `{"success": true}`

### `POST /api/items/<id>`
Trigger a specific action for an item, such as illuminating its location.
- **Form Field**: `action=locate` (Note: This specific endpoint accepts form data for historical reasons, but standard JSON APIs below require application/json)
- **Response**: `{"success": true}` or an error message. Triggers WLED to illuminate the item's bin.

---

## WLED Controllers (ESP)

### `GET /api/esp`
Returns a JSON array of all configured WLED controllers.

### `POST /api/esp`
Create a new controller configuration.
- **Body**: `{"name": "", "esp_ip": "", "rows": N, "cols": N, "startTop": bool, "startLeft": bool, "serpentineDirection": "H"|"V", "sections": [...]}` (sections optional for multi-section setups)

### `GET /api/esp/<id>`
Get a single controller configuration.

### `PUT /api/esp/<id>`
Update a controller configuration.

### `DELETE /api/esp/<id>`
Delete a controller configuration.

### `POST /api/esp/test`
Test connectivity to a WLED controller.
- **Body**: `{"ip": "192.168.1.x"}`
- **Response**: `{"success": true, "device_name": "...", "version": "...", "led_count": N}` or `{"success": false, "error": "..."}`.
- **Action**: Also triggers a double-flash LED confirmation pulse on success.

---

## Builds / BOM Recipes

### `GET /api/builds`
Returns a list of builds (id, name, readiness).
- **Query Parameter**: `?include_parts=true` to include part lists and readiness status per part.

### `POST /api/builds`
Create a new build.
- **Body**: `{"name": "required", "items": [{"item_id": N, "quantity": N}, ...]}` (items array is optional)

### `GET /api/builds/<id>`
Get a specific build along with its required items.

### `PUT /api/builds/<id>`
Update a build's name and/or items.
- **Body**: `{"name": "", "items": [...]}`

### `DELETE /api/builds/<id>`
Delete a build.

### `POST /api/builds/<id>/execute`
Execute a build, deducting stock for all its parts.
- **Response**: `{"success": true, "warnings": [...]}`
- **Note**: `warnings` will list any parts that had insufficient stock.

---

## Tags

### `GET /api/tags`
Returns all tags currently in use as a JSON array of strings.

### `POST /api/tags`
Create a new tag.
- **Body**: `{"name": "required"}`

---

## Settings

### `GET /api/settings`
Returns current system settings.
- **Response**: Object containing `brightness`, `timeout`, `language`, `locate_color`, `standby_color`.

### `POST /api/settings`
Update system settings.
- **Body**: `{"brightness": 0-255, "timeout": seconds, "language": "en"|"de"|..., "locate_color": "#RRGGBB", "standby_color": "#RRGGBB"}`

---

## Utilities

### `GET /api/translations`
Returns a list of available language codes.
- **Example**: `["en", "de", "fr", "nl", "fi", "pl"]`

### `GET /api/vendor/check-updates`
Checks vendored frontend libraries for available upstream updates.
- **Response**: JSON report of library status.

---

## Image Upload

### `POST /upload`
Multipart file upload for item images.
- **Field Name**: `file`
- **Allowed Types**: png, jpg, jpeg, gif, webp
- **Response**: `{"image": "filename.ext"}`
- **Note**: Max size configured in app settings.

### `GET /images/<name>`
Serves an uploaded image by its filename.

---

## Examples

### List all items
```bash
curl http://localhost:5000/api/items
```

### Create an item
```bash
curl -X POST http://localhost:5000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name": "10k Resistor", "quantity": 100, "min_quantity": 20, "position": [5], "ip": "192.168.1.100", "tags": "resistor,tht", "url": ""}'
```

### Update item quantity
```bash
curl -X PUT http://localhost:5000/api/items/1 \
  -H "Content-Type: application/json" \
  -H "Update-Quantity: true" \
  -d '{"quantity": 90}'
```

### Locate an item's LEDs
```bash
curl -X POST http://localhost:5000/api/items/1 \
  -d "action=locate"
```

### Create a build with parts
```bash
curl -X POST http://localhost:5000/api/builds \
  -H "Content-Type: application/json" \
  -d '{"name": "LED Flasher Kit", "items": [{"item_id": 1, "quantity": 2}, {"item_id": 4, "quantity": 1}]}'
```

### Execute (deduct stock for) a build
```bash
curl -X POST http://localhost:5000/api/builds/1/execute \
  -H "Content-Type: application/json"
```

### Test an ESP connection
```bash
curl -X POST http://localhost:5000/api/esp/test \
  -H "Content-Type: application/json" \
  -d '{"ip": "192.168.1.100"}'
```

---

## Home Assistant & Node-RED Integration

Because Spotlight Storage uses standard REST JSON endpoints, it integrates easily into external automation platforms.

### Home Assistant
You can use the `rest_command` integration to trigger locate actions, or the `rest` sensor to monitor inventory levels of specific parts.

```yaml
rest_command:
  locate_resistor:
    url: "http://<spotlight-ip>:5000/api/items/1"
    method: post
    payload: "action=locate"
    content_type: "application/x-www-form-urlencoded"
```

### Node-RED
Use the standard **HTTP Request** node. Set the method to POST/PUT/GET, the URL to the API endpoint, and pass your JSON payload in `msg.payload`. Ensure you set the `Content-Type: application/json` header in an upstream template or function node for mutating requests.
