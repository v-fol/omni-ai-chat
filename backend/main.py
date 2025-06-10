import os
from typing import Union, Optional, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Depends
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

from db.engine import User, Chat, Message, init as init_db

# Load environment variables
load_dotenv()

# Configure Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=GOOGLE_API_KEY)

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY"))

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    await init_db()

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

    # Create the new chat
    new_chat = Chat(
        user_id=str(user.id),
        title=title,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    await new_chat.insert()
    
    # Create and save the first user message
    user_message = Message(
        chat_id=str(new_chat.id),
        from_user=True,
        content=body.first_message,
        model="user",
        created_at=datetime.now()
    )
    await user_message.insert()

    print(f"Created new chat {new_chat.id} with title '{title}' and first message.")
    
    # Return the full new chat object, making sure IDs are strings
    return {
        "id": str(new_chat.id),
        "title": new_chat.title,
        "created_at": new_chat.created_at,
        "updated_at": new_chat.updated_at,
        "messages": [{
            "id": str(user_message.id),
            "chat_id": str(new_chat.id),
            "from_user": user_message.from_user,
            "content": user_message.content,
            "model": user_message.model,
            "created_at": user_message.created_at,
            "is_complete": user_message.is_complete,
            "status": user_message.status,
        }]
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
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get chat and verify ownership
    chat = await Chat.get(chat_id)
    if not chat or chat.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Chat not found")
    
    try:
        # Delete all messages in the chat
        await Message.find(Message.chat_id == chat_id).delete()
        
        # Delete the chat
        await chat.delete()
        
        return {"message": "Chat deleted successfully"}
    except Exception as e:
        print(f"Error deleting chat: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete chat")

@app.websocket("/chat/{chat_id}/ws")
async def chat_websocket(websocket: WebSocket, chat_id: str):
    """
    WebSocket endpoint for streaming chat responses from Gemini.
    """
    print("New WebSocket connection attempt...")
    await websocket.accept()
    print("WebSocket connection accepted")
    
    try:
        # Get user from session cookie
        cookies = websocket.cookies
        session = cookies.get("session")
        if not session:
            print("No session cookie found")
            await websocket.close(code=1008, reason="Not authenticated")
            return


        # Parse session data using the same method as SessionMiddleware
        try:
            # First, base64 decode the session
            decoded = base64.b64decode(session)

            # The session data is just JSON encoded, no need for signature extraction
            session_data = json.loads(decoded)
            
            user_data = session_data.get('user')
            if not user_data:
                print("No user data in session")
                await websocket.close(code=1008, reason="Not authenticated")
                return
                
        except Exception as e:
            print(f"Failed to decode session: {e}")
            print(f"Session content type: {type(session)}")
            await websocket.close(code=1008, reason="Invalid session")
            return

        # Find user in database
        user = await User.find_one(User.email == user_data['email'])
        if not user:
            print("User not found in database")
            await websocket.close(code=1008, reason="User not found")
            return
            
        # Find chat and verify ownership
        chat = await Chat.get(chat_id)
        if not chat or chat.user_id != str(user.id):
            print("Chat not found or unauthorized")
            await websocket.close(code=1008, reason="Chat not found")
            return
        
        print(f"WebSocket connection established for user {user.email} and chat {chat_id}")
        
        while True:
            message_text = await websocket.receive_text()
            print(f"Received message: {message_text}")
            
            # Check if the received message is a duplicate of the first message saved via HTTP
            # to prevent creating a duplicate entry.
            message_count = await Message.find(
                {"chat_id": chat_id, "from_user": True}
            ).count()
            
            should_save = True
            if message_count == 1:
                first_message = await Message.find_one(
                    {"chat_id": chat_id, "from_user": True}
                )
                if first_message and first_message.content == message_text:
                    print("Kick-off message is the same as the one saved via HTTP. Skipping save.")
                    should_save = False

            if should_save:
                user_message = Message(
                    chat_id=chat_id,
                    from_user=True,
                    content=message_text,
                    model="user",
                    created_at=datetime.now(),
                )
                await user_message.insert()

            # Title is now set exclusively by the POST /chat endpoint.
            
            try:
                # Generate streaming response
                response = client.models.generate_content_stream(
                    model="gemini-2.0-flash",
                    contents=message_text
                )
                
                # Create AI message to store the complete response
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
                
                # Stream each chunk to the client with a small delay
                try:
                    for chunk in response:
                        if chunk.text:
                            await websocket.send_text(chunk.text)
                            print(f"Sent chunk: {chunk.text[:50]}...")
                            # Update the AI message content
                            ai_message.content += chunk.text
                            await ai_message.save()
                            # Add a tiny delay to ensure chunks are processed separately
                            await asyncio.sleep(0.01)
                    
                    # Mark message as complete
                    ai_message.status = "complete"
                    ai_message.is_complete = True
                    await ai_message.save()
                    
                    # Update chat's updated_at timestamp
                    chat.updated_at = datetime.now()
                    await chat.save()
                    
                    # Send a special marker to indicate response completion
                    await websocket.send_text("[DONE]")
                    print("Sent [DONE] marker")
                except WebSocketDisconnect:
                    # Mark message as incomplete if connection drops
                    ai_message.status = "incomplete"
                    await ai_message.save()
                    raise
                except Exception as e:
                    print(f"Error in streaming: {e}")
                    ai_message.status = "incomplete"
                    await ai_message.save()
                    raise
                    
            except Exception as e:
                error_message = f"Error: {str(e)}"
                print(f"Error generating response: {error_message}")
                await websocket.send_text(error_message)
                await websocket.send_text("[DONE]")
                
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass
    finally:
        print("WebSocket connection closed")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)