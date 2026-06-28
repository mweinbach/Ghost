# Ghost Analytics Scripts

Scripts for managing analytics data in the Docker development environment.

## Docker Analytics Manager

Generates and clears analytics events directly in the local Tinybird instance.

**Prerequisites:**
- Docker environment running: `bun run dev:analytics`
- Ghost database populated: `bun run reset:data`

**Usage:**
```bash
# Generate analytics events (default: 10,000)
bun run data:analytics:generate

# Generate custom number of events
bun run data:analytics:generate 5000

# Clear all analytics data
bun run data:analytics:clear
```

## Typical Workflow

```bash
# 1. Start the Docker environment with analytics
bun run dev:analytics

# 2. (Optional) Reset Ghost data if needed
bun run docker:reset:data

# 3. Generate analytics data
bun run data:analytics:generate

# 4. View analytics in Ghost admin
# http://localhost:2368/ghost/#/stats

# 5. Clear analytics when needed
bun run data:analytics:clear
```

**Note:** Use `bun run docker:reset:data` when the Docker environment is running.
Use `bun run reset:data` when running Ghost locally without Docker.

## Configuration

### Database Connection

Connects to MySQL at `localhost:3306`. Override via environment variables:

- `MYSQL_HOST` (default: localhost)
- `MYSQL_PORT` (default: 3306)
- `MYSQL_USER` (default: root)
- `MYSQL_PASSWORD` (default: root)
- `MYSQL_DATABASE` (default: ghost_dev)

### Tinybird Connection

Reads tokens from Docker volume automatically. Override via:

- `TINYBIRD_ADMIN_TOKEN`
- `TINYBIRD_TRACKER_TOKEN`
- `TINYBIRD_HOST` (default: http://localhost:7181)

## Troubleshooting

**"Could not retrieve Tinybird token"** - Ensure analytics is running: `bun run dev:analytics`

**"Database connection failed"** - Check MySQL is running: `docker ps | grep mysql`

**No posts/members found** - Generate Ghost data first: `bun run reset:data`
