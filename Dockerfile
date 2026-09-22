# Stage 1: Build and test execution stage
FROM python:alpine3.20 AS test-builder

WORKDIR /app

RUN apk add --no-cache bash curl git && \
    apk upgrade

COPY requirements.txt ./
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir pytest pytest-mock requests-mock

COPY . .

# Run pytest during image creation (unit, integration, and build sanity tests)
RUN pytest tests/unit tests/integration tests/build && \
    mkdir -p /build-artifacts && \
    echo "$(date "+%d.%m.%Y %T") All backend tests passed successfully during container build" > /build-artifacts/build_tests.info

# Stage 2: Clean, minimal production runtime
FROM python:alpine3.20

# Metadata params
ARG VCS_REF
ARG BUILD_DATE

ENV MIMOSA_VERSION=V4-2024.09.1dev
ENV MIMOSA_DOCKER_VERSION=2024.09.2dev
WORKDIR /app
EXPOSE 5000 

COPY /setup.sh /setup.sh
RUN chmod +x /setup.sh 
COPY requirements.txt ./

RUN apk add --no-cache bash curl && \
    apk upgrade && \
    cd /app && \
    pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy test verification token from test-builder to guarantee tests pass for build to succeed
COPY --from=test-builder /build-artifacts/build_tests.info /build_tests.info

COPY . .

# Run setup, stamp build date, and prune test artifacts from production image
RUN /setup.sh && \
    rm -rf /setup.sh /app/setup.sh /app/tests /app/.pytest_cache && \
    echo "$(date "+%d.%m.%Y %T") Spotlight Storage Docker ${MIMOSA_DOCKER_VERSION} Built from Spotlight Storage ${MIMOSA_VERSION}" >> /build_date.info

# Create non-root appuser and configure directory ownership
RUN mkdir -p /app/data /app/images /app/logs && \
    addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser && \
    chown -R appuser:appuser /app /build_date.info /build_tests.info

COPY /entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown appuser:appuser /entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/ || exit 1

USER appuser

ENTRYPOINT ["/entrypoint.sh"]