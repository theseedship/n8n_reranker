.PHONY: help build up down logs restart clean install dev test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build Docker images
	docker-compose build

up: ## Start all services
	docker-compose up -d
	@echo ""
	@echo "✅ n8n is starting up..."
	@echo "🌐 Access n8n at: http://localhost:5678"
	@echo "👤 Default credentials: admin / admin"
	@echo ""
	@echo "Run 'make logs' to see logs"

down: ## Stop all services
	docker-compose down

logs: ## Show logs from all services
	docker-compose logs -f

logs-n8n: ## Show logs from n8n only
	docker-compose logs -f n8n

restart: ## Restart all services
	docker-compose restart

clean: ## Stop and remove all containers, volumes, and images
	docker-compose down -v
	docker-compose rm -f

install: ## Install dependencies in custom-nodes
	cd custom-nodes && npm install

dev: ## Start development environment with live reload
	docker-compose up --build

test: ## Run tests in custom-nodes
	cd custom-nodes && npm test

build-plugins: ## Build TypeScript plugins
	cd custom-nodes && npm run build

watch-plugins: ## Watch and rebuild plugins on changes
	cd custom-nodes && npm run dev

shell-n8n: ## Open shell in n8n container
	docker-compose exec n8n sh

shell-db: ## Open PostgreSQL shell
	docker-compose exec postgres psql -U n8n -d n8n

backup-db: ## Backup PostgreSQL database
	docker-compose exec postgres pg_dump -U n8n n8n > backup_$$(date +%Y%m%d_%H%M%S).sql

status: ## Show status of all services
	docker-compose ps
