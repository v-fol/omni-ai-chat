import os
from celery import Celery
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Create Celery instance
celery_app = Celery(
    "chat_app",
    broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    include=["tasks"]
)

# Configure Celery for fast startup and parallel processing
celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    
    # Timezone
    timezone="UTC",
    enable_utc=True,
    
    # Performance optimizations
    result_expires=1800,  # 30 minutes instead of 1 hour
    task_routes={
        "tasks.generate_ai_response": {"queue": "ai_generation"},
    },
    
    # Fast startup optimizations
    worker_prefetch_multiplier=1,  # One task per worker at a time
    task_acks_late=True,  # Acknowledge after completion
    worker_max_tasks_per_child=100,  # Restart workers periodically
    task_reject_on_worker_lost=True,  # Retry if worker dies
    
    # Connection optimizations
    broker_connection_retry_on_startup=True,
    broker_pool_limit=50,  # Higher connection pool
    broker_connection_retry=True,
    broker_connection_max_retries=10,
    
    # Disable unnecessary features for speed
    worker_disable_rate_limits=True,  # Disable rate limiting
    task_ignore_result=False,  # We need results
    result_persistent=False,  # Don't persist results to disk
    
    # Redis-specific optimizations
    redis_max_connections=50,
    redis_socket_keepalive=True,
    redis_socket_keepalive_options={
        'TCP_KEEPINTVL': 1,
        'TCP_KEEPCNT': 3,
        'TCP_KEEPIDLE': 1,
    },
    
    # Task execution optimizations
    task_always_eager=False,  # Don't execute tasks synchronously
    task_eager_propagates=False,
    task_store_eager_result=False,
)

if __name__ == "__main__":
    celery_app.start() 