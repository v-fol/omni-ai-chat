#!/usr/bin/env python3
"""
Celery queue purge script.
Alternative method using Celery's built-in purge functionality.
"""

import os
import sys
from celery_app import celery_app
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def purge_celery_queues():
    """Purge all Celery queues using Celery's built-in functionality."""
    try:
        print("🧹 Purging Celery queues...")
        
        # Purge the ai_generation queue
        purged = celery_app.control.purge()
        print(f"✅ Purged queues: {purged}")
        
        # Also purge specific queue
        with celery_app.connection() as connection:
            # Purge the ai_generation queue specifically
            queue = connection.SimpleQueue('ai_generation')
            purged_count = 0
            try:
                while True:
                    queue.get(block=False)
                    purged_count += 1
            except:
                pass  # Queue is empty
            
            if purged_count > 0:
                print(f"✅ Purged {purged_count} messages from ai_generation queue")
            else:
                print("✅ ai_generation queue was already empty")
        
        print("🎉 Celery queue purge complete!")
        return True
        
    except Exception as e:
        print(f"❌ Error purging Celery queues: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Celery Queue Purge Tool")
    print("=" * 50)
    
    success = purge_celery_queues()
    
    if success:
        print("\n✅ Purge successful!")
        print("💡 All pending Celery tasks have been removed.")
    else:
        print("\n❌ Purge failed!")
        print("🔍 Check your Celery configuration and try again.") 