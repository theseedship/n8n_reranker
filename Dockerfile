FROM n8nio/n8n:1.69.2

USER root

# Install build dependencies and create custom nodes directory
RUN apk add --no-cache \
    g++=13.2.1_git20240309-r0 \
    git=2.45.2-r0 \
    make=4.4.1-r2 \
    python3=3.12.8-r1 \
    && mkdir -p /home/node/.n8n/custom

# Copy custom nodes
COPY --chown=node:node custom-nodes/ /home/node/.n8n/custom/

# Install custom node dependencies if package.json exists
WORKDIR /home/node/.n8n/custom
RUN if [ -f package.json ]; then \
    npm install --production; \
    fi

# Switch back to node user
USER node

WORKDIR /home/node

# Expose n8n port
EXPOSE 5678

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ["wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5678/healthz"]

# Use the default entrypoint from the base image
# No CMD override needed - the base image handles it
