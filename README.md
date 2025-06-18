# **Omni Ai Chat - just another chatgpt (t3chat) clone**

Submission for the t3 chat cloneathon [https://cloneathon.t3.chat/](https://cloneathon.t3.chat/)

### TODO

#### 1. Chat interface

- [X] Code formatting
- [X] Message streaming
- [X] Markdown support
- [X] Ability to move input area to bottom/top/right of the screen
- [X] Auto scroll / scroll to bottom on new message / no auto scroll toggle
- [X] Chat navigation through conversation topics minimized to a sidebar
- [X] Voice input
- [X] Goolge search functionality
- [X] Preserve chat context/history
- [ ] Image output
- [ ] File input
- [X] Multiple AI models
- [ ] Audio output
- [X] Token count

#### 2. User management

- [X] OAuth login/register (GitHub)
- [ ] User profile
- [ ] User settings
- [ ] User sessions and timeouts

#### 3. Data management

- [X] Chat history persistence
- [X] Chat history pagination
- [ ] Structute chats in folders / workspaces
- [ ] Chat sharing with unique URLs
- [X] Message search functionality

#### 4. UI/UX

- [X] Dark/White mode
- [ ] Responsive design (mobile, desktop)
- [ ] Animations
- [ ] Keyboard shortcuts
- [X] Pretty UI

#### 5. Advanced features

- [ ] Chat branching
- [ ] Temporary chats (for one-time conversations)
- [ ] Temporary inline chats (for quick questions)
- [X] Resumable streams
- [ ] Local llms with langchain or similar

# Omni AI Chat

A modern AI chat application that supports multiple AI providers including Google Gemini, OpenRouter models, and GitHub Models. Features real-time streaming, search functionality, and a beautiful responsive UI.

## Features

- 🤖 **Multiple AI Providers**: Google Gemini, OpenRouter (70+ models), GitHub Models
- 🔍 **Smart Search**: Search across chat titles and message content
- 🎙️ **Voice Input**: Speech-to-text transcription using Gemini
- 🌐 **Web Search**: Google Search integration for Gemini models
- 💬 **Real-time Streaming**: Server-sent events for instant responses
- 🎨 **Modern UI**: Beautiful, responsive design with dark/light themes
- 🔐 **GitHub OAuth**: Secure authentication
- 📱 **Multiple Layouts**: Bottom, top, and side panel chat configurations

## Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed
- API keys for the services you want to use

### 1. Clone and Setup

```bash
git clone <repository-url>
cd omni-ai-chat
cp env.example .env
```

### 2. Configure Environment

Edit `.env` file with your API keys:

```bash
# Required for authentication
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# API Keys (add the ones you want to use)
GOOGLE_API_KEY=your_google_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
GITHUB_MODELS_API_KEY=your_github_models_api_key
```

### 3. Run the Application

```bash
docker-compose up -d
```

That's it! The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379

### 4. Stop the Application

```bash
docker-compose down
```

To also remove volumes (database data):
```bash
docker-compose down -v
```

## Development Setup

For local development without Docker:

### Backend

```bash
cd backend
uv sync
uv run uvicorn main:app --reload
# In another terminal
uv run celery -A celery_app worker --loglevel=info
```

### Frontend

```bash
cd frontend
bun install
bun run dev
```

### Dependencies

- **Backend**: Python 3.13+, MongoDB, Redis
- **Frontend**: Bun (latest), Node.js runtime

## API Keys Setup

### GitHub OAuth App

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create a new OAuth App with:
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:8000/auth/github/callback`

### Google API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key for Gemini access

### OpenRouter API Key

1. Sign up at [OpenRouter](https://openrouter.ai/)
2. Generate an API key in your account settings

### GitHub Models API Key

1. Get access to [GitHub Models](https://github.com/marketplace/models)
2. Generate a personal access token with appropriate permissions

## Architecture

- **Frontend**: React + TypeScript + Vite + TailwindCSS (powered by Bun)
- **Backend**: FastAPI + Python
- **Database**: MongoDB with Beanie ODM
- **Task Queue**: Celery + Redis
- **Real-time**: Server-Sent Events (SSE)
- **Authentication**: GitHub OAuth

## Services

- **mongodb**: MongoDB database
- **redis**: Redis for caching and task queue
- **backend**: FastAPI application server
- **celery-worker**: Background task processor for AI requests
- **frontend**: React development server (Bun runtime)

## Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in `docker-compose.yml` if needed
2. **API key errors**: Ensure all required keys are set in `.env`
3. **Build failures**: Try `docker-compose build --no-cache`

### Logs

View logs for specific services:
```bash
docker-compose logs backend
docker-compose logs celery-worker
docker-compose logs frontend
```

### Reset Database

```bash
docker-compose down -v
docker-compose up -d
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.
