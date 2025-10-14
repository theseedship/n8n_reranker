FROM n8nio/n8n:latest

USER root

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Create custom nodes directory
RUN mkdir -p /home/node/.n8n/custom

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

# Start n8n
CMD ["n8n"]
