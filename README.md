# n8n Custom Plugin Development Environment

A complete Docker-based development environment for building and testing custom n8n plugins/nodes.

## 📋 Project Structure

```
n8n_reranker/
├── docker-compose.yml          # Main orchestration file
├── Dockerfile                  # Custom n8n image with plugin support
├── Makefile                    # Convenient commands for development
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
└── custom-nodes/              # Your custom n8n nodes/plugins
    ├── package.json           # Node dependencies
    ├── tsconfig.json          # TypeScript configuration
    └── src/
        ├── nodes/             # Custom node implementations
        │   └── ExampleNode/
        │       └── ExampleNode.node.ts
        └── credentials/       # Custom credential types
            └── ExampleCredentials.credentials.ts
```

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Make (optional, but recommended)

### Setup Steps

1. **Clone and setup environment:**
   ```bash
   cp .env.example .env
   # Edit .env if you need custom configuration
   ```

2. **Install node dependencies:**
   ```bash
   make install
   # Or: cd custom-nodes && npm install
   ```

3. **Build and start services:**
   ```bash
   make up
   # Or: docker-compose up -d
   ```

4. **Access n8n:**
   - URL: http://localhost:5678
   - Default credentials: `admin` / `admin`

## 🛠️ Development Workflow

### Building Custom Nodes

1. **Create your node in TypeScript:**
   ```bash
   cd custom-nodes/src/nodes
   mkdir MyCustomNode
   # Create MyCustomNode.node.ts
   ```

2. **Build TypeScript:**
   ```bash
   make build-plugins
   # Or: cd custom-nodes && npm run build
   ```

3. **Rebuild Docker container:**
   ```bash
   make build
   make restart
   ```

### Watch Mode for Development

For faster iteration, use watch mode:

```bash
make watch-plugins
# Or: cd custom-nodes && npm run dev
```

This will automatically rebuild your TypeScript files when they change.

## 📝 Make Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make build` | Build Docker images |
| `make up` | Start all services |
| `make down` | Stop all services |
| `make logs` | Show logs from all services |
| `make logs-n8n` | Show n8n logs only |
| `make restart` | Restart all services |
| `make clean` | Remove all containers and volumes |
| `make install` | Install node dependencies |
| `make dev` | Start with live rebuild |
| `make build-plugins` | Build TypeScript plugins |
| `make watch-plugins` | Watch and rebuild plugins |
| `make shell-n8n` | Open shell in n8n container |
| `make shell-db` | Open PostgreSQL shell |
| `make backup-db` | Backup database |
| `make status` | Show service status |

## 🔧 Services

### n8n
- **Port:** 5678
- **Image:** Custom build based on n8nio/n8n
- **Custom nodes:** Mounted from `./custom-nodes`
- **Data persistence:** Docker volume `n8n_data`

### PostgreSQL
- **Port:** 5432 (internal only)
- **Database:** n8n
- **User/Password:** n8n/n8n
- **Data persistence:** Docker volume `postgres_data`

### plugin-dev (Optional)
- Development container with Node.js
- For running npm commands without local Node installation

## 📦 Example Node

The project includes an example node (`ExampleNode`) with two operations:

1. **Transform Text:** Converts text to uppercase, reverses it, and shows length
2. **Generate Data:** Creates sample data items

Find it at: `custom-nodes/src/nodes/ExampleNode/ExampleNode.node.ts`

## 🔐 Example Credentials

The project includes example credentials (`ExampleCredentials`) showing how to:
- Store API keys securely
- Add multiple credential fields
- Use dropdown options

Find it at: `custom-nodes/src/credentials/ExampleCredentials.credentials.ts`

## 🧪 Testing Your Nodes

1. Start the environment: `make up`
2. Open n8n in your browser
3. Create a new workflow
4. Search for "Example Node" in the node list
5. Add it to your workflow and test

## 🔄 Updating Nodes

When you modify your custom nodes:

1. Rebuild TypeScript: `make build-plugins`
2. Rebuild Docker image: `make build`
3. Restart services: `make restart`

Or do all at once:
```bash
make build-plugins && make build && make restart
```

## 📊 Database Access

**Using psql:**
```bash
make shell-db
# Then run SQL commands
```

**Backup database:**
```bash
make backup-db
```

## 🐛 Troubleshooting

### Nodes not appearing in n8n

1. Check if nodes are built: `ls custom-nodes/dist/nodes`
2. Check n8n logs: `make logs-n8n`
3. Verify package.json has correct node paths
4. Rebuild everything: `make clean && make build && make up`

### Build errors

1. Check TypeScript errors: `cd custom-nodes && npm run build`
2. Verify all dependencies are installed: `make install`
3. Check tsconfig.json is correct

### Database connection issues

1. Wait for PostgreSQL to be ready (check with `make status`)
2. Check environment variables in docker-compose.yml
3. View postgres logs: `docker-compose logs postgres`

## 📚 Resources

- [n8n Documentation](https://docs.n8n.io/)
- [Creating Custom Nodes](https://docs.n8n.io/integrations/creating-nodes/)
- [n8n Node Development](https://docs.n8n.io/integrations/creating-nodes/build/)
- [n8n Workflow](https://www.npmjs.com/package/n8n-workflow)

## 🔐 Security Notes

- Change default credentials in production
- Use `.env` file for sensitive configuration
- Never commit `.env` to version control
- Review the `.gitignore` file

## 📄 License

This setup is provided as-is for development purposes.
