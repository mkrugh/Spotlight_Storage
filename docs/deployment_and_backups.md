# Deployment and Backups

Spotlight Storage is designed to run entirely on your local network. There is no cloud connectivity, no telemetry, and no external dependencies required after installation.

## Deployment Options

### Option A: Linux & macOS via `container.sh`
The included `container.sh` script simplifies managing the Docker container on Unix-like systems.

- **`./container.sh start`** — Starts the Spotlight Storage container in the background.
- **`./container.sh stop`** — Stops the running container.
- **`./container.sh status`** — Shows whether the container is currently running.
- **`./container.sh logs`** — Tails the live logs from the container.
- **`./container.sh rebuild`** — Stops the container, rebuilds the Docker image, and starts it again.
- **`./container.sh test`** — Runs the automated test suite.

### Option B: Windows via `install.bat`
Windows users can use the `install.bat` script.
1. Install Docker Desktop.
2. Clone or download the repository.
3. Double-click `install.bat`.
4. Follow the prompts to build and start the container.
5. Access the app at `http://localhost:5000`.

### Option C: Docker Compose
For manual control, you can use `docker-compose`. Here is the full `docker-compose.yaml` configuration:

```yaml
services:
  spotlight-storage:
    container_name: SpotlightStorage
    build: .
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - ./data:/app/data
      - ./images:/app/images
      - ./logs:/app/logs
      - ./static/translations:/app/static/translations:ro
    environment:
      - TRANSLATIONS_DIR=/app/static/translations
```
- `volumes:` maps your local directories into the container to preserve data.
- `static/translations` is mounted read-only (`:ro`) as it is part of the repository.

### Option D: Docker Run
If you prefer not to use Compose, you can run the container directly:
```bash
docker build -t spotlight-storage .
docker run -d \
  --name SpotlightStorage \
  --restart unless-stopped \
  -p 5000:5000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/images:/app/images \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/static/translations:/app/static/translations:ro \
  -e TRANSLATIONS_DIR=/app/static/translations \
  spotlight-storage
```

## Data Persistence & Backups

All user data lives in two critical locations mounted as Docker volumes:
- `data/` — Contains `combined_data.db`, the SQLite database storing all parts, cabinets, builds, tags, and settings.
- `images/` — Contains all uploaded part photos.

*(Note: Translations are in `static/translations/` but are part of the repository, not user data).*

**To preserve everything, you only need to back up the `data/` and `images/` directories.**

### Backup Procedure
You can create a simple copy of the directories:
```bash
cp -r ./data ./data_backup && cp -r ./images ./images_backup
```
Or create a compressed archive:
```bash
tar czf spotlight_backup_$(date +%Y%m%d).tar.gz data/ images/
```

### Restore Procedure
1. Stop the container (`./container.sh stop` or `docker compose down`).
2. Restore the backed-up `data/` and `images/` directories to the project root.
3. Restart the container (`./container.sh start` or `docker compose up -d`).

## Upgrading
To update to the latest version of Spotlight Storage:
1. Pull the latest code: `git pull`
2. Rebuild the container:
   - Linux/macOS: `./container.sh rebuild`
   - Windows: Re-run `install.bat`

## Access & Configuration

### LAN Access
You can access Spotlight Storage from phones, tablets, or other computers on the same network using your host machine's IP address: `http://<host-ip>:5000`.
- **Linux:** Find your IP with `ip addr`
- **macOS:** Find your IP with `ifconfig`
- **Windows:** Find your IP with `ipconfig`

### Port Customization
By default, the app listens on port 5000. To change this, edit the `ports:` mapping in `docker-compose.yaml`. For example, to expose it on port 8080:
```yaml
    ports:
      - "8080:5000"
```

### Reverse Proxy / HTTPS
If you wish to access Spotlight Storage securely over HTTPS, you can place a reverse proxy like Nginx or Caddy in front of it. Note that the container internally exposes port 5000.

**Minimal Caddyfile Example:**
```caddyfile
spotlight.yourdomain.com {
    reverse_proxy localhost:5000
}
```

**Minimal Nginx Location Block:**
```nginx
server {
    server_name spotlight.yourdomain.com;
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Non-Root Docker Execution
For enhanced security, the Docker container runs internally as a non-root user (uid `1000`) by default. You do not need to pass any special flags to enable this.

---
[Return to Main README](../README.md)
