# n8n-nodes-ollama-reranker

[![npm version](https://img.shields.io/npm/v/n8n-nodes-ollama-reranker)](https://www.npmjs.com/package/n8n-nodes-ollama-reranker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Ollama Reranker provider for n8n Vector Store nodes - rerank documents using local Ollama models.

## Features

- 🎯 **Integrates seamlessly** with n8n Vector Store nodes
- 🚀 **Local inference** using Ollama (no API keys needed)
- 🔧 **Multiple models** supported (BGE Reranker, Qwen3 family)
- ⚡ **Concurrent processing** with configurable batch sizes
- 🔄 **Automatic retries** with exponential backoff
- 📊 **Flexible scoring** with threshold and topK parameters

## Installation

### Via npm (Recommended)

```bash
npm install n8n-nodes-ollama-reranker
```

### Via n8n Community Nodes UI

1. Go to **Settings** → **Community Nodes**
2. Select **Install**
3. Enter `n8n-nodes-ollama-reranker`
4. Click **Install**

### From Docker

Add to your n8n Dockerfile:

```dockerfile
FROM n8nio/n8n:latest
USER root
RUN cd /usr/local/lib/node_modules/n8n && \
    npm install n8n-nodes-ollama-reranker
USER node
```

## Prerequisites

1. **Ollama** must be running and accessible
2. Pull a reranker model:

```bash
# Recommended - BGE Reranker v2-M3
ollama pull bge-reranker-v2-m3

# Or Qwen3 models
ollama pull dengcao/Qwen3-Reranker-4B:Q5_K_M
```

## Usage

1. Add an **Ollama Reranker** node to your workflow
2. Connect it to a Vector Store node (e.g., Pinecone, Qdrant, Supabase)
3. Configure:
   - **Model**: Select a reranker model
   - **Top K**: Number of documents to return
   - **Threshold**: Minimum relevance score (0-1)
   - **Ollama Host**: URL to your Ollama instance

### Example Workflow

```
User Query → Vector Store (retrieve 50 docs)
           → Ollama Reranker (rerank to top 10)
           → Continue with top-ranked documents
```

## Supported Models

| Model | Size | Speed | Accuracy | Best For |
|-------|------|-------|----------|----------|
| `bge-reranker-v2-m3` | ~600MB | ⚡⚡⚡ | ⭐⭐⭐⭐ | General purpose (Recommended) |
| `Qwen3-Reranker-0.6B` | ~400MB | ⚡⚡⚡⚡ | ⭐⭐⭐ | Low resource environments |
| `Qwen3-Reranker-4B` | ~2.5GB | ⚡⚡ | ⭐⭐⭐⭐ | Balanced performance |
| `Qwen3-Reranker-8B` | ~5GB | ⚡ | ⭐⭐⭐⭐⭐ | Maximum accuracy |

## Development

### Setup

```bash
cd custom-nodes
npm install
```

### Build

```bash
npm run build
```

### Lint & Format

```bash
npm run lint        # Check linting
npm run lint:fix    # Auto-fix issues
npm run format      # Format code
```

### Test

```bash
npm test
```

### Local Testing

Use the included docker-compose.yml:

```bash
docker-compose up -d
```

Access n8n at http://localhost:5678 (admin/admin)

### Git Hooks

Pre-commit hooks are configured with Husky to:
- Run lint-staged (ESLint + Prettier)
- Run qlty quality checks

## Publishing

Publishing to npm is automated via GitHub Actions:

1. Update version in `custom-nodes/package.json`
2. Commit changes
3. Create and push a tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions will automatically:
- Build the package
- Run tests
- Publish to npm

## Project Structure

```
n8n_reranker/
├── custom-nodes/              # Main npm package
│   ├── src/
│   │   └── nodes/
│   │       └── OllamaReranker/
│   │           ├── OllamaReranker.node.ts
│   │           ├── OllamaReranker.node.test.ts
│   │           └── ollama.svg
│   ├── .eslintrc.js
│   ├── .husky/                # Git hooks
│   ├── .prettierrc.json
│   ├── package.json           # Main package.json
│   ├── tsconfig.json
│   └── jest.config.js
├── Dockerfile                 # For local development
├── docker-compose.yml         # Complete dev environment
└── .github/
    └── workflows/
        └── npm-publish.yml    # Automated publishing
```

## Architecture

This node follows n8n's **Sub-node Provider pattern**:

1. **No inputs** - Provider nodes don't receive workflow data
2. **AiReranker output** - Connects to Vector Store nodes
3. **supplyData()** - Returns a reranker provider object
4. **Standard interfaces**:
   - `rerank()` - Main reranking method
   - `compressDocuments()` - LangChain compatibility

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## Security

- ✅ No vulnerabilities in dependencies
- ✅ form-data updated to 4.0.4 (fixes CVE-2025-7783)
- ✅ Code quality validated with qlty

## License

MIT

## Links

- [GitHub Repository](https://github.com/theseedship/n8n_reranker)
- [npm Package](https://www.npmjs.com/package/n8n-nodes-ollama-reranker)
- [n8n Documentation](https://docs.n8n.io/)
- [Ollama Documentation](https://ollama.ai/docs)

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/theseedship/n8n_reranker/issues).
