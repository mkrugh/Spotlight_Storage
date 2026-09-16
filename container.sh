#!/usr/bin/env bash
# ==============================================================================
# Spotlight Storage - Development Container Management Script
#
# Provides seamless build, start, stop, restart, logs, and shell access
# for running the application container during local development.
# ==============================================================================

set -euo pipefail

# Configuration
IMAGE_NAME="${IMAGE_NAME:-spotlight-storage:dev}"
CONTAINER_NAME="${CONTAINER_NAME:-spotlight-storage-dev}"
PORT="${PORT:-5000}"

# Resolve project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# ANSI Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Helper to check if docker is available and socket is accessible
check_docker() {
    if ! command -v docker > /dev/null 2>&1; then
        error "Docker is not installed or not in PATH."
        exit 1
    fi

    if ! docker info > /dev/null 2>&1; then
        # Check if user belongs to 'docker' group but current session lacks active credentials
        if [ -z "${CONTAINER_REEXEC:-}" ] && command -v sg > /dev/null 2>&1 && sg docker -c "docker info > /dev/null 2>&1"; then
            export CONTAINER_REEXEC=1
            local args=""
            if [ "$#" -gt 0 ]; then
                args=$(printf "%q " "$@")
            fi
            exec sg docker -c "\"${SCRIPT_DIR}/container.sh\" ${args}"
        fi

        error "Cannot connect to the Docker daemon at unix:///var/run/docker.sock."
        if [ -e /var/run/docker.sock ]; then
            warn "Permission denied accessing Docker socket."
            warn "Log out of your desktop session and back in for 'docker' group membership to take effect."
            warn "Alternatively, activate the group in your current terminal with: newgrp docker"
        else
            warn "Docker daemon does not appear to be running. Start it with: sudo systemctl start docker"
        fi
        exit 1
    fi
}

# Configure builder fallback if docker buildx plugin is not present
configure_builder() {
    if ! docker buildx version > /dev/null 2>&1; then
        export DOCKER_BUILDKIT=0
    fi
}

# Ensure host mount directories exist with user permissions
ensure_mount_directories() {
    mkdir -p "${SCRIPT_DIR}/data" "${SCRIPT_DIR}/images" "${SCRIPT_DIR}/logs"
}

# Check if container is running
is_running() {
    docker ps --filter "name=^/${CONTAINER_NAME}$" --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"
}

# Check if container exists (running or stopped)
container_exists() {
    docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"
}

# 1. BUILD COMMAND
build_image() {
    check_docker
    configure_builder
    info "Building Docker image: ${CYAN}${IMAGE_NAME}${NC}..."
    docker build -t "${IMAGE_NAME}" .
    success "Image ${IMAGE_NAME} built successfully!"
}

# 2. START / UP COMMAND
start_container() {
    check_docker
    ensure_mount_directories

    if is_running; then
        warn "Container ${CONTAINER_NAME} is already running!"
        info "Application URL: ${CYAN}http://localhost:${PORT}${NC}"
        return 0
    fi

    # If container exists but stopped, start it
    if container_exists; then
        info "Starting existing container: ${CONTAINER_NAME}..."
        docker start "${CONTAINER_NAME}" > /dev/null
    else
        # If image does not exist, build it first
        if ! docker image inspect "${IMAGE_NAME}" > /dev/null 2>&1; then
            info "Image ${IMAGE_NAME} not found. Building first..."
            build_image
        fi

        info "Starting new container ${CYAN}${CONTAINER_NAME}${NC} on port ${CYAN}${PORT}${NC}..."
        docker run -d \
            --name "${CONTAINER_NAME}" \
            -p "${PORT}:5000" \
            -v "${SCRIPT_DIR}/data:/app/data" \
            -v "${SCRIPT_DIR}/images:/app/images" \
            -v "${SCRIPT_DIR}/logs:/app/logs" \
            -v "${SCRIPT_DIR}/static/translations:/app/static/translations:ro" \
            -e TRANSLATIONS_DIR=/app/static/translations \
            --restart unless-stopped \
            "${IMAGE_NAME}" > /dev/null
    fi

    # Wait briefly and verify availability
    info "Waiting for service to initialize..."
    local ready=false
    for _ in {1..10}; do
        if curl -s -f "http://localhost:${PORT}/" > /dev/null 2>&1; then
            ready=true
            break
        fi
        sleep 1
    done

    if [ "$ready" = true ]; then
        success "Container started successfully!"
        echo -e "  🌐 Web Interface: ${CYAN}http://localhost:${PORT}${NC}"
        echo -e "  📊 API Settings:  ${CYAN}http://localhost:${PORT}/api/settings${NC}"
        echo -e "  📝 Logs command:   ${CYAN}./container.sh logs${NC}"
    else
        warn "Container started, but server is still initializing. Check logs with: ./container.sh logs"
    fi
}

# 3. STOP COMMAND
stop_container() {
    check_docker
    if ! container_exists; then
        info "Container ${CONTAINER_NAME} does not exist."
        return 0
    fi

    if is_running; then
        info "Stopping container ${CONTAINER_NAME}..."
        docker stop "${CONTAINER_NAME}" > /dev/null
        success "Container stopped."
    else
        info "Container ${CONTAINER_NAME} is already stopped."
    fi
}

# 4. RESTART COMMAND
restart_container() {
    info "Restarting container ${CONTAINER_NAME}..."
    stop_container
    start_container
}

# 5. REBUILD COMMAND
rebuild_container() {
    info "Rebuilding container and restarting..."
    clean_container
    build_image
    start_container
}

# 6. LOGS COMMAND
show_logs() {
    check_docker
    if ! container_exists; then
        error "Container ${CONTAINER_NAME} does not exist. Run './container.sh start' first."
        exit 1
    fi
    info "Streaming logs for ${CONTAINER_NAME} (Press Ctrl+C to exit)..."
    docker logs -f "${CONTAINER_NAME}"
}

# 7. STATUS COMMAND
show_status() {
    check_docker
    echo -e "${CYAN}=== Spotlight Storage Container Status ===${NC}"
    if is_running; then
        local health
        health="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CONTAINER_NAME}" 2>/dev/null || echo "unknown")"
        echo -e "Status:     ${GREEN}RUNNING${NC}"
        echo -e "Health:     ${GREEN}${health}${NC}"
        echo -e "Port:       http://localhost:${PORT}"
        echo ""
        docker ps --filter "name=^/${CONTAINER_NAME}$"
    elif container_exists; then
        echo -e "Status:     ${YELLOW}STOPPED${NC}"
        echo ""
        docker ps -a --filter "name=^/${CONTAINER_NAME}$"
    else
        echo -e "Status:     ${RED}NOT CREATED${NC}"
    fi
}

# 8. SHELL / EXEC COMMAND
open_shell() {
    check_docker
    if ! is_running; then
        error "Container ${CONTAINER_NAME} is not running. Run './container.sh start' first."
        exit 1
    fi
    info "Opening interactive bash shell in ${CONTAINER_NAME} (User: appuser)..."
    docker exec -it "${CONTAINER_NAME}" /bin/bash
}

# 9. CLEAN / DOWN COMMAND
clean_container() {
    check_docker
    if container_exists; then
        info "Removing container ${CONTAINER_NAME}..."
        docker rm -f "${CONTAINER_NAME}" > /dev/null 2>&1 || true
        success "Container removed."
    else
        info "No existing container to remove."
    fi
}

# 10. SMOKE TEST COMMAND
run_smoke_test() {
    info "Running container smoke test script..."
    "${SCRIPT_DIR}/tests/build/test_docker_build.sh"
}

# Usage / Help
show_help() {
    echo -e "${CYAN}Spotlight Storage - Container Helper${NC}"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo -e "  ${GREEN}start${NC} | ${GREEN}up${NC}        Start the container (builds image if missing)"
    echo -e "  ${GREEN}stop${NC}            Stop the running container"
    echo -e "  ${GREEN}restart${NC}         Restart the container"
    echo -e "  ${GREEN}build${NC}           Build or re-build the Docker image"
    echo -e "  ${GREEN}rebuild${NC}         Clean old container, rebuild image, and start fresh"
    echo -e "  ${GREEN}logs${NC}            Follow container logs in real time"
    echo -e "  ${GREEN}status${NC} | ${GREEN}ps${NC}      Check container state and health status"
    echo -e "  ${GREEN}shell${NC} | ${GREEN}exec${NC}    Open an interactive bash shell inside the container"
    echo -e "  ${GREEN}clean${NC} | ${GREEN}down${NC}    Stop and remove the container"
    echo -e "  ${GREEN}test${NC}            Run the automated Docker build smoke test"
    echo -e "  ${GREEN}help${NC}            Display this help menu"
    echo ""
    echo "Environment Variables (Optional):"
    echo "  PORT=5000             Host port to bind (default: 5000)"
    echo "  IMAGE_NAME=...        Custom image name (default: spotlight-storage:dev)"
    echo "  CONTAINER_NAME=...    Custom container name (default: spotlight-storage-dev)"
    echo ""
    echo "Examples:"
    echo "  ./container.sh start        # Start container on http://localhost:5000"
    echo "  PORT=8080 ./container.sh up # Start container on port 8080"
    echo "  ./container.sh logs         # View live application logs"
    echo "  ./container.sh rebuild      # Rebuild and restart after changing code"
}

# Command dispatch
case "${1:-help}" in
    start|up)
        check_docker "$@"
        start_container
        ;;
    stop)
        check_docker "$@"
        stop_container
        ;;
    restart)
        check_docker "$@"
        restart_container
        ;;
    build)
        check_docker "$@"
        build_image
        ;;
    rebuild)
        check_docker "$@"
        rebuild_container
        ;;
    logs)
        check_docker "$@"
        show_logs
        ;;
    status|ps)
        check_docker "$@"
        show_status
        ;;
    shell|exec|bash)
        check_docker "$@"
        open_shell
        ;;
    clean|down|rm)
        check_docker "$@"
        clean_container
        ;;
    test)
        check_docker "$@"
        run_smoke_test
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
