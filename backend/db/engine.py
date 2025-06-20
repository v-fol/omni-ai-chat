from typing import Optional
from datetime import datetime
import uuid
import os

import motor.motor_asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from beanie import Document, Indexed, Link, init_beanie


class Message(Document):
    chat_id: str
    from_user: bool
    content: str
    model: str
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None  # When the message was completed (for AI messages)
    is_complete: bool = True  # False for interrupted AI responses
    status: str = "complete"  # can be "complete", "incomplete", "streaming", "terminated"
    tokens: int = 0  # Token count for this message

    class Settings:
        name = "messages"
        indexes = [
            "chat_id",
            "created_at",
            "status"
        ]


class Chat(Document):
    user_id: str
    title: str = "New Chat"
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    class Settings:
        name = "chats"
        indexes = [
            "user_id",
            "updated_at"
        ]


class User(Document):
    name: str
    email: str
    created_at: datetime
    updated_at: datetime
    messages_per_day: int = 200

    class Settings:
        name = "users"
        indexes = [
            "email"
        ]


# Call this from within your event loop to get beanie setup.
async def init():
    # Get MongoDB URL from environment or use default
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    database_name = os.getenv("DATABASE_NAME", "omni_chat")
    
    print(f"🔗 Connecting to MongoDB: {mongodb_url}")
    print(f"📊 Using database: {database_name}")
    
    # Create Motor client
    client = AsyncIOMotorClient(mongodb_url)

    # Init beanie with all document models
    await init_beanie(database=client[database_name], document_models=[User, Chat, Message])
    
    print("✅ Database connection established")