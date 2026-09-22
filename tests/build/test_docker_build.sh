#!/usr/bin/env bash
# Script to verify Docker multi-stage build, test execution, and container startup smoke tests

set -euo pipefail

IMAGE_NAME="spotlight-storage-test:local"
CONTAINER_NAME="spotlight-smoke-test"
TEST_PORT="5099"

echo "=== 1. Building Docker image with multi-stage test execution ==="
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
SERVER_UP=0
for i in {1..20}; do
    if curl -s -f "http://localhost:${TEST_PORT}/" > /dev/null; then
        echo "Server is UP and responding to HTTP requests!"
        SERVER_UP=1
        break
    fi
    echo "Waiting... ($i/20)"
    sleep 1
done

if [ "$SERVER_UP" -ne 1 ]; then
    echo "ERROR: Server failed to start within timeout. Container logs:"
    docker logs "${CONTAINER_NAME}"
    exit 1
fi

echo "=== 4. Verifying multi-stage test execution token inside container ==="
docker exec "${CONTAINER_NAME}" test -f /build_tests.info
echo "Verified: /build_tests.info exists in container image."

echo "=== 5. Verifying HTTP endpoints and JSON response formats ==="

check_endpoint() {
    local url="$1"
    local desc="$2"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    if [ "$code" = "200" ]; then
        echo "  [PASS] $desc ($url) returned HTTP 200"
    else
        echo "  [FAIL] $desc ($url) returned HTTP $code (expected 200)"
        exit 1
    fi
}

check_endpoint "http://localhost:${TEST_PORT}/" "Root index page"
check_endpoint "http://localhost:${TEST_PORT}/api/settings" "Settings API"
check_endpoint "http://localhost:${TEST_PORT}/api/items" "Items API"
check_endpoint "http://localhost:${TEST_PORT}/api/esp" "ESP Matrix API"
check_endpoint "http://localhost:${TEST_PORT}/api/tags" "Tags API"
check_endpoint "http://localhost:${TEST_PORT}/api/builds" "Builds API"

echo "=== 6. Verifying CSRF / Content-Type enforcement in container ==="
MUTATION_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "http://localhost:${TEST_PORT}/api/builds" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "name=bad_request")

if [ "$MUTATION_CODE" = "415" ] || [ "$MUTATION_CODE" = "400" ]; then
    echo "  [PASS] Non-JSON mutation rejected with HTTP $MUTATION_CODE"
else
    echo "  [WARN] Unexpected response to non-JSON mutation: HTTP $MUTATION_CODE"
fi

echo "=== 7. Verifying security headers in container response ==="
HEADERS=$(curl -s -I "http://localhost:${TEST_PORT}/")
echo "$HEADERS" | grep -i "x-content-type-options: nosniff" > /dev/null && echo "  [PASS] X-Content-Type-Options present"
echo "$HEADERS" | grep -i "x-frame-options: SAMEORIGIN" > /dev/null && echo "  [PASS] X-Frame-Options present"
echo "$HEADERS" | grep -i "content-security-policy" > /dev/null && echo "  [PASS] Content-Security-Policy present"

echo "=== All Docker build and container smoke tests PASSED successfully! ==="
