import os
from typing import Union, Optional, List, AsyncGenerator
from fastapi import FastAPI, Request, HTTPException, Depends, Query, File, UploadFile
from fastapi.responses import RedirectResponse, Response
from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.config import Config
from google import genai
from dotenv import load_dotenv
import asyncio
from datetime import datetime
import uuid
import base64
import json
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import redis.asyncio as redis
from redis.exceptions import ResponseError as RedisResponseError, ConnectionError as RedisConnectionError
from contextlib import asynccontextmanager
import time
import httpx

from db.engine import User, Chat, Message, init as init_db
from tasks import generate_ai_response

# Load environment variables
load_dotenv()

# Configure Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=GOOGLE_API_KEY)

# Initialize Redis
redis_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    # Startup
    await init_db()
    redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    print("Connected to Redis and MongoDB")
    yield
    # Shutdown
    if redis_client:
        await redis_client.close()

app = FastAPI(lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY"))

# Helper function to get current user
async def get_current_user(request: Request) -> Optional[User]:
    user_data = request.session.get('user')
    if not user_data:
        return None
    
    # Find or create user in database
    user = await User.find_one(User.email == user_data['email'])
    if not user:
        user = User(
            name=user_data['name'],
            email=user_data['email'],
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        await user.save()
    return user

config = Config(environ={
    'GITHUB_CLIENT_ID': os.getenv('GITHUB_CLIENT_ID'),
    'GITHUB_CLIENT_SECRET': os.getenv('GITHUB_CLIENT_SECRET'),
})
oauth = OAuth(config)
oauth.register(
    name='github',
    client_id=os.getenv('GITHUB_CLIENT_ID'),
    client_secret=os.getenv('GITHUB_CLIENT_SECRET'),
    access_token_url='https://github.com/login/oauth/access_token',
    access_token_params=None,
    authorize_url='https://github.com/login/oauth/authorize',
    authorize_params=None,
    api_base_url='https://api.github.com/',
    client_kwargs={'scope': 'user:email'},
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CreateChatRequest(BaseModel):
    first_message: str

class SendMessageRequest(BaseModel):
    message: str

class VoiceTranscriptionRequest(BaseModel):
    audio_data: str  # Base64 encoded audio data
    mime_type: str = "audio/mp3"

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Chat API is running"}

@app.get("/auth/github")
async def login_via_github(request: Request):
    redirect_uri = request.url_for('auth_callback')
    return await oauth.github.authorize_redirect(request, redirect_uri)

@app.get("/auth/github/callback")
async def auth_callback(request: Request):
    try:
        token = await oauth.github.authorize_access_token(request)
        resp = await oauth.github.get('user', token=token)
        user_profile = resp.json()
        
        # Get user's email
        emails_resp = await oauth.github.get('user/emails', token=token)
        emails = emails_resp.json()
        primary_email = next((email['email'] for email in emails if email['primary']), None)
        
        # Combine profile with email
        user_data = {
            **user_profile,
            'email': primary_email
        }
        
        print(f"Setting session with user data: {user_data}")  # Debug log
        
        # Store user in session
        request.session['user'] = user_data
        
        # Create or update user in database
        user = await User.find_one(User.email == primary_email)
        if not user:
            user = User(
                name=user_profile['name'],
                email=primary_email,
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            await user.insert()
        
        # Redirect to frontend
        response = RedirectResponse(url="http://localhost:5173")
        return response
    except OAuthError as error:
        print(f"OAuth error: {error}")
        return RedirectResponse(url="http://localhost:5173")
    except Exception as error:
        print(f"Error in callback: {error}")
        return RedirectResponse(url="http://localhost:5173")

@app.get("/logout")
async def logout(request: Request):
    request.session.pop('user', None)
    return RedirectResponse(url="/")

@app.get("/auth/status")
async def auth_status(request: Request):
    try:
        user_data = request.session.get('user')
        if user_data:
            # Verify user exists in database
            user = await User.find_one(User.email == user_data['email'])
            if user:
                return user_data
        return Response(status_code=401)
    except Exception as e:
        print(f"Error checking auth status: {e}")
        return Response(status_code=401)

@app.post("/chat")
async def create_chat(request: Request, body: CreateChatRequest):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Generate title from the first message
    words = body.first_message.split()[:10]
    title = " ".join(words)
    if len(body.first_message.split()) > 10:
        title += "..."

    # Create the new chat (without the first message)
    new_chat = Chat(
        user_id=str(user.id),
        title=title,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    await new_chat.insert()

    print(f"Created new chat {new_chat.id} with title '{title}'. First message will be sent via SSE.")
    
    # Return the chat object without any messages
    # The frontend will send the first message after SSE connection
    return {
        "id": str(new_chat.id),
        "title": new_chat.title,
        "created_at": new_chat.created_at,
        "updated_at": new_chat.updated_at,
        "messages": []  # Empty messages array
    }

@app.get("/chats")
async def get_chats(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get all chats for the user, sorted by updated_at
    chats = await Chat.find(Chat.user_id == str(user.id)).sort(-Chat.updated_at).to_list()
    
    # Format the response with more details
    return {
        "chats": [{
            "id": str(chat.id),
            "title": chat.title,
            "created_at": chat.created_at,
            "updated_at": chat.updated_at
        } for chat in chats]
    }

@app.get("/chat/{chat_id}")
async def get_chat(chat_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get chat and verify ownership
    chat = await Chat.get(chat_id)
    if not chat or chat.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Get messages for this chat
    messages = await Message.find(Message.chat_id == chat_id).sort(+Message.created_at).to_list()
    
    return {
        "id": str(chat.id),
        "title": chat.title,
        "updated_at": chat.updated_at,
        "messages": [{
            "content": msg.content,
            "from_user": msg.from_user,
            "created_at": msg.created_at,
            "status": msg.status,
            "is_complete": msg.is_complete
        } for msg in messages]
    }

@app.delete("/chat/{chat_id}")
async def delete_chat(chat_id: str, request: Request):
    global redis_client
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get chat and verify ownership
    chat = await Chat.get(chat_id)
    if not chat or chat.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Delete all messages in the chat
    await Message.find(Message.chat_id == chat_id).delete()
    
    # Delete the chat
    await chat.delete()

    # Clean up Redis stream
    stream_name = f"chat:{chat_id}:stream"
    try:
        await redis_client.delete(stream_name)
        print(f"Cleaned up Redis stream: {stream_name}")
    except Exception as e:
        print(f"Error cleaning up Redis stream: {e}")

    return {"status": "Chat deleted"}

@app.post("/chat/{chat_id}/send")
async def send_message_to_chat(chat_id: str, request: Request, body: SendMessageRequest):
    """
    Send a new message to the chat and trigger AI response generation via Celery.
    Returns immediately after enqueuing the task.
    """
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify chat ownership
    chat = await Chat.get(chat_id)
    if not chat or chat.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Save user message
    user_message = Message(
        chat_id=chat_id,
        from_user=True,
        content=body.message,
        model="user",
        created_at=datetime.now()
    )
    await user_message.insert()
    
    # Enqueue Celery task for AI response generation
    task = generate_ai_response.delay(chat_id, body.message, user.email)
    
    print(f"Enqueued AI response task {task.id} for chat {chat_id}")
    
    return {
        "message": "Message sent successfully",
        "task_id": task.id,
        "user_message_id": str(user_message.id)
    }

@app.get("/sse/chat/{chat_id}")
async def stream_chat_messages(
    request: Request,
    chat_id: str,
    last_id: Optional[str] = Query(None, description="Last received message ID for resume")
):
    """
    SSE endpoint for streaming chat messages from Redis Streams.
    Supports resuming from a specific message ID for page refresh recovery.
    """
    # Use existing authentication system
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify chat ownership
    chat = await Chat.get(chat_id)
    if not chat or chat.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Chat not found")
    
    async def event_stream() -> AsyncGenerator[str, None]:
        global redis_client
        stream_name = f"chat:{chat_id}:stream"
        consumer_group = "chat_consumers"
        consumer_name = f"consumer_{user.email}_{int(time.time())}"
        current_last_id = last_id or "$"  # Use parameter value or default to latest
        
        try:
            # Create consumer group if it doesn't exist
            try:
                await redis_client.xgroup_create(
                    stream_name, 
                    consumer_group, 
                    "0", 
                    mkstream=True
                )
                print(f"Created consumer group {consumer_group} for {stream_name}")
            except RedisResponseError as e:
                if "BUSYGROUP" not in str(e):
                    raise
                # Group already exists
                pass
            
            # Determine starting point
            if last_id:  # Check if we have a real last_id from query parameter
                # Resume from specific message ID for page refresh recovery
                print(f"Resuming stream from message ID: {last_id}")
                # Read all messages after the last_id
                try:
                    # Get missed messages since last_id
                    missed_messages = await redis_client.xrange(
                        stream_name, 
                        min=f"({last_id}",  # Exclusive range after last_id
                        max="+",
                        count=100
                    )
                    
                    # Send missed messages first
                    for msg_id, fields in missed_messages:
                        msg_id_str = msg_id.decode() if isinstance(msg_id, bytes) else msg_id
                        parsed_fields = {
                            k.decode() if isinstance(k, bytes) else k: 
                            v.decode() if isinstance(v, bytes) else v 
                            for k, v in fields.items()
                        }
                        
                        yield f"data: {json.dumps({**parsed_fields, 'stream_id': msg_id_str})}\n\n"
                        
                    print(f"Sent {len(missed_messages)} missed messages")
                    
                except Exception as e:
                    print(f"Error getting missed messages: {e}")
                    # If error, start from latest
                    current_last_id = "$"
            
            # Send initial connection confirmation
            yield f"data: {json.dumps({'type': 'connected', 'consumer': consumer_name, 'timestamp': datetime.now().isoformat()})}\n\n"
            
            heartbeat_counter = 0
            last_heartbeat = time.time()
            
            # Main streaming loop for new messages
            while True:
                if await request.is_disconnected():
                    print(f"Client disconnected from {stream_name}")
                    break
                
                try:
                    # Read new messages from stream using consumer group
                    messages = await redis_client.xreadgroup(
                        consumer_group,
                        consumer_name,
                        {stream_name: ">"},  # Read only new messages
                        count=1,
                        block=1000  # Block for 1 second
                    )
                    
                    if messages:
                        for stream_key, stream_messages in messages:
                            for msg_id, fields in stream_messages:
                                # Decode message
                                msg_id_str = msg_id.decode() if isinstance(msg_id, bytes) else msg_id
                                parsed_fields = {
                                    k.decode() if isinstance(k, bytes) else k: 
                                    v.decode() if isinstance(v, bytes) else v 
                                    for k, v in fields.items()
                                }
                                
                                # Send message to client
                                message_data = {**parsed_fields, "stream_id": msg_id_str}
                                yield f"data: {json.dumps(message_data)}\n\n"
                                
                                # Acknowledge message processing
                                await redis_client.xack(stream_name, consumer_group, msg_id)
                                
                                # Update current_last_id for potential reconnection
                                current_last_id = msg_id_str
                                
                                print(f"Streamed message {msg_id_str}: {parsed_fields.get('type', 'unknown')}")
                    
                    else:
                        # No new messages, send heartbeat occasionally
                        current_time = time.time()
                        if current_time - last_heartbeat >= 60:  # Every 60 seconds
                            heartbeat_counter += 1
                            if heartbeat_counter % 10 == 0:  # Log every 10th heartbeat
                                print(f"Heartbeat #{heartbeat_counter} for {stream_name}")
                            
                            yield f"data: {json.dumps({'type': 'heartbeat', 'timestamp': datetime.now().isoformat(), 'last_id': current_last_id})}\n\n"
                            last_heartbeat = current_time
                        
                        # Small delay to prevent busy waiting
                        await asyncio.sleep(0.1)
                
                except RedisConnectionError:
                    print("Redis connection lost, attempting to reconnect...")
                    await asyncio.sleep(1)
                    continue
                except Exception as e:
                    print(f"Error in SSE stream: {e}")
                    yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
                    await asyncio.sleep(1)
        
        except Exception as e:
            print(f"Fatal error in SSE stream: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': f'Stream error: {str(e)}'})}\n\n"
        
        finally:
            # Cleanup: Remove consumer from group
            try:
                await redis_client.xgroup_delconsumer(stream_name, consumer_group, consumer_name)
                print(f"Cleaned up consumer {consumer_name}")
            except Exception as cleanup_error:
                print(f"Error cleaning up consumer: {cleanup_error}")
    
    return EventSourceResponse(event_stream())

@app.post("/gemini/models/available")
async def get_available_models():
    for model in client.models.list():
        print(f"  Name: {model.name}")
    return {"models": [model.name for model in client.models.list()]}

@app.get("/health")
async def health():
    """Health check endpoint"""
    global redis_client
    try:
        # Test Redis connection
        await redis_client.ping()
        redis_status = "connected"
    except Exception as e:
        redis_status = f"error: {str(e)}"
    
    return {
        "status": "healthy",
        "redis": redis_status,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/voice/transcribe")
async def transcribe_voice(request: Request, body: VoiceTranscriptionRequest):
    """
    Transcribe voice audio using Gemini API.
    This endpoint is model-agnostic and can be used with any chat model.
    """
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        # Use Gemini API directly for transcription
        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GOOGLE_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{
                        "parts": [
                            {
                                "text": "Listen to this audio and provide a more correctly spelled and formatted version of it so i can use it in the next prompt, dont add any other text."
                            },
                            {
                                "inlineData": {
                                    "mimeType": body.mime_type,
                                    "data": body.audio_data
                                }
                            }
                        ]
                    }]
                },
                timeout=30.0
            )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=500, 
                detail=f"Gemini API error: {response.status_code} - {response.text}"
            )
        
        result = response.json()
        
        # Extract transcribed text from Gemini response
        if "candidates" in result and len(result["candidates"]) > 0:
            candidate = result["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                transcribed_text = candidate["content"]["parts"][0].get("text", "")
                return {
                    "success": True,
                    "transcribed_text": transcribed_text.strip()
                }
        
        raise HTTPException(status_code=500, detail="No transcription found in response")
        
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Transcription request timed out")
    except Exception as e:
        print(f"Voice transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)