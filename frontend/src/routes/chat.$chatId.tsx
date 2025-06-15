import { createFileRoute, useLocation } from '@tanstack/react-router'
import { useAtom } from 'jotai';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { chatPositionAtom, isAutoScrollAtom, chatMessagesAtom, isLoadingAtom, userAtom, searchEnabledAtom, selectedModelAtom } from '@/lib/atoms';
import type { Message as MessageType } from '@/lib/atoms';
import { useEffect, useRef, useState, useCallback } from 'react';
import { ChatEventSource, sendChatMessage } from '@/lib/eventsource';
import { Message } from '@/components/chat/Message';
import { useChat } from '@/lib/queries';
import { FloatingChatContainer } from '@/components/chat/FloatingChatContainer';

export const Route = createFileRoute('/chat/$chatId')({
  component: ChatComponent,
})

function ChatComponent() {
  const { chatId } = Route.useParams();
  const location = useLocation();
  
  const [chatPosition, setChatPosition] = useAtom(chatPositionAtom);
  const [isAutoScroll, setIsAutoScroll] = useAtom(isAutoScrollAtom);
  const { theme } = useTheme();
  const [messages, setMessages] = useAtom(chatMessagesAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [user] = useAtom(userAtom);
  const [searchEnabled, setSearchEnabled] = useAtom(searchEnabledAtom);
  const [selectedModel] = useAtom(selectedModelAtom);
  const { data: chatData } = useChat(chatId);
  
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [userScrolledManually, setUserScrolledManually] = useState(false);
  const [shouldMonitorScrolls, setShouldMonitorScrolls] = useState(false);
  const sseRef = useRef<ChatEventSource | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (chatData) {
      const loadedMessages = chatData.messages.map((msg: any) => ({
        content: msg.content,
        isUser: msg.from_user,
        timestamp: new Date(msg.created_at),
        model: msg.model,
        completedAt: msg.completed_at ? new Date(msg.completed_at) : undefined,
        status: msg.status,
        isComplete: msg.is_complete,
        tokens: msg.tokens // Include token count from database
      }));
      
      // Merge with existing messages to avoid overwriting optimistic updates
      setMessages(prev => {
        console.log('🔄 Merging messages:', { 
          prevLength: prev.length, 
          loadedLength: loadedMessages.length,
          hasOptimistic: prev.some(m => m.tempId)
        });
        
        // If we have no previous messages, just use the loaded ones
        if (prev.length === 0) {
          console.log('📥 No previous messages, using loaded messages');
          return loadedMessages;
        }
        
        // If loaded messages are the same length or longer, use them (database is authoritative)
        if (loadedMessages.length >= prev.length) {
          console.log('📊 Database has same or more messages, using database as source of truth');
          // Clean up any tempId properties from database messages
          return loadedMessages.map((msg: MessageType) => ({ ...msg, tempId: undefined }));
        }
        
        // If we have more messages in UI than in database (optimistic updates),
        // keep only the optimistic messages (those with tempId) that aren't in the database yet
        const optimisticMessages = prev.slice(loadedMessages.length).filter(msg => msg.tempId);
        console.log('🚀 Preserving optimistic messages:', optimisticMessages.length);
        return [...loadedMessages.map((msg: MessageType) => ({ ...msg, tempId: undefined })), ...optimisticMessages];
      });
    } else {
      setMessages([]);
    }
  }, [chatData, setMessages]);
  
  // Effect 1: Scroll user's question to top and set up spacer
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage?.isUser) {
      // Reset manual scroll flag for new conversation and disable scroll monitoring temporarily
      setUserScrolledManually(false);
      setShouldMonitorScrolls(false);
      
      // Scroll user message to top
      const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        // Set spacer to push user message to top of viewport
        const viewportHeight = scrollViewport.clientHeight;
        setSpacerHeight(viewportHeight - 200); // 200px buffer for user message
        
        // Scroll to the user message after a brief delay to let spacer render
        setTimeout(() => {
          const messageElements = scrollViewport.querySelectorAll('.message-item');
          const userMessageElement = messageElements[messageElements.length - 1] as HTMLElement;
          if (userMessageElement) {
            userMessageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Enable scroll monitoring after our programmatic scroll settles
            setTimeout(() => {
              setShouldMonitorScrolls(true);
            }, 500);
          }
        }, 50);
      }
    }
  }, [messages.filter(m => m.isUser).length]);

  // Smart scroll detection - only monitor during AI response streaming
  useEffect(() => {
    const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!scrollViewport) return;

    const handleScroll = () => {
      // Only monitor scrolls when we're supposed to (during AI streaming)
      if (!shouldMonitorScrolls) return;
      
      // Clear any pending auto-scroll timeout
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
        autoScrollTimeoutRef.current = null;
      }

      const { scrollTop, scrollHeight, clientHeight } = scrollViewport;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      // If user is more than 200px from bottom, consider it manual scroll
      if (distanceFromBottom > 200) {
        setUserScrolledManually(true);
      }
    };

    scrollViewport.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollViewport.removeEventListener('scroll', handleScroll);
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, [shouldMonitorScrolls]);

  // Effect 2: Handle AI message streaming and auto-scroll
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage && !lastMessage.isUser && lastMessage.status === 'streaming') {
      const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (!scrollViewport) return;

      const messageElements = scrollViewport.querySelectorAll('.message-item');
      const aiMessageElement = messageElements[messageElements.length - 1] as HTMLElement;
      
      if (!aiMessageElement) return;

      // Check if answer is short to prevent UI jitter
      const isShortAnswer = aiMessageElement.offsetHeight < 150;
      
      // Remove spacer when AI message gets long enough or reaches viewport edge
      if (spacerHeight > 0) {
        const aiMessageRect = aiMessageElement.getBoundingClientRect();
        const viewportRect = scrollViewport.getBoundingClientRect();
        
        if (aiMessageRect.bottom >= viewportRect.bottom - 100) {
          setSpacerHeight(0);
        }
      }
      
      // Auto-scroll logic: only if enabled, user hasn't scrolled away, and answer is long enough
      if (isAutoScroll && !userScrolledManually && !isShortAnswer && spacerHeight === 0) {
        // Clear any pending timeout
        if (autoScrollTimeoutRef.current) {
          clearTimeout(autoScrollTimeoutRef.current);
        }
        
        // Debounce auto-scroll to prevent conflicts
        autoScrollTimeoutRef.current = setTimeout(() => {
          scrollViewport.scrollTo({ 
            top: scrollViewport.scrollHeight, 
            behavior: 'auto' 
          });
        }, 50);
      }
    }
  }, [messages, spacerHeight, isAutoScroll, userScrolledManually]);

  // Effect 3: Clean up when message is complete
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage && !lastMessage.isUser && lastMessage.status === 'complete') {
      setSpacerHeight(0); // Ensure spacer is removed
      // Reset flags for next conversation
      setUserScrolledManually(false);
      setShouldMonitorScrolls(false);
      
      // Clear any pending auto-scroll
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
        autoScrollTimeoutRef.current = null;
      }
    }
  }, [messages.map(m => m.status).join(',')]); // Trigger when any message status changes

  // Scroll to bottom when chat loads or switches (only for initial load, not during streaming)
  useEffect(() => {
    if (messages.length > 0) {
      const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        // Only scroll if not currently streaming (to avoid conflicts with auto-scroll)
        const lastMessage = messages.at(-1);
        const isStreaming = lastMessage && !lastMessage.isUser && lastMessage.status === 'streaming';
        
        if (!isStreaming) {
          scrollViewport.scrollTop = scrollViewport.scrollHeight;
        }
      }
    }
  }, [chatId, messages.length]); // Only trigger on chat switch or initial message load

  // SSE Connection management
  useEffect(() => {
    if (!chatId || !user) return;

    // Create SSE connection with Redis Streams support
    const sse = new ChatEventSource(chatId, {
      onChunk: handleSSEChunk,
      onComplete: handleSSEComplete,
      onError: handleSSEError,
      onStart: handleSSEStart,
      onConnected: (consumer: string) => {
        console.log('SSE connected to Redis Stream for chat', chatId, 'with consumer:', consumer);
        
        // Send initial message if coming from new chat creation
        const kickOffMessage = location.state?.firstMessage;
        
        if (kickOffMessage) {
          console.log('Sending initial message via SSE with search:', searchEnabled);
          handleSendMessage(kickOffMessage);
          
          // Clear the state so we don't send it again
          window.history.replaceState({ ...window.history.state, firstMessage: undefined }, '');
        }
      },
      onHeartbeat: (lastId?: string) => {
        // Optionally handle heartbeats - Redis Streams keeps track of last processed message
        if (lastId) {
          console.debug('Heartbeat received, last processed message ID:', lastId);
        }
      }
    });

    sse.connect();
    sseRef.current = sse;

    return () => {
      sse.disconnect();
      sseRef.current = null;
    };
  }, [chatId, user]);

  const handleSendMessage = useCallback(async (messageText: string) => {
    const textToSend = messageText.trim();
    if (!textToSend || isLoading) return;

    // Generate a unique temp ID for tracking this message
    const tempId = `temp-${Date.now()}`;

    // Optimistically add the user's message to the UI
    const optimisticMessage: MessageType = {
      content: textToSend,
      isUser: true,
      timestamp: new Date(),
      model: selectedModel.id,
      status: 'complete',
      isComplete: true,
      tempId: tempId, // Add temporary ID for tracking,
      tokens: 0
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setIsLoading(true); // Start loading for AI response

    // Send message via HTTP API with model and search options
    const result = await sendChatMessage(
      chatId, 
      textToSend, 
      searchEnabled && selectedModel.supports_search, // Only enable search if model supports it
      selectedModel.id,
      selectedModel.provider,
    );
    
    if (!result.success) {
      console.error("Failed to send message:", result.error);
      // Revert optimistic updates
      setMessages(prev => prev.filter(msg => msg.tempId !== tempId));
      setIsLoading(false);
      setSpacerHeight(0);
      alert(`Failed to send message: ${result.error}`);
    } else {
      // Update the user message with the specific tempId with token count from API
      console.log('API Response tokens:', result.tokens);
      if (result.tokens !== undefined && result.tokens > 0) {
        setMessages(prev => {
          const updated = prev.map(msg => 
            msg.tempId === tempId ? { ...msg, tokens: result.tokens } : msg
          );
          console.log('Updated user message with tokens:', updated.find(msg => msg.tempId === tempId));
          return updated;
        });
      }
      console.log(`Message sent successfully, task ID: ${result.taskId}, model: ${result.model}, provider: ${result.provider}`);
    }
  }, [chatId, isLoading, selectedModel, searchEnabled, setMessages, setIsLoading, setSpacerHeight]);

  const handleVoiceTranscription = useCallback((transcribedText: string) => {
    // This is now handled by the ChatInput component directly
  }, []);

  const handleSSEStart = (messageId: string) => {
    console.log('AI response started, message ID:', messageId);
    // Create placeholder for AI message
    const aiMessage: MessageType = {
      content: '',
      isUser: false,
      timestamp: new Date(),
      model: selectedModel.id,
      status: 'streaming',
      isComplete: false
    };
    setMessages(prev => [...prev, aiMessage]);
  };

  const handleSSEChunk = (text: string, sequence?: number) => {
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && !lastMessage.isUser && lastMessage.status === 'streaming') {
        return [...prev.slice(0, -1), { 
          ...lastMessage, 
          content: lastMessage.content + text,
          status: 'streaming'
        }];
      }
      // If no streaming message exists, create one (fallback)
      return [...prev, { 
        content: text, 
        isUser: false, 
        timestamp: new Date(), 
        model: selectedModel.id,
        status: 'streaming',
        isComplete: false
      }];
    });
  };

  const handleSSEComplete = (messageId: string, totalChunks?: number, tokens?: number, completedAt?: Date) => {
    console.log('Message generation complete:', messageId, 'Total chunks:', totalChunks, 'Tokens:', tokens, 'Completed at:', completedAt);
    setIsLoading(false);
    setSpacerHeight(0);
    setMessages(prev => prev.map((m, i) => 
      i === prev.length - 1 ? { 
        ...m, 
        status: 'complete', 
        isComplete: true,
        tokens: tokens, // Store token count in the message
        completedAt: completedAt // Store completion timestamp
      } : m
    ));
  };

  const handleSSEError = (error: string) => {
    console.error('SSE error:', error);
    setIsLoading(false);
    setSpacerHeight(0);
    setMessages(prev => prev.map((m, i) => 
      i === prev.length - 1 ? { 
        ...m, 
        status: 'incomplete',
        isComplete: false
      } : m
    ));
  };

  return (
    <div className={cn("flex-1 flex", chatPosition === 'right' ? 'flex-row' : 'flex-col', chatPosition === 'top' && 'flex-col-reverse')}>
      <div className="flex-1 min-h-0 ">
        <ScrollArea 
          className="h-full dark:bg-neutral-800 dark:text-neutral-100" 
          ref={scrollAreaRef as React.RefObject<HTMLDivElement>}
        >
          <div className="p-6 w-3/4 mx-auto space-y-4">
            {messages.map((message, index) => (
              <div key={index} className="message-item">
                <Message
                  {...message}
                  isUser={message.isUser}
                  timestamp={message.timestamp}
                  model={message.model}
                  completedAt={message.completedAt}
                  tokens={message.tokens}
                />
              </div>
            ))}
            {spacerHeight > 0 && <div style={{ height: `${spacerHeight}px` }} />}
          </div>
        </ScrollArea>
      </div>
      
      <FloatingChatContainer
        onSendMessage={handleSendMessage}
        onVoiceTranscription={handleVoiceTranscription}
        isLoading={isLoading}
        messages={messages}
        scrollAreaRef={scrollAreaRef}
      />
    </div>
  );
}