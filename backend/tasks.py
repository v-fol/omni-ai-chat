import os
import asyncio
import json
from typing import Optional
from datetime import datetime
from celery import current_task
from celery.signals import worker_process_init
from google import genai
from openai import OpenAI
from dotenv import load_dotenv
import redis
import redis.asyncio as redis_async
from redis.exceptions import ResponseError as RedisResponseError
from functools import lru_cache
import threading
import motor.motor_asyncio
from bson import ObjectId
import tiktoken

from celery_app import celery_app

# Load environment variables
load_dotenv()

# Configure Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

# Configure OpenRouter
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
SITE_URL = os.getenv("SITE_URL", "http://localhost:5173")
SITE_NAME = os.getenv("SITE_NAME", "Omni AI Chat")

openrouter_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

# Configure GitHub
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_ENDPOINT = "https://models.github.ai/inference"

github_client = OpenAI(
    base_url=GITHUB_ENDPOINT,
    api_key=GITHUB_TOKEN,
)

# Synchronous Redis connection for Celery tasks
redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))

# Thread-local storage for event loops and database connections
_thread_local = threading.local()

@lru_cache(maxsize=1)
def get_redis_url():
    """Cached Redis URL to avoid repeated env lookups."""
    return os.getenv("REDIS_URL", "redis://localhost:6379/0")

@lru_cache(maxsize=1)
def get_mongodb_config():
    """Get MongoDB configuration."""
    return {
        'url': os.getenv("MONGODB_URL", "mongodb://localhost:27017"),
        'database': os.getenv("DATABASE_NAME", "omni_chat")
    }

async def init_thread_database():
    """Initialize database connection for current thread with fresh Motor client."""
    config = get_mongodb_config()
    
    print(f"🔗 Creating fresh MongoDB connection for thread {threading.current_thread().name}")
    
    # Create a completely new Motor client for this thread
    client = motor.motor_asyncio.AsyncIOMotorClient(
        config['url'],
        # Force new connection pool per thread
        maxPoolSize=5,
        minPoolSize=1,
        maxIdleTimeMS=30000,
        serverSelectionTimeoutMS=5000
    )
    
    # Get database reference
    database = client[config['database']]
    
    print(f"✅ Database initialized for thread {threading.current_thread().name}")
    return client, database

def get_or_create_event_loop():
    """Get or create an event loop and database connection for the current thread."""
    if not hasattr(_thread_local, 'loop'):
        # Create new event loop for this thread
        _thread_local.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_thread_local.loop)
        
        # Initialize database for this thread with fresh connection
        _thread_local.db_client, _thread_local.database = _thread_local.loop.run_until_complete(init_thread_database())
        _thread_local.db_initialized = True
        
        print(f"✅ Initialized event loop and database for thread {threading.current_thread().name}")
    
    return _thread_local.loop

def get_database():
    """Get the database connection for current thread."""
    if not hasattr(_thread_local, 'database'):
        get_or_create_event_loop()  # This will initialize the database
    return _thread_local.database

# Initialize database once per worker process (for processes pool)
@worker_process_init.connect
def init_worker_process(sender=None, **kwargs):
    """Initialize database connection when worker process starts (processes pool only)."""
    print(f"🔧 Initializing database for worker process {os.getpid()}")
    
    # Create event loop for this process
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Initialize database
    loop.run_until_complete(init_thread_database())
    print(f"✅ Database initialized for worker process {os.getpid()}")

@celery_app.task(bind=True)
def generate_ai_response(self, chat_id: str, user_email: str, enable_search: bool = False):
    """
    Generate AI response and stream chunks to Redis Streams.
    Uses Motor directly to avoid Beanie event loop conflicts.
    Fetches entire conversation from database for context.
    """
    task_id = self.request.id
    
    try:
        # Get or create event loop for this thread/process
        loop = get_or_create_event_loop()
        
        # Run the async function
        result = loop.run_until_complete(
            _generate_ai_response_async(task_id, chat_id, user_email, enable_search)
        )
        return result
            
    except Exception as e:
        # Send error to Redis stream using sync client
        _send_error_to_redis_stream_sync(chat_id, str(e))
        raise e

@celery_app.task(bind=True)
def generate_openrouter_response(self, chat_id: str, user_email: str, model_name: str):
    """
    Generate AI response using OpenRouter models and stream chunks to Redis Streams.
    Uses Motor directly to avoid Beanie event loop conflicts.
    Fetches entire conversation from database for context.
    """
    task_id = self.request.id
    
    try:
        # Get or create event loop for this thread/process
        loop = get_or_create_event_loop()
        
        # Run the async function
        result = loop.run_until_complete(
            _generate_openrouter_response_async(task_id, chat_id, user_email, model_name)
        )
        return result
            
    except Exception as e:
        # Send error to Redis stream using sync client
        _send_error_to_redis_stream_sync(chat_id, str(e))
        raise e

@celery_app.task(bind=True)
def generate_github_response(self, chat_id: str, user_email: str, model_name: str):
    """
    Generate AI response using GitHub models and stream chunks to Redis Streams.
    Uses Motor directly to avoid Beanie event loop conflicts.
    Fetches entire conversation from database for context.
    """
    task_id = self.request.id
    
    try:
        # Get or create event loop for this thread/process
        loop = get_or_create_event_loop()
        
        # Run the async function
        result = loop.run_until_complete(
            _generate_github_response_async(task_id, chat_id, user_email, model_name)
        )
        return result
            
    except Exception as e:
        # Send error to Redis stream using sync client
        _send_error_to_redis_stream_sync(chat_id, str(e))
        raise e

async def _fetch_conversation_messages(db, chat_id: str):
    """
    Fetch all messages for a chat, ordered by creation time.
    Returns list of messages in chronological order.
    """
    messages_cursor = db.messages.find({"chat_id": chat_id}).sort("created_at", 1)
    messages = await messages_cursor.to_list(length=None)
    return messages

def _build_gemini_conversation(messages):
    """
    Build conversation context for Gemini API using Content and Part objects.
    Returns list of Content objects for the Gemini API.
    """
    from google.genai.types import Content, Part
    
    gemini_contents = []
    
    for msg in messages:
        if msg.get("from_user"):
            # User message
            gemini_contents.append(
                Content(role="user", parts=[Part(text=msg["content"])])
            )
        else:
            # AI message (only include completed ones for context)
            if msg.get("status") == "complete" and msg.get("content"):
                gemini_contents.append(
                    Content(role="model", parts=[Part(text=msg["content"])])
                )
    
    return gemini_contents

def _build_openai_conversation(messages):
    """
    Build conversation context for OpenAI-compatible APIs (OpenRouter, GitHub).
    Returns list of message dictionaries in OpenAI format.
    """
    openai_messages = []
    
    for msg in messages:
        if msg.get("from_user"):
            # User message
            openai_messages.append({
                "role": "user",
                "content": msg["content"]
            })
        else:
            # AI message (only include completed ones for context)
            if msg.get("status") == "complete" and msg.get("content"):
                openai_messages.append({
                    "role": "assistant", 
                    "content": msg["content"]
                })
    
    return openai_messages

def _count_tokens(text: str) -> int:
    """
    Count tokens using tiktoken with default encoding.
    Simple and good enough for all models.
    """
    try:
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception as e:
        print(f"Error counting tokens: {e}")
        # Fallback: rough estimation (1 token ≈ 4 characters)
        return len(text) // 4

async def _generate_ai_response_async(task_id: str, chat_id: str, user_email: str, enable_search: bool = False):
    """
    Async implementation of AI response generation with Redis Streams.
    Uses Motor directly to avoid event loop conflicts.
    Fetches entire conversation from database for context.
    """
    stream_name = f"chat:{chat_id}:stream"
    sequence = 0
    redis_async_client = None
    
    try:
        # Get database connection for this thread
        db = get_database()
        
        # Create async Redis client with connection pooling
        redis_async_client = redis_async.from_url(
            get_redis_url(),
            max_connections=20,
            retry_on_timeout=True
        )
        
        # Quick consumer group setup (ignore if exists)
        try:
            await redis_async_client.xgroup_create(
                stream_name, "chat_consumers", "0", mkstream=True
            )
        except RedisResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise
        
        # Fast user/chat verification using Motor directly
        user = await db.users.find_one({"email": user_email})
        if not user:
            raise ValueError("User not found")
            
        chat = await db.chats.find_one({"_id": ObjectId(chat_id)})
        if not chat or chat.get("user_id") != str(user["_id"]):
            raise ValueError("Chat not found or unauthorized")
        
        # Fetch entire conversation from database
        messages = await _fetch_conversation_messages(db, chat_id)
        if not messages:
            raise ValueError("No messages found in chat")
        
        # Build conversation context
        gemini_contents = _build_gemini_conversation(messages)
        
        # Get the latest user message for logging
        latest_user_message = None
        for msg in reversed(messages):
            if msg.get("from_user"):
                latest_user_message = msg["content"]
                break
        
        print(f"🔄 Processing conversation with {len(messages)} messages, latest: '{latest_user_message[:50]}...'")
        
        # Create AI message record using Motor directly
        ai_message_doc = {
            "chat_id": chat_id,
            "from_user": False,
            "content": "",
            "model": "gemini-2.0-flash" + (" + Google Search" if enable_search else ""),
            "created_at": datetime.now(),
            "status": "streaming",
            "is_complete": False,
            "tokens": 0  # Will be updated when response is complete
        }
        result = await db.messages.insert_one(ai_message_doc)
        message_id = result.inserted_id
        
        # Send start signal
        await redis_async_client.xadd(stream_name, {
            "type": "start",
            "message_id": str(message_id),
            "task_id": task_id,
            "search_enabled": str(enable_search),
            "timestamp": datetime.now().isoformat()
        })
        
        # Add Google Search tool if enabled
        if enable_search:
            from google.genai.types import Tool, GenerateContentConfig, GoogleSearch
            
            google_search_tool = Tool(google_search=GoogleSearch())
            
            # Generate streaming response from Gemini with Google Search
            response = gemini_client.models.generate_content_stream(
                model="gemini-2.0-flash",
                contents=gemini_contents,
                config=GenerateContentConfig(
                    tools=[google_search_tool],
                    response_modalities=["TEXT"],
                )
            )
        else:
            # Generate streaming response from Gemini without search
            response = gemini_client.models.generate_content_stream(
                model="gemini-2.0-flash",
                contents=gemini_contents
            )
        
        # Stream chunks to Redis Streams
        full_content = ""
        for chunk in response:
            if chunk.text:
                sequence += 1
                full_content += chunk.text
                
                # Add chunk to Redis Stream
                await redis_async_client.xadd(stream_name, {
                    "type": "chunk",
                    "content": chunk.text,
                    "sequence": sequence,
                    "task_id": task_id,
                    "total_length": len(full_content),
                    "timestamp": datetime.now().isoformat()
                })
                
                # Update database every 10 chunks for better performance
                if sequence % 10 == 0:
                    await db.messages.update_one(
                        {"_id": message_id},
                        {"$set": {"content": full_content}}
                    )
                
                # Minimal delay only every 20th chunk
                if sequence % 20 == 0:
                    await asyncio.sleep(0.001)
        
        # Final updates using Motor directly
        tokens = _count_tokens(full_content)
        completion_time = datetime.now()
        
        await db.messages.update_one(
            {"_id": message_id},
            {"$set": {
                "content": full_content,
                "status": "complete",
                "is_complete": True,
                "tokens": tokens,
                "completed_at": completion_time
            }}
        )
        
        # Update chat timestamp
        await db.chats.update_one(
            {"_id": ObjectId(chat_id)},
            {"$set": {"updated_at": datetime.now()}}
        )
        
        # Send completion signal with token count
        await redis_async_client.xadd(stream_name, {
            "type": "complete",
            "message_id": str(message_id),
            "task_id": task_id,
            "final_sequence": sequence,
            "total_chunks": sequence,
            "final_length": len(full_content),
            "search_enabled": str(enable_search),
            "tokens": str(tokens),
            "completed_at": completion_time.isoformat(),
            "timestamp": datetime.now().isoformat()
        })
        
        print(f"✅ Completed AI response with {sequence} chunks in task {task_id} (search: {enable_search}, tokens: {tokens})")
        
        return {
            "status": "complete",
            "message_id": str(message_id),
            "content": full_content,
            "total_chunks": sequence,
            "search_enabled": enable_search,
            "tokens": tokens
        }
        
    except Exception as e:
        # Fast error handling
        if 'message_id' in locals():
            try:
                await db.messages.update_one(
                    {"_id": message_id},
                    {"$set": {"status": "incomplete"}}
                )
            except:
                pass
        
        # Send error to stream
        if redis_async_client:
            try:
                await redis_async_client.xadd(stream_name, {
                    "type": "error",
                    "content": f"Error: {str(e)}",
                    "task_id": task_id,
                    "timestamp": datetime.now().isoformat()
                })
            except:
                pass
        
        raise e
        
    finally:
        # Quick cleanup
        if redis_async_client:
            try:
                await redis_async_client.close()
            except:
                pass

async def _generate_openrouter_response_async(task_id: str, chat_id: str, user_email: str, model_name: str):
    """
    Async implementation of OpenRouter AI response generation with Redis Streams.
    Uses Motor directly to avoid event loop conflicts.
    Fetches entire conversation from database for context.
    """
    stream_name = f"chat:{chat_id}:stream"
    sequence = 0
    redis_async_client = None
    
    try:
        # Get database connection for this thread
        db = get_database()
        
        # Create async Redis client with connection pooling
        redis_async_client = redis_async.from_url(
            get_redis_url(),
            max_connections=20,
            retry_on_timeout=True
        )
        
        # Quick consumer group setup (ignore if exists)
        try:
            await redis_async_client.xgroup_create(
                stream_name, "chat_consumers", "0", mkstream=True
            )
        except RedisResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise
        
        # Fast user/chat verification using Motor directly
        user = await db.users.find_one({"email": user_email})
        if not user:
            raise ValueError("User not found")
            
        chat = await db.chats.find_one({"_id": ObjectId(chat_id)})
        if not chat or chat.get("user_id") != str(user["_id"]):
            raise ValueError("Chat not found or unauthorized")
        
        # Fetch entire conversation from database
        messages = await _fetch_conversation_messages(db, chat_id)
        if not messages:
            raise ValueError("No messages found in chat")
        
        # Build conversation context for OpenAI format
        openai_messages = _build_openai_conversation(messages)
        
        # Create AI message record using Motor directly
        ai_message_doc = {
            "chat_id": chat_id,
            "from_user": False,
            "content": "",
            "model": model_name,
            "created_at": datetime.now(),
            "status": "streaming",
            "is_complete": False,
            "tokens": 0  # Will be updated when response is complete
        }
        result = await db.messages.insert_one(ai_message_doc)
        message_id = result.inserted_id
        
        # Send start signal
        await redis_async_client.xadd(stream_name, {
            "type": "start",
            "message_id": str(message_id),
            "task_id": task_id,
            "model": model_name,
            "timestamp": datetime.now().isoformat()
        })
        
        # Generate streaming response from OpenRouter
        response = openrouter_client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
            },
            model=model_name,
            messages=openai_messages,
            stream=True
        )
        
        # Stream chunks to Redis Streams
        full_content = ""
        for chunk in response:
            # Check if chunk has choices and content
            if (hasattr(chunk, 'choices') and 
                len(chunk.choices) > 0 and 
                hasattr(chunk.choices[0], 'delta') and 
                hasattr(chunk.choices[0].delta, 'content') and 
                chunk.choices[0].delta.content):
                
                sequence += 1
                chunk_content = chunk.choices[0].delta.content
                full_content += chunk_content
                
                # Add chunk to Redis Stream
                await redis_async_client.xadd(stream_name, {
                    "type": "chunk",
                    "content": chunk_content,
                    "sequence": sequence,
                    "task_id": task_id,
                    "total_length": len(full_content),
                    "timestamp": datetime.now().isoformat()
                })
                
                # Update database every 10 chunks for better performance
                if sequence % 10 == 0:
                    await db.messages.update_one(
                        {"_id": message_id},
                        {"$set": {"content": full_content}}
                    )
                
                # Minimal delay only every 20th chunk
                if sequence % 20 == 0:
                    await asyncio.sleep(0.001)
        
        # Final updates using Motor directly
        tokens = _count_tokens(full_content)
        completion_time = datetime.now()
        
        await db.messages.update_one(
            {"_id": message_id},
            {"$set": {
                "content": full_content,
                "status": "complete",
                "is_complete": True,
                "tokens": tokens,
                "completed_at": completion_time
            }}
        )
        
        # Update chat timestamp
        await db.chats.update_one(
            {"_id": ObjectId(chat_id)},
            {"$set": {"updated_at": datetime.now()}}
        )
        
        # Send completion signal with token count
        await redis_async_client.xadd(stream_name, {
            "type": "complete",
            "message_id": str(message_id),
            "task_id": task_id,
            "final_sequence": sequence,
            "total_chunks": sequence,
            "final_length": len(full_content),
            "model": model_name,
            "tokens": str(tokens),
            "completed_at": completion_time.isoformat(),
            "timestamp": datetime.now().isoformat()
        })
        
        print(f"✅ Completed OpenRouter response with {sequence} chunks in task {task_id} (model: {model_name}, tokens: {tokens})")
        
        return {
            "status": "complete",
            "message_id": str(message_id),
            "content": full_content,
            "total_chunks": sequence,
            "model": model_name,
            "tokens": tokens
        }
        
    except Exception as e:
        # Fast error handling
        if 'message_id' in locals():
            try:
                await db.messages.update_one(
                    {"_id": message_id},
                    {"$set": {"status": "incomplete"}}
                )
            except:
                pass
        
        # Send error to stream
        if redis_async_client:
            try:
                await redis_async_client.xadd(stream_name, {
                    "type": "error",
                    "content": f"Error: {str(e)}",
                    "task_id": task_id,
                    "timestamp": datetime.now().isoformat()
                })
            except:
                pass
        
        raise e
        
    finally:
        # Quick cleanup
        if redis_async_client:
            try:
                await redis_async_client.close()
            except:
                pass

async def _generate_github_response_async(task_id: str, chat_id: str, user_email: str, model_name: str):
    """
    Async implementation of GitHub AI response generation with Redis Streams.
    Uses Motor directly to avoid event loop conflicts.
    Fetches entire conversation from database for context.
    """
    stream_name = f"chat:{chat_id}:stream"
    sequence = 0
    redis_async_client = None
    
    try:
        # Get database connection for this thread
        db = get_database()
        
        # Create async Redis client with connection pooling
        redis_async_client = redis_async.from_url(
            get_redis_url(),
            max_connections=20,
            retry_on_timeout=True
        )
        
        # Quick consumer group setup (ignore if exists)
        try:
            await redis_async_client.xgroup_create(
                stream_name, "chat_consumers", "0", mkstream=True
            )
        except RedisResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise
        
        # Fast user/chat verification using Motor directly
        user = await db.users.find_one({"email": user_email})
        if not user:
            raise ValueError("User not found")
            
        chat = await db.chats.find_one({"_id": ObjectId(chat_id)})
        if not chat or chat.get("user_id") != str(user["_id"]):
            raise ValueError("Chat not found or unauthorized")
        
        # Fetch entire conversation from database
        messages = await _fetch_conversation_messages(db, chat_id)
        if not messages:
            raise ValueError("No messages found in chat")
        
        # Build conversation context for OpenAI format
        openai_messages = _build_openai_conversation(messages)
        
        # Create AI message record using Motor directly
        ai_message_doc = {
            "chat_id": chat_id,
            "from_user": False,
            "content": "",
            "model": model_name,
            "created_at": datetime.now(),
            "status": "streaming",
            "is_complete": False,
            "tokens": 0  # Will be updated when response is complete
        }
        result = await db.messages.insert_one(ai_message_doc)
        message_id = result.inserted_id
        
        # Send start signal
        await redis_async_client.xadd(stream_name, {
            "type": "start",
            "message_id": str(message_id),
            "task_id": task_id,
            "model": model_name,
            "timestamp": datetime.now().isoformat()
        })
        
        # Generate streaming response from GitHub
        response = github_client.chat.completions.create(
            model=model_name,
            messages=openai_messages,
            stream=True,
            temperature=1.0,
            top_p=1.0
        )
        
        # Stream chunks to Redis Streams
        full_content = ""
        for chunk in response:
            # Check if chunk has choices and content
            if (hasattr(chunk, 'choices') and 
                len(chunk.choices) > 0 and 
                hasattr(chunk.choices[0], 'delta') and 
                hasattr(chunk.choices[0].delta, 'content') and 
                chunk.choices[0].delta.content):
                
                sequence += 1
                chunk_content = chunk.choices[0].delta.content
                full_content += chunk_content
                
                # Add chunk to Redis Stream
                await redis_async_client.xadd(stream_name, {
                    "type": "chunk",
                    "content": chunk_content,
                    "sequence": sequence,
                    "task_id": task_id,
                    "total_length": len(full_content),
                    "timestamp": datetime.now().isoformat()
                })
                
                # Update database every 10 chunks for better performance
                if sequence % 10 == 0:
                    await db.messages.update_one(
                        {"_id": message_id},
                        {"$set": {"content": full_content}}
                    )
                
                # Minimal delay only every 20th chunk
                if sequence % 20 == 0:
                    await asyncio.sleep(0.001)
        
        # Final updates using Motor directly
        tokens = _count_tokens(full_content)
        completion_time = datetime.now()
        
        await db.messages.update_one(
            {"_id": message_id},
            {"$set": {
                "content": full_content,
                "status": "complete",
                "is_complete": True,
                "tokens": tokens,
                "completed_at": completion_time
            }}
        )
        
        # Update chat timestamp
        await db.chats.update_one(
            {"_id": ObjectId(chat_id)},
            {"$set": {"updated_at": datetime.now()}}
        )
        
        # Send completion signal with token count
        await redis_async_client.xadd(stream_name, {
            "type": "complete",
            "message_id": str(message_id),
            "task_id": task_id,
            "final_sequence": sequence,
            "total_chunks": sequence,
            "final_length": len(full_content),
            "model": model_name,
            "tokens": str(tokens),
            "completed_at": completion_time.isoformat(),
            "timestamp": datetime.now().isoformat()
        })
        
        print(f"✅ Completed GitHub response with {sequence} chunks in task {task_id} (model: {model_name}, tokens: {tokens})")
        
        return {
            "status": "complete",
            "message_id": str(message_id),
            "content": full_content,
            "total_chunks": sequence,
            "model": model_name,
            "tokens": tokens
        }
        
    except Exception as e:
        # Fast error handling
        if 'message_id' in locals():
            try:
                await db.messages.update_one(
                    {"_id": message_id},
                    {"$set": {"status": "incomplete"}}
                )
            except:
                pass
        
        # Send error to stream
        if redis_async_client:
            try:
                await redis_async_client.xadd(stream_name, {
                    "type": "error",
                    "content": f"Error: {str(e)}",
                    "task_id": task_id,
                    "timestamp": datetime.now().isoformat()
                })
            except:
                pass
        
        raise e
        
    finally:
        # Quick cleanup
        if redis_async_client:
            try:
                await redis_async_client.close()
            except:
                pass

def _send_error_to_redis_stream_sync(chat_id: str, error_message: str):
    """Fast error reporting to Redis Stream."""
    try:
        stream_name = f"chat:{chat_id}:stream"
        redis_client.xadd(stream_name, {
            "type": "error",
            "content": f"Error: {error_message}",
            "timestamp": datetime.now().isoformat()
        })
    except:
        pass  # Fail silently to avoid blocking

@celery_app.task
def cleanup_expired_streams():
    """Fast cleanup of expired Redis streams."""
    try:
        pattern = "chat:*:stream"
        current_time_ms = int(datetime.now().timestamp() * 1000)
        
        for key in redis_client.scan_iter(match=pattern, count=100):
            try:
                info = redis_client.xinfo_stream(key)
                last_entry_time = int(info.get('last-generated-id', '0-0').split('-')[0])
                
                # Delete streams older than 24 hours
                if current_time_ms - last_entry_time > 24 * 60 * 60 * 1000:
                    redis_client.delete(key)
                    
            except:
                continue  # Skip problematic streams
                
    except Exception as e:
        print(f"Cleanup error: {e}")