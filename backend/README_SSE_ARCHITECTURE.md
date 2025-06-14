# AI Chat Application - SSE + Celery + Redis Architecture

This application has been refactored to use a modern streaming architecture with Server-Sent Events (SSE), Celery for background processing, and Redis for real-time communication.

## Architecture Overview

### Components
1. **FastAPI Backend** - HTTP API and SSE endpoints
2. **Celery Workers** - Background AI response generation
3. **Redis** - Message broker and real-time streaming
4. **MongoDB** - Persistent storage for messages and chats
5. **React Frontend** - EventSource-based streaming UI

### Data Flow
1. User sends message via HTTP POST to `/chat/{chat_id}/send`
2. Backend saves user message to MongoDB
3. Backend enqueues Celery task for AI response generation
4. Backend returns immediately with task ID
5. Frontend establishes SSE connection to `/sse/chat/{chat_id}`
6. Celery worker generates AI response and streams chunks to Redis
7. SSE endpoint listens to Redis and forwards chunks to frontend
8. Final message is saved to MongoDB when complete

## Setup and Running

### Prerequisites
- Python 3.13+
- Redis server
- MongoDB
- Node.js (for frontend)

### Environment Variables
Create a `.env` file in the backend directory:

```env
# Google AI
GOOGLE_API_KEY=your_gemini_api_key

# Redis
REDIS_URL=redis://localhost:6379/0

# Database
MONGODB_URL=mongodb://localhost:27017/omni_chat

# OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
SECRET_KEY=your_secret_key_for_sessions
```

### Starting Services

1. **Start Redis** (if not running):
   ```bash
   redis-server
   ```

2. **Start MongoDB** (if not running):
   ```bash
   mongod
   ```

3. **Install backend dependencies**:
   ```bash
   cd backend
   uv sync
   ```

4. **Start Celery worker**:
   ```bash
   cd backend
   python start_celery.py
   ```

5. **Start FastAPI server**:
   ```bash
   cd backend
   python main.py
   ```

6. **Start frontend** (in another terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Development Workflow

#### Backend Development
- FastAPI auto-reloads on file changes
- Restart Celery worker when changing task definitions
- Monitor Redis with `redis-cli monitor`

#### Frontend Development
- Vite provides hot reload
- SSE connections auto-reconnect on disconnection
- Check browser dev tools for EventSource events

## API Endpoints

### Chat Management
- `POST /chat` - Create new chat
- `GET /chats` - List user chats
- `GET /chat/{chat_id}` - Get chat with messages
- `DELETE /chat/{chat_id}` - Delete chat

### Messaging
- `POST /chat/{chat_id}/send` - Send message (triggers Celery task)
- `GET /sse/chat/{chat_id}` - SSE stream for real-time updates

### Authentication
- `GET /auth/github` - GitHub OAuth login
- `GET /auth/github/callback` - OAuth callback
- `GET /auth/status` - Check auth status
- `GET /logout` - Logout

## Redis Data Structures

### Pub/Sub Channels
- `chat:{chat_id}:stream` - AI response chunks and events

### Message Types
```json
{
  "type": "chunk",
  "content": "AI response text chunk",
  "task_id": "celery_task_id",
  "timestamp": "2024-01-01T12:00:00"
}

{
  "type": "complete", 
  "message_id": "mongodb_message_id",
  "task_id": "celery_task_id",
  "timestamp": "2024-01-01T12:00:00"
}

{
  "type": "error",
  "content": "Error message",
  "timestamp": "2024-01-01T12:00:00"
}
```

## Frontend EventSource Implementation

### Connection Management
- Auto-connects on chat page load
- Handles reconnection with exponential backoff
- Graceful disconnection on page unload

### Event Handling
- `chunk` - Append text to streaming message
- `complete` - Mark message as finished
- `error` - Display error and mark incomplete
- `heartbeat` - Keep connection alive

## Monitoring and Debugging

### Celery Tasks
```bash
# View active tasks
celery -A celery_app inspect active

# View registered tasks
celery -A celery_app inspect registered

# Monitor task events
celery -A celery_app events
```

### Redis Monitoring
```bash
# Monitor all Redis activity
redis-cli monitor

# Check pub/sub channels
redis-cli pubsub channels "chat:*"

# Check active connections
redis-cli client list
```

### Logs
- FastAPI: Console output with request/response info
- Celery: Task execution logs with INFO level
- Frontend: Browser console for SSE events

## Scaling Considerations

### Horizontal Scaling
- Multiple Celery workers can run in parallel
- Redis handles pub/sub distribution
- FastAPI can run behind load balancer

### Performance Tuning
- Adjust Celery concurrency based on CPU cores
- Use Redis clustering for high availability
- Implement connection pooling for MongoDB

## Troubleshooting

### Common Issues
1. **SSE not connecting**: Check CORS settings and authentication
2. **Tasks not processing**: Verify Celery worker is running
3. **Messages not streaming**: Check Redis pub/sub channels
4. **Database errors**: Verify MongoDB connection and permissions

### Debugging Steps
1. Check all services are running (Redis, MongoDB, Celery)
2. Verify environment variables are set correctly
3. Monitor logs for error messages
4. Test with Redis CLI to verify pub/sub works
5. Use browser dev tools to inspect SSE events 