import { createFileRoute, useLocation } from '@tanstack/react-router'
import { useAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { chatPositionAtom, isAutoScrollAtom, chatMessagesAtom, isLoadingAtom, userAtom, sidebarCollapsedAtom } from '@/lib/atoms';
import type { Message as MessageType } from '@/lib/atoms';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ChatEventSource, sendChatMessage } from '@/lib/eventsource';
import { LayoutGrid, ArrowDown, Sun, Moon, Clock, User, Bot, Hash } from 'lucide-react';
import { Message } from '@/components/chat/Message';
import { useChat } from '@/lib/queries';
import remarkGfm from 'remark-gfm';
import Markdown from 'react-markdown';
import { Switch } from '@/components/ui/switch';
import { VoiceRecordButton } from '@/components/ui/VoiceRecordButton';

const layoutConfig = {
  bottom: {
    mainClass: 'flex-1 flex flex-col',
    sidebar: false,
    inputWrapperClass: 'pl-0 pb-1 pt-2 pr-4',
    controlsWrapperClass: 'flex flex-col items-center gap-2 p-2',
    inputFirst: false,
    inputRows: 3,
    inputHeight: '',
  },
  top: {
    mainClass: 'flex-1 flex flex-col ',
    sidebar: false,
    inputWrapperClass: 'pl-0 pb-1.5 pt-2 pr-4',
    controlsWrapperClass: 'flex flex-col items-center gap-2 p-2',
    inputFirst: true,
    inputRows: 3,
    inputHeight: '',
  },
  right: {
    mainClass: 'flex flex-row flex-1',
    sidebar: true,
    sidebarClass: 'flex flex-col w-80 min-w-[16rem] max-w-xs p-4 border-l',
    inputWrapperClass: 'flex-1',
    controlsWrapperClass: 'flex flex-row items-center gap-4 mb-4',
    inputFirst: false,
    inputRows: 8,
    inputHeight: 'h-32',
  },
};

export const Route = createFileRoute('/chat/$chatId')({
  component: ChatComponent,
})

function ChatComponent() {
  const { chatId } = Route.useParams();
  const location = useLocation();
  
  const [chatPosition, setChatPosition] = useAtom(chatPositionAtom);
  const [isAutoScroll, setIsAutoScroll] = useAtom(isAutoScrollAtom);
  const { theme, toggleTheme } = useTheme();
  const [messages, setMessages] = useAtom(chatMessagesAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [user] = useAtom(userAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const { data: chatData } = useChat(chatId);
  
  const [inputValue, setInputValue] = useState('');
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
        status: msg.status,
        isComplete: msg.is_complete,
      }));
      setMessages(loadedMessages);
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
          console.log('Sending initial message via SSE');
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

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputValue.trim();
    if (!textToSend || isLoading) return;

    // Optimistically add the user's message to the UI
    const optimisticMessage: MessageType = {
      content: textToSend,
      isUser: true,
      timestamp: new Date(),
      status: 'complete',
      isComplete: true
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setIsLoading(true); // Start loading for AI response
    if (!messageText) setInputValue(''); // Clear input immediately only if not from initial message

    // Send message via HTTP API
    const result = await sendChatMessage(chatId, textToSend);
    
    if (!result.success) {
      console.error("Failed to send message:", result.error);
      // Revert optimistic updates
      setMessages(prev => prev.slice(0, -1));
      setIsLoading(false);
      setSpacerHeight(0);
      alert(`Failed to send message: ${result.error}`);
    } else {
      console.log(`Message sent successfully, task ID: ${result.taskId}`);
    }
  };

  const handleVoiceTranscription = (transcribedText: string) => {
    // Insert transcribed text into the input field for user to edit
    setInputValue(transcribedText);
  };

  const handleSSEStart = (messageId: string) => {
    console.log('AI response started, message ID:', messageId);
    // Create placeholder for AI message
    const aiMessage: MessageType = {
      content: '',
      isUser: false,
      timestamp: new Date(),
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
        status: 'streaming',
        isComplete: false
      }];
    });
  };

  const handleSSEComplete = (messageId: string, totalChunks?: number) => {
    console.log('Message generation complete:', messageId, 'Total chunks:', totalChunks);
    setIsLoading(false);
    setSpacerHeight(0);
    setMessages(prev => prev.map((m, i) => 
      i === prev.length - 1 ? { 
        ...m, 
        status: 'complete', 
        isComplete: true 
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePositionChange = () => {
    const positions = Object.keys(layoutConfig) as (keyof typeof layoutConfig)[];
    const currentIndex = positions.indexOf(chatPosition);
    const nextIndex = (currentIndex + 1) % positions.length;
    setChatPosition(positions[nextIndex]);

    // if position is right, set the sidebar to true
    if (positions[nextIndex] === 'right') {
      setSidebarCollapsed(true);
    } 
  };
  
  const config = layoutConfig[chatPosition];

  const controls = (
    <div className={cn(config.controlsWrapperClass)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={handlePositionChange} className="rounded-full size-6">
            <LayoutGrid className="w-3 h-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Move input area</TooltipContent>
      </Tooltip>
      
      <div className="flex items-center gap-2">
        <Switch
          checked={isAutoScroll}
          onCheckedChange={setIsAutoScroll}
        />
        <span className="text-sm text-neutral-600 dark:text-neutral-400">Auto-scroll</span>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={toggleTheme} className="rounded-full size-6">
            {theme === 'dark' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{theme === 'dark' ? "Light mode" : "Dark mode"}</TooltipContent>
      </Tooltip>
    </div>
  );

  const input = (
    <div className={cn(config.inputWrapperClass, config.inputHeight, "relative")}>
      <textarea
        className={cn(
          "w-full p-2 pr-12 rounded-md resize-none border focus:outline-none focus:ring-2 focus:ring-accent-blue/50",
          config.inputHeight,
          theme === 'dark' ? 'bg-background-dark-secondary text-text-light-primary border-border-dark' : 'bg-background-secondary text-text-primary border-border-light'
        )}
        rows={config.inputRows}
        placeholder="Type your message..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
      />
      <div className="absolute right-2 top-2">
        <VoiceRecordButton
          onTranscriptionComplete={handleVoiceTranscription}
          disabled={isLoading}
          className="size-8"
        />
      </div>
    </div>
  );
  
  // Chat Navigation Component
  function ChatNavigation({ messages, scrollAreaRef, theme }: { 
    messages: MessageType[], 
    scrollAreaRef: React.RefObject<HTMLDivElement | null>,
    theme: string 
  }) {
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);
    const [hoverPosition, setHoverPosition] = useState<{ top: number; left: number } | null>(null);
    
    const navigationItems = useMemo(() => {
      const items: Array<{
        id: string;
        question: string;
        answer: string;
        questionFull: string;
        answerFull: string;
        timestamp: Date;
        messageIndex: number;
        type: 'conversation' | 'start';
      }> = [];

      if (messages.length === 0) return items;


      // Create conversation blocks from user-AI message pairs
      for (let i = 0; i < messages.length - 1; i++) {
        const currentMessage = messages[i];
        const nextMessage = messages[i + 1];
        
        // Look for user question followed by AI answer
        if (currentMessage.isUser && !nextMessage.isUser) {
          const question = currentMessage.content.trim();
          const answer = nextMessage.content.trim();
          
          // Create shortened versions for display
          const questionShort = question.length > 30 ? question.substring(0, 30) + '...' : question;
          const answerShort = answer.length > 40 ? answer.substring(0, 40) + '...' : answer;
          
          items.push({
            id: `conversation-${i}`,
            question: questionShort,
            answer: answerShort,
            questionFull: question,
            answerFull: answer,
            timestamp: currentMessage.timestamp,
            messageIndex: i,
            type: 'conversation'
          });
        }
      }

      return items;
    }, [messages]);

    const scrollToMessage = useCallback((messageIndex: number) => {
      const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (!scrollViewport) return;

      // Find the message element by its index in the messages array
      const messageElements = scrollViewport.querySelectorAll('.message-item');
      const targetElement = messageElements[messageIndex] as HTMLElement;
      
      if (targetElement) {
        targetElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }, [scrollAreaRef]);

    const scrollToTop = useCallback(() => {
      const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        scrollViewport.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, [scrollAreaRef]);

    const scrollToBottom = useCallback(() => {
      const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        scrollViewport.scrollTo({ top: scrollViewport.scrollHeight, behavior: 'smooth' });
      }
    }, [scrollAreaRef]);

    const handleMouseEnter = useCallback((itemId: string, event: React.MouseEvent) => {
      setHoveredItem(itemId);
      const rect = event.currentTarget.getBoundingClientRect();
      setHoverPosition({
        top: rect.top,
        left: rect.left - 2 // 2px spacing from the left edge of the item
      });
    }, []);

    const handleMouseLeave = useCallback(() => {
      setHoveredItem(null);
      setHoverPosition(null);
    }, []);

    const hoveredConversation = hoveredItem ? navigationItems.find(item => item.id === hoveredItem) : null;

    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Navigation</h3>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={scrollToTop} className="size-5">
                  <ArrowDown className="w-3 h-3 rotate-180" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Go to top</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={scrollToBottom} className="size-5">
                  <ArrowDown className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Go to bottom</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          <div className="space-y-1">
            {navigationItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "p-2 rounded-md cursor-pointer transition-colors border-l-2 border-transparent",
                  "hover:bg-neutral-100 dark:hover:bg-neutral-700",
                  "hover:border-l-blue-500"
                )}
                onMouseEnter={(e) => handleMouseEnter(item.id, e)}
                onMouseLeave={handleMouseLeave}
                onClick={() => scrollToMessage(item.messageIndex)}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <User className="w-3 h-3" />
                    <span className="font-mono">
                      {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200 line-clamp-2">
                    {item.question}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <Bot className="w-3 h-3" />
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                    {item.answer}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {messages.length > 0 && (
          <div className="mt-3 pt-2 border-t border-neutral-300 dark:border-neutral-700">
            <div className="text-xs text-neutral-500">
              {navigationItems.filter(item => item.type === 'conversation').length} topic{navigationItems.filter(item => item.type === 'conversation').length !== 1 ? 's' : ''} • {messages.length} message{messages.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* Hover preview - positioned outside scroll container */}
        {hoveredItem && hoverPosition && hoveredConversation && (
          <div
            className={cn(
              "fixed z-50 w-[28rem] p-3 rounded-lg shadow-lg border",
              "max-h-60 overflow-y-hidden",
              theme === 'dark' 
                ? 'bg-neutral-800 border-neutral-700 text-neutral-100' 
                : 'bg-white border-neutral-300 text-neutral-900'
            )}
            style={{
              top: hoverPosition.top,
              left: hoverPosition.left - 448 - 8, // 320px width + 8px spacing
              transform: 'translateY(-50%)'
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">Question</span>
              </div>
              <div className="text-sm text-neutral-700 dark:text-neutral-300 pl-6">
                {hoveredConversation.questionFull}
              </div>
              
              <div className="flex items-center gap-2 pt-2">
                <Bot className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium">Answer</span>
              </div>
              <div className="text-sm text-neutral-700 dark:text-neutral-300 pl-6">
                <Markdown
                  children={hoveredConversation.answerFull.length > 200 
                    ? hoveredConversation.answerFull.substring(0, 200) + '...' 
                    : hoveredConversation.answerFull
                  }
                  remarkPlugins={[remarkGfm]}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
                />
              </div>
            ))}
            {spacerHeight > 0 && <div style={{ height: `${spacerHeight}px` }} />}
          </div>
        </ScrollArea>
      </div>
      
      {config.sidebar ? (
        <div className={cn(
          'sidebarClass' in config && config.sidebarClass, 
          theme === 'dark' ? 'border-border-dark' : 'border-border-light'
        )}>
          <div className="flex flex-row items-center gap-4 pt-2">{controls}</div>
          <div className="flex-1 p-4 pt-0 px-0">{input}</div>
          <ChatNavigation 
            messages={messages} 
            scrollAreaRef={scrollAreaRef} 
            theme={theme}
          />
        </div>  
      ) : (
        <div className={cn("flex flex-row border-t", theme === 'dark' ? 'border-border-dark' : 'border-border-light')}>
          <div className="flex flex-col items-center gap-2 p-2">{controls}</div>
          <div className="flex-1">{input}</div>
        </div>
      )}
    </div>
  );
}