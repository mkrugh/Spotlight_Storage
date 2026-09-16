#!/usr/bin/env bash
# Script to verify Docker build and container startup smoke test

set -euo pipefail

IMAGE_NAME="spotlight-storage-test:local"
CONTAINER_NAME="spotlight-smoke-test"
TEST_PORT="5099"

echo "=== 1. Building Docker image ==="
# Fallback to legacy builder if docker buildx is not installed
if ! docker buildx version > /dev/null 2>&1; then
    export DOCKER_BUILDKIT=0
fi
docker build -t "${IMAGE_NAME}" .

echo "=== 2. Starting test container on port ${TEST_PORT} ==="
docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${TEST_PORT}:5000" \
    "${IMAGE_NAME}"

cleanup() {
    echo "=== Cleaning up container ==="
    docker stop "${CONTAINER_NAME}" || true
    docker rm "${CONTAINER_NAME}" || true
}
trap cleanup EXIT

echo "=== 3. Waiting for server to become responsive ==="
for i in {1..15}; do
    if curl -s -f "http://localhost:${TEST_PORT}/" > /dev/null; then
        echo "Server is UP and responding to HTTP requests!"
        break
    fi
    echo "Waiting... ($i/15)"
    sleep 1
done

echo "=== 4. Verifying HTTP 200 on endpoints ==="
curl -s -f -o /dev/null -w "%{http_code}\n" "http://localhost:${TEST_PORT}/" | grep "200"
curl -s -f -o /dev/null -w "%{http_code}\n" "http://localhost:${TEST_PORT}/api/settings" | grep "200"

echo "=== Docker build and container smoke test PASSED successfully! ==="
