# Docker Setup for LiveKit Local Development

## Quick Start (2 minutes)

### Option 1: Use Custom Media Server (Default)
```bash
# No configuration needed - uses existing custom WebRTC SFU
docker-compose up
```

### Option 2: Use LiveKit Locally (Recommended for Testing)
```bash
# 1. Copy environment template
cp .env.livekit.example .env

# 2. Start all services (includes LiveKit container)
docker-compose up

# Services running:
# - PostgreSQL:  localhost:5432
# - API:         localhost:8080
# - Web:         localhost:8082
# - LiveKit:     localhost:7880 (WebSocket)
#              localhost:7881 (HTTP API)
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Local Development Stack                 │
├─────────────────────────────────────────┤
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  Web Browser (http://localhost)  │   │
│  └──────────────┬───────────────────┘   │
│                 │                        │
│  ┌──────────────▼───────────────────┐   │
│  │  API Server (8080)               │   │
│  │  - Handles auth, permissions      │   │
│  │  - Generates media tokens         │   │
│  │  - Returns either:                │   │
│  │    a) Custom media server token   │   │
│  │    b) LiveKit access token        │   │
│  └──────────────┬───────────────────┘   │
│                 │                        │
│     ┌───────────┼───────────┐           │
│     │           │           │           │
│  ┌──▼──┐   ┌────▼────┐  ┌──▼──┐        │
│  │ DB  │   │ Custom  │  │Live │        │
│  │5432 │   │ Media   │  │Kit  │        │
│  │     │   │ 8081    │  │7880 │        │
│  └─────┘   └────────┘  └─────┘        │
│                                        │
└─────────────────────────────────────────┘
```

---

## Configuration

### Using Custom Media Server (Default)
**No additional setup needed.**

```bash
# .env (or not set)
MEDIA_SERVER_URL=ws://127.0.0.1:8081/ws/media

# Start services
docker-compose up
```

The docker-compose.yml includes both media services:
- `media`: Custom Rust WebRTC SFU (always runs)
- `livekit`: LiveKit server (commented out by default)

### Using LiveKit

**Step 1: Prepare Environment**
```bash
cp .env.livekit.example .env
```

**Step 2: Update .env**
```env
# For local docker-compose LiveKit:
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://localhost:7880

# OR use managed LiveKit (livekit.cloud):
LIVEKIT_API_KEY=your-cloud-key
LIVEKIT_API_SECRET=your-cloud-secret
LIVEKIT_URL=wss://your-project.livekit.cloud
```

**Step 3: Start Services**
```bash
docker-compose up
```

This starts:
- PostgreSQL
- API server (with LiveKit config)
- Web server
- LiveKit server (if using docker-compose version)
- Custom media server (as fallback)

---

## Configuration Options

### 1. Custom Media Server Only
```env
# .env
MEDIA_SERVER_URL=ws://localhost:8081/ws/media
# Don't set LIVEKIT_* variables
```
**Services needed:** postgres, api, media, web
**Docker:** `docker-compose up`

### 2. LiveKit from Docker Compose
```env
# .env
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://localhost:7880
```
**Services needed:** postgres, api, livekit, web
**Docker:** `docker-compose up`
**Note:** Uncomment livekit service in docker-compose.yml

### 3. LiveKit Cloud (livekit.cloud)
```env
# .env
LIVEKIT_API_KEY=your-cloud-key
LIVEKIT_API_SECRET=your-cloud-secret
LIVEKIT_URL=wss://your-project.livekit.cloud
```
**Services needed:** postgres, api, web (only)
**Docker:** `docker-compose up` (livekit service not needed)

### 4. Both Media Servers (For Testing)
```env
# .env
MEDIA_SERVER_URL=ws://localhost:8081/ws/media
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://localhost:7880
```
**Services:** postgres, api, media, livekit, web
**Docker:** `docker-compose up`
**API behavior:** Uses LiveKit if credentials set, falls back to custom media

---

## Port Reference

| Service | Port | Type | Purpose |
|---------|------|------|---------|
| PostgreSQL | 5432 | TCP | Database |
| Custom Media | 8081 | WS + UDP | WebRTC SFU |
| API | 8080 | TCP | REST API |
| Web | 8082 | TCP | Web UI |
| LiveKit | 7880 | WS | WebRTC over WebSocket |
| LiveKit | 7881 | TCP | HTTP API |
| LiveKit | 50000-60000 | UDP | Media streams |

---

## Usage Examples

### Example 1: Start with Custom Media Server
```bash
docker-compose up
# Access: http://localhost:8082
```

### Example 2: Start with LiveKit from Docker
```bash
# Edit docker-compose.yml - uncomment livekit service
# OR use the prepared version:
docker-compose -f docker-compose.yml -f docker-compose.livekit.yml up
```

### Example 3: Stop and Clean
```bash
# Stop all services
docker-compose down

# Remove volumes (reset database)
docker-compose down -v

# View logs
docker-compose logs -f api
docker-compose logs -f livekit
```

---

## Troubleshooting

### LiveKit Service Won't Start
```bash
# Check logs
docker-compose logs livekit

# Verify configuration
docker-compose config | grep -A 10 livekit

# Try pulling latest image
docker pull livekit/livekit-server:latest
```

### API Can't Reach LiveKit
```bash
# Check connectivity
docker-compose exec api curl http://livekit:7881/health

# Verify LIVEKIT_URL in API logs
docker-compose logs api | grep -i livekit
```

### Clients Can't Join
```bash
# Check if tokens are being generated
docker-compose logs api | grep -i "token"

# Verify LiveKit is accepting connections
# In browser console: check WebSocket connection to ws://localhost:7880
```

### Database Issues
```bash
# Reset database
docker-compose down -v
docker-compose up postgres

# Check database
docker-compose exec postgres psql -U social -d social -c "\dt"
```

---

## Environment Variables Explained

### Media Server Selection
```env
# If LIVEKIT credentials are SET:
LIVEKIT_API_KEY=xxx
LIVEKIT_API_SECRET=xxx
LIVEKIT_URL=xxx
# → API generates LiveKit tokens
# → Clients connect to LiveKit

# If LIVEKIT credentials are NOT SET (empty or missing):
# → API generates custom media tokens
# → Clients connect to custom media server
# → Falls back to existing SFU
```

### LiveKit Configuration
```env
# For docker-compose service:
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://livekit:7880  # Docker service name

# For livekit.cloud:
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
LIVEKIT_URL=wss://your-project.livekit.cloud

# For external self-hosted:
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
LIVEKIT_URL=wss://your-server.com
```

---

## Development Workflow

### Switch Between Implementations

**To use Custom Media Server:**
1. Comment out LIVEKIT_* in .env
2. Keep media service in docker-compose
3. Restart: `docker-compose up`

**To use LiveKit:**
1. Set LIVEKIT_* in .env
2. Uncomment livekit service (or use managed)
3. Restart: `docker-compose up`

**No code changes needed!** The API automatically detects which to use.

---

## Performance Tips

### Docker Compose Optimization
```bash
# Use --scale to run multiple API instances
docker-compose up --scale api=2

# Run in background with -d
docker-compose up -d

# View specific service logs
docker-compose logs -f api --tail=50
```

### Resource Limits (docker-compose.yml)
```yaml
services:
  livekit:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

---

## Next Steps

1. **Choose your setup** (custom, docker LiveKit, or managed LiveKit)
2. **Copy .env.livekit.example to .env**
3. **Adjust credentials** for your choice
4. **Run docker-compose up**
5. **Test at http://localhost:8082**

All code is ready - Docker just needs configuration!
