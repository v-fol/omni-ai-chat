const API_BASE_URL = 'http://localhost:8000';

export const getChats = async () => {
  const response = await fetch(`${API_BASE_URL}/chats`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch chats');
  }
  return response.json();
};

export const getChat = async (chatId: string) => {
  const response = await fetch(`${API_BASE_URL}/chat/${chatId}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch chat details');
  }
  return response.json();
};

export const createChat = async (firstMessage: string) => {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ first_message: firstMessage }),
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to create chat');
  }
  return response.json();
};

export const deleteChat = async (chatId: string) => {
  const response = await fetch(`${API_BASE_URL}/chat/${chatId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to delete chat');
  }
  return response.json();
};

export const transcribeVoice = async (audioData: string, mimeType: string = 'audio/mp3') => {
  const response = await fetch(`${API_BASE_URL}/voice/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      audio_data: audioData,
      mime_type: mimeType 
    }),
    credentials: 'include',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to transcribe voice');
  }
  return response.json();
}; 