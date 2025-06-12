#!/usr/bin/env python3
"""
Celery worker startup script.
Run this script to start the Celery worker for background AI task processing.
"""

import os
import sys
from celery_app import celery_app

if __name__ == "__main__":
    # Set the module path for imports
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    # Start the Celery worker
    celery_app.worker_main([
        'worker',
        '--loglevel=info',
        '--concurrency=1',  # Adjust based on your needs
        '--queues=ai_generation',
        '--pool=solo',  # Use solo pool for better compatibility with async code
    ]) 