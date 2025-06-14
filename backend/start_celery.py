#!/usr/bin/env python3
"""
Celery worker startup script.
Run this script to start the Celery worker for background AI task processing.
"""

import os
import sys
from celery_app import celery_app
from cleanup_redis import cleanup_redis

if __name__ == "__main__":
    # Set the module path for imports
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    # Clean up Redis before starting Celery
    print("🧹 Cleaning up Redis before starting Celery...")
    cleanup_success = cleanup_redis()
    
    if not cleanup_success:
        print("⚠️  Warning: Redis cleanup failed, but continuing anyway...")
    
    print("🚀 Starting Celery worker...")
    
    # Start the Celery worker with threads for fast startup
    celery_app.worker_main([
        'worker',
        '--loglevel=info',
        '--concurrency=6',  # Good balance for threads
        '--queues=ai_generation',
        '--pool=threads',  # Threads for fast startup
        '--prefetch-multiplier=1',  # One task per thread
        '--without-gossip',  # Disable gossip for faster startup
        '--without-mingle',  # Disable mingle for faster startup
        '--max-tasks-per-child=20',  # Restart threads periodically
        '--optimization=fair',  # Fair task distribution
    ]) 