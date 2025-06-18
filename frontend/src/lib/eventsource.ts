export interface StreamMessage {
  type: 'start' | 'chunk' | 'complete' | 'error' | 'connected' | 'heartbeat' | 'terminated';
  content?: string;
  message_id?: string;
  task_id?: string;
  sequence?: number;
  total_length?: number;
  final_sequence?: number;
  total_chunks?: number;
  final_length?: number;
  tokens?: string; // Token count for the message
  completed_at?: string; // ISO timestamp when message was completed
  timestamp: string;
  stream_id?: string; // Redis Stream message ID
  consumer?: string;
  last_id?: string;
}

export interface ChatEventSourceOptions {
  onChunk?: (content: string, sequence?: number) => void;
  onComplete?: (messageId: string, totalChunks?: number, tokens?: number, completedAt?: Date) => void;
  onError?: (error: string) => void;
  onStart?: (messageId: string) => void;
  onConnected?: (consumer: string) => void;
  onHeartbeat?: (lastId?: string) => void;
  onTerminated?: (taskId: string, message?: string) => void;
}

export class ChatEventSource {
  private eventSource: EventSource | null = null;
  private chatId: string;
  private baseUrl: string;
  private options: ChatEventSourceOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private lastMessageId: string | null = null;
  private isManualClose = false;

  constructor(chatId: string, options: ChatEventSourceOptions = {}) {
    this.chatId = chatId;
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    this.options = options;
    
    // Load last message ID from localStorage for page refresh recovery
    this.lastMessageId = this.getStoredLastMessageId();
  }

  private getStorageKey(): string {
    return `chat_last_message_id_${this.chatId}`;
  }

  private getStoredLastMessageId(): string | null {
    try {
      return localStorage.getItem(this.getStorageKey());
    } catch {
      return null;
    }
  }

  private storeLastMessageId(messageId: string): void {
    try {
      localStorage.setItem(this.getStorageKey(), messageId);
      this.lastMessageId = messageId;
    } catch (error) {
      console.warn('Failed to store last message ID:', error);
    }
  }

  private clearStoredLastMessageId(): void {
    try {
      localStorage.removeItem(this.getStorageKey());
      this.lastMessageId = null;
    } catch (error) {
      console.warn('Failed to clear stored last message ID:', error);
    }
  }

  connect(): void {
    if (this.eventSource) {
      return; // Already connected
    }

    this.isManualClose = false;
    
    // Build URL with optional last_id parameter for resume
    let url = `${this.baseUrl}/sse/chat/${this.chatId}`;
    if (this.lastMessageId) {
      url += `?last_id=${encodeURIComponent(this.lastMessageId)}`;
      console.log(`Resuming from message ID: ${this.lastMessageId}`);
    }

    this.eventSource = new EventSource(url, {
      withCredentials: true
    });

    this.eventSource.onopen = () => {
      console.log(`SSE connected to chat ${this.chatId}`);
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000; // Reset delay
    };

    this.eventSource.onmessage = (event) => {
      try {
        console.debug('SSE Raw event:', {
          data: event.data,
          type: event.type,
          lastEventId: event.lastEventId
        });
        
        // Ensure we have valid JSON data
        if (!event.data || event.data.trim() === '') {
          console.warn('Received empty SSE data, skipping');
          return;
        }
        
        const data: StreamMessage = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
        console.error('Raw event object:', event);
        console.error('Event.data type:', typeof event.data);
        console.error('Event.data length:', event.data?.length);
        console.error('Event.data content:', JSON.stringify(event.data));
        
        // Try to handle malformed data
        if (typeof event.data === 'string' && event.data.startsWith('data: ')) {
          try {
            // Strip the 'data: ' prefix if it's present
            const cleanData = event.data.substring(6).trim();
            console.log('Attempting to parse cleaned data:', cleanData);
            const data: StreamMessage = JSON.parse(cleanData);
            this.handleMessage(data);
          } catch (secondError) {
            console.error('Failed to parse cleaned data:', secondError);
            this.options.onError?.('Failed to parse stream message');
          }
        } else {
          this.options.onError?.('Invalid stream message format');
        }
      }
    };

    this.eventSource.onerror = (event) => {
      console.error('SSE connection error:', event);
      
      if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
        
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
          if (!this.isManualClose) {
            this.disconnect();
            this.connect();
          }
        }, delay);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.options.onError?.('Failed to reconnect to chat stream');
      }
    };
  }

  private handleMessage(data: StreamMessage): void {
    // Store stream ID for potential reconnection
    if (data.stream_id) {
      this.storeLastMessageId(data.stream_id);
    }

    switch (data.type) {
      case 'connected':
        console.log(`Connected to Redis Stream with consumer: ${data.consumer}`);
        this.options.onConnected?.(data.consumer || 'unknown');
        break;

      case 'start':
        console.log(`AI response started: ${data.message_id}`);
        this.options.onStart?.(data.message_id || 'unknown');
        break;

      case 'chunk':
        if (data.content) {
          this.options.onChunk?.(data.content, data.sequence);
        }
        break;

      case 'complete':
        console.log(`AI response completed: ${data.message_id} (${data.total_chunks} chunks)`);
        this.options.onComplete?.(data.message_id || 'unknown', data.total_chunks, data.tokens ? parseInt(data.tokens) : undefined, data.completed_at ? new Date(data.completed_at) : undefined);
        break;

      case 'error':
        console.error('Stream error:', data.content);
        this.options.onError?.(data.content || 'Unknown stream error');
        break;

      case 'heartbeat':
        // Update last_id from heartbeat
        if (data.last_id) {
          this.storeLastMessageId(data.last_id);
        }
        this.options.onHeartbeat?.(data.last_id);
        break;

      case 'terminated':
        console.log(`Task terminated: ${data.task_id}, message: ${data.content}`);
        this.options.onTerminated?.(data.task_id || 'unknown', data.content);
        break;

      default:
        console.warn('Unknown message type:', data.type, data);
    }
  }

  disconnect(): void {
    this.isManualClose = true;
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    console.log(`SSE disconnected from chat ${this.chatId}`);
  }

  // Clear stored message ID when starting a new conversation
  reset(): void {
    this.clearStoredLastMessageId();
  }

  // Get current connection status
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }

  // Force reconnection
  reconnect(): void {
    console.log('Forcing reconnection...');
    this.disconnect();
    setTimeout(() => this.connect(), 100);
  }

  // Get last stored message ID
  getLastMessageId(): string | null {
    return this.lastMessageId;
  }
}

// Utility function to send a message to the chat
export async function sendChatMessage(
  chatId: string, 
  message: string, 
  enableSearch: boolean = false,
  model: string = "gemini-2.0-flash",
  provider: string = "google"
): Promise<{success: boolean, taskId?: string, error?: string, searchEnabled?: boolean, model?: string, provider?: string, tokens?: number}> {
  try {
    const response = await fetch(`http://localhost:8000/chat/${chatId}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ 
        message, 
        enable_search: enableSearch,
        model,
        provider
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      return { success: false, error: errorData.detail || 'Failed to send message' };
    }

    const data = await response.json();
    console.log('API Response data:', data); // Debug log
    return { 
      success: true, 
      taskId: data.task_id, 
      searchEnabled: data.search_enabled,
      model: data.model,
      provider: data.provider,
      tokens: data.tokens // Backend sends as number, no need to parse
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
} 