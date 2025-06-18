#!/bin/bash

echo "🚀 Starting Omni AI Chat..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from example..."
    cp env.example .env
    echo "📝 Please edit .env file with your API keys before continuing."
    echo "   Required: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET"
    echo "   Optional: GOOGLE_API_KEY, OPENROUTER_API_KEY, GITHUB_MODELS_API_KEY"
    echo ""
    echo "After editing .env, run this script again."
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start the application
echo "🐳 Starting Docker containers..."
docker-compose up -d

echo ""
echo "✅ Omni AI Chat is starting!"
echo ""
echo "📱 Frontend: http://localhost:5173"
echo "🔧 Backend API: http://localhost:8000"
echo "📊 API Docs: http://localhost:8000/docs"
echo ""
echo "⏳ Please wait a moment for all services to be ready..."
echo ""
echo "🛑 To stop: docker-compose down"
echo "📝 View logs: docker-compose logs -f" 