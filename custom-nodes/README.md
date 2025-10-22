# n8n-nodes-ollama-reranker

[![npm version](https://img.shields.io/npm/v/n8n-nodes-ollama-reranker)](https://www.npmjs.com/package/n8n-nodes-ollama-reranker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Advanced Reranker Provider for n8n** - Supporting Ollama-compatible APIs, Custom Rerank servers, and VL Classifiers.

> **⚠️ Important Note:** *Sorry folks, Ollama doesn't natively support reranker models! We're developing our own solution to bring powerful reranking capabilities to n8n. This package works with Ollama-compatible APIs that implement reranking through prompt-based scoring, custom rerank endpoints, and now Vision-Language classification servers.*

## Features

- 🎯 **Integrates seamlessly** with n8n Vector Store nodes
- 🚀 **Multiple API types**: Ollama Generate, Custom Rerank, VL Classifier
- 🤖 **Auto-detection** of server capabilities
- 🔧 **Multiple models** supported (BGE Reranker, Qwen3 family)
- 🎨 **VL Classification** for document complexity analysis (v1.4.0+)
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

Choose your server type:

### Option 1: Ollama (Prompt-based reranking)
1. **Ollama** must be running and accessible
2. Pull a reranker model:

```bash
# Recommended - BGE Reranker v2-M3
ollama pull bge-reranker-v2-m3

# Or Qwen3 models
ollama pull dengcao/Qwen3-Reranker-4B:Q5_K_M
```

### Option 2: Custom Rerank API
Use any service implementing `/api/rerank` endpoint (like deposium-embeddings-turbov2)

### Option 3: VL Classifier Server (NEW in v1.4.0)
Deploy a Vision-Language classifier server with:
- `/api/status` - Server health and capabilities
- `/api/classify` - Document complexity classification
- Optional `/api/rerank` - Direct reranking support

Example: `deposium_embeddings-turbov2` with ResNet18 ONNX INT8 model

## Usage

### Basic Setup
1. Add an **Ollama Reranker** node to your workflow
2. Connect it to a Vector Store node (e.g., Pinecone, Qdrant, Supabase)
3. Configure:
   - **API Type**: Choose between:
     - `Ollama Generate API` - Standard Ollama prompt-based
     - `Custom Rerank API` - Direct reranking endpoint
     - `VL Classifier + Reranker` - Vision-Language classification
     - `Auto-Detect` - Automatically detect server type
   - **Model**: Select a reranker model
   - **Top K**: Number of documents to return
   - **Threshold**: Minimum relevance score (0-1)
   - **Base URL**: URL to your server

### VL Classifier Options (v1.4.0+)
When using VL Classifier:
- **Enable VL Classification**: Use complexity analysis
- **Classification Strategy**: 
  - `Metadata` - Add complexity as document metadata
  - `Filter` - Filter by complexity before reranking
  - `Both` - Combine filtering and metadata
- **Filter Complexity**: Keep LOW, HIGH, or both complexity documents

### Example Workflow

```
User Query → Vector Store (retrieve 50 docs)
           → Ollama Reranker (rerank to top 10)
           → Continue with top-ranked documents
```

## Supported Configurations

### Reranker Models (Ollama/Custom API)
| Model | Size | Speed | Accuracy | Best For |
|-------|------|-------|----------|----------|
| `bge-reranker-v2-m3` | ~600MB | ⚡⚡⚡ | ⭐⭐⭐⭐ | General purpose (Recommended) |
| `Qwen3-Reranker-0.6B` | ~400MB | ⚡⚡⚡⚡ | ⭐⭐⭐ | Low resource environments |
| `Qwen3-Reranker-4B` | ~2.5GB | ⚡⚡ | ⭐⭐⭐⭐ | Balanced performance |
| `Qwen3-Reranker-8B` | ~5GB | ⚡ | ⭐⭐⭐⭐⭐ | Maximum accuracy |

### VL Classifier Models
| Model | Size | Speed | Use Case |
|-------|------|-------|----------|
| `ResNet18-ONNX-INT8` | 11MB | ⚡⚡⚡⚡ | Document complexity classification |
| Custom VL models | Varies | Varies | Vision-Language tasks |

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

## How It Works

### The Reranking Challenge
Ollama doesn't natively support reranker models that output relevance scores. Instead, we implement three approaches:

1. **Prompt-based Scoring**: Use Ollama's `/api/generate` with specially formatted prompts
2. **Custom Rerank API**: Connect to servers with dedicated `/api/rerank` endpoints
3. **VL Classification**: Pre-process with Vision-Language models for intelligent filtering

### API Type Detection
The node automatically detects your server type by checking:
1. `/api/status` → VL Classifier server
2. `/api/tags` → Ollama server
3. `/api/rerank` → Custom rerank server
4. Fallback → Ollama (default)

## Architecture

This node implements two n8n patterns:

### Provider Node (OllamaReranker)
1. **No inputs** - Provider nodes don't receive workflow data
2. **AiReranker output** - Connects to Vector Store nodes
3. **supplyData()** - Returns a reranker provider object
4. **Standard interfaces**:
   - `rerank()` - Main reranking method
   - `compressDocuments()` - LangChain compatibility

### Workflow Node (OllamaRerankerWorkflow)
1. **Main inputs/outputs** - Processes workflow items
2. **execute()** - Transforms documents in the workflow
3. **usableAsTool** - Can be used as AI Agent tool

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

MIT © Gabriel BRUMENT

## Links

- [GitHub Repository](https://github.com/theseedship/n8n_reranker)
- [npm Package](https://www.npmjs.com/package/n8n-nodes-ollama-reranker)
- [VL Classifier Integration Guide](./VL_CLASSIFIER_INTEGRATION.md)
- [n8n Documentation](https://docs.n8n.io/)
- [Ollama Documentation](https://ollama.ai/docs)

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/theseedship/n8n_reranker/issues).
