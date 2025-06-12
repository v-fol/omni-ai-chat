import os
import asyncio
import json
from typing import Optional
from datetime import datetime
from celery import current_task
from google import genai
from dotenv import load_dotenv
import redis
import redis.asyncio as redis_async
from redis.exceptions import ResponseError as RedisResponseError

from celery_app import celery_app
from db.engine import User, Chat, Message, init as init_db

# Load environment variables
load_dotenv()

# Configure Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=GOOGLE_API_KEY)

# Synchronous Redis connection for Celery tasks
redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))

@celery_app.task(bind=True)
def generate_ai_response(self, chat_id: str, user_message: str, user_email: str):
    """
    Generate AI response and stream chunks to Redis Streams.
    This task runs in the background and stores chunks persistently.
    """
    task_id = self.request.id
    
    try:
        # Run the async function in a new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                _generate_ai_response_async(task_id, chat_id, user_message, user_email)
            )
            return result
        finally:
            loop.close()
    except Exception as e:
        # Send error to Redis stream using sync client
        _send_error_to_redis_stream_sync(chat_id, str(e))
        raise e

async def _generate_ai_response_async(task_id: str, chat_id: str, user_message: str, user_email: str):
    """
    Async implementation of AI response generation with Redis Streams.
    """
    stream_name = f"chat:{chat_id}:stream"
    sequence = 0
    
    try:
        # Initialize database connection
        await init_db()
        
        # Create async Redis client for this function
        redis_async_client = redis_async.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
        
        try:
            # Create consumer group (ignore if already exists)
            try:
                await redis_async_client.xgroup_create(
                    stream_name, 
                    "chat_consumers", 
                    "0", 
                    mkstream=True
                )
                print(f"Created consumer group for {stream_name}")
            except RedisResponseError as e:
                if "BUSYGROUP" not in str(e):
                    raise
                # Group already exists, continue
                pass
            
            # Verify user and chat
            user = await User.find_one(User.email == user_email)
            if not user:
                raise ValueError("User not found")
                
            chat = await Chat.get(chat_id)
            if not chat or chat.user_id != str(user.id):
                raise ValueError("Chat not found or unauthorized")
            
            # Create AI message record
            ai_message = Message(
                chat_id=chat_id,
                from_user=False,
                content="",
                model="gemini-2.0-flash",
                created_at=datetime.now(),
                status="streaming",
                is_complete=False
            )
            await ai_message.insert()
            
            # Send start signal to stream
            await redis_async_client.xadd(
                stream_name,
                {
                    "type": "start",
                    "message_id": str(ai_message.id),
                    "task_id": task_id,
                    "timestamp": datetime.now().isoformat()
                }
            )
            
            # Prepare for streaming
            full_content = ""
            
            # Generate streaming response from Gemini
            response = client.models.generate_content_stream(
                model="gemini-2.0-flash",
                contents=user_message
            )
            
            # Stream chunks to Redis Streams
            for chunk in response:
                if chunk.text:
                    sequence += 1
                    full_content += chunk.text
                    
                    # Add chunk to Redis Stream (persistent!)
                    message_id = await redis_async_client.xadd(
                        stream_name,
                        {
                            "type": "chunk",
                            "content": chunk.text,
                            "sequence": sequence,
                            "task_id": task_id,
                            "total_length": len(full_content),
                            "timestamp": datetime.now().isoformat()
                        }
                    )
                    
                    print(f"Added chunk {sequence} to stream: {message_id}")
                    
                    # Update message in database with current content
                    ai_message.content = full_content
                    await ai_message.save()
                    
                    # Small delay to prevent overwhelming
                    await asyncio.sleep(0.01)
            
            # Mark message as complete
            ai_message.status = "complete"
            ai_message.is_complete = True
            await ai_message.save()
            
            # Update chat timestamp
            chat.updated_at = datetime.now()
            await chat.save()
            
            # Send completion signal to stream
            await redis_async_client.xadd(
                stream_name,
                {
                    "type": "complete",
                    "message_id": str(ai_message.id),
                    "task_id": task_id,
                    "final_sequence": sequence,
                    "total_chunks": sequence,
                    "final_length": len(full_content),
                    "timestamp": datetime.now().isoformat()
                }
            )
            
            print(f"Completed AI response with {sequence} chunks")
            
            # Schedule cleanup of old stream data (keep last 1000 messages)
            try:
                await redis_async_client.xtrim(stream_name, maxlen=1000, approximate=True)
            except Exception as trim_error:
                print(f"Warning: Failed to trim stream: {trim_error}")
            
            return {
                "status": "complete",
                "message_id": str(ai_message.id),
                "content": full_content,
                "total_chunks": sequence
            }
            
        finally:
            await redis_async_client.close()
        
    except Exception as e:
        # Mark message as incomplete if it exists
        try:
            if 'ai_message' in locals():
                ai_message.status = "incomplete"
                await ai_message.save()
        except:
            pass
            
        # Send error to Redis Stream
        _send_error_to_redis_stream_sync(chat_id, str(e))
        raise e

def _send_error_to_redis_stream_sync(chat_id: str, error_message: str):
    """Helper function to send error messages to Redis Stream using sync client."""
    try:
        stream_name = f"chat:{chat_id}:stream"
        redis_client.xadd(
            stream_name,
            {
                "type": "error",
                "content": f"Error: {error_message}",
                "timestamp": datetime.now().isoformat()
            }
        )
    except Exception as e:
        print(f"Failed to send error to Redis Stream: {e}")

@celery_app.task
def cleanup_expired_streams():
    """
    Periodic task to clean up expired Redis streams.
    Can be scheduled with Celery Beat.
    """
    try:
        # Get all chat streams
        pattern = "chat:*:stream"
        for key in redis_client.scan_iter(match=pattern):
            key_str = key.decode() if isinstance(key, bytes) else key
            
            # Get stream info
            try:
                info = redis_client.xinfo_stream(key_str)
                last_entry_time = info.get('last-generated-id', '0-0').split('-')[0]
                
                # If stream is older than 24 hours, delete it
                current_time_ms = int(datetime.now().timestamp() * 1000)
                if current_time_ms - int(last_entry_time) > 24 * 60 * 60 * 1000:
                    redis_client.delete(key_str)
                    print(f"Cleaned up expired stream: {key_str}")
                    
            except Exception as e:
                print(f"Error processing stream {key_str}: {e}")
                
    except Exception as e:
        print(f"Error in cleanup task: {e}") 