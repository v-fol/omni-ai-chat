#!/usr/bin/env python3
"""
Redis cleanup script to remove pending Celery tasks and chat streams.
Run this before starting Celery to prevent old tasks from executing.
"""

import os
import redis
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def cleanup_redis():
    """Clean up all Celery queues and chat streams from Redis."""
    try:
        # Connect to Redis
        redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
        
        print("🧹 Starting Redis cleanup...")
        
        # 1. Purge Celery queues
        print("📋 Cleaning up Celery queues...")
        
        # Get all keys that match Celery patterns
        celery_patterns = [
            "celery-task-meta-*",  # Task results
            "ai_generation",       # Our specific queue
            "_kombu.binding.*",    # Kombu bindings
            "unacked*",           # Unacknowledged messages
        ]
        
        total_deleted = 0
        for pattern in celery_patterns:
            keys = redis_client.keys(pattern)
            if keys:
                deleted = redis_client.delete(*keys)
                total_deleted += deleted
                print(f"  ✅ Deleted {deleted} keys matching '{pattern}'")
        
        # 2. Clean up chat streams
        print("💬 Cleaning up chat streams...")
        
        stream_keys = redis_client.keys("chat:*:stream")
        if stream_keys:
            # Delete consumer groups first
            for stream_key in stream_keys:
                try:
                    # Get consumer groups
                    groups = redis_client.xinfo_groups(stream_key)
                    for group in groups:
                        group_name = group['name'].decode() if isinstance(group['name'], bytes) else group['name']
                        redis_client.xgroup_destroy(stream_key, group_name)
                        print(f"  🗑️  Destroyed consumer group '{group_name}' for {stream_key.decode()}")
                except Exception as e:
                    # Group might not exist, continue
                    pass
            
            # Delete the streams
            deleted_streams = redis_client.delete(*stream_keys)
            total_deleted += deleted_streams
            print(f"  ✅ Deleted {deleted_streams} chat streams")
        
        # 3. Clean up any other Celery-related keys
        print("🔧 Cleaning up other Celery artifacts...")
        
        other_patterns = [
            "celery*",
            "*celery*",
        ]
        
        for pattern in other_patterns:
            keys = redis_client.keys(pattern)
            # Filter out keys we already handled
            keys = [k for k in keys if not any(p.replace('*', '') in k.decode() for p in celery_patterns)]
            if keys:
                deleted = redis_client.delete(*keys)
                total_deleted += deleted
                print(f"  ✅ Deleted {deleted} additional Celery keys")
        
        print(f"\n🎉 Cleanup complete! Deleted {total_deleted} total keys from Redis.")
        print("✨ Redis is now clean and ready for fresh Celery tasks.")
        
        # Show remaining key count for verification
        all_keys = redis_client.keys("*")
        print(f"📊 Remaining keys in Redis: {len(all_keys)}")
        
        redis_client.close()
        
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
        return False
    
    return True

if __name__ == "__main__":
    print("🚀 Redis Cleanup Tool")
    print("=" * 50)
    
    success = cleanup_redis()
    
    if success:
        print("\n✅ Cleanup successful!")
        print("💡 You can now start Celery without old tasks running.")
    else:
        print("\n❌ Cleanup failed!")
        print("🔍 Check your Redis connection and try again.") 