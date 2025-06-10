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
import { connectWebSocket, sendMessage, closeWebSocket } from '@/lib/websocket';
import { LayoutGrid, ArrowDown, Sun, Moon, Clock, User, Bot, Hash } from 'lucide-react';
import { Message } from '@/components/chat/Message';
import { useChat } from '@/lib/queries';
import remarkGfm from 'remark-gfm';
import Markdown from 'react-markdown';

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
  const wsRef = useRef<WebSocket | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);

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
          }
        }, 50);
      }
    }
  }, [messages.filter(m => m.isUser).length]); // Only trigger on new user messages

  // Effect 2: Handle AI message streaming and spacer management
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage && !lastMessage.isUser && lastMessage.status === 'streaming') {
      const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollViewport && spacerHeight > 0) {
        const messageElements = scrollViewport.querySelectorAll('.message-item');
        const aiMessageElement = messageElements[messageElements.length - 1] as HTMLElement;
        
        if (aiMessageElement) {
          const aiMessageRect = aiMessageElement.getBoundingClientRect();
          const viewportRect = scrollViewport.getBoundingClientRect();
          const aiMessageBottom = aiMessageRect.bottom;
          const viewportBottom = viewportRect.bottom;
          
          // If AI message is approaching the bottom of viewport, remove spacer
          if (aiMessageBottom >= viewportBottom - 100) { // 100px threshold
            setSpacerHeight(0);
            
            // If auto-scroll is enabled, start following the AI response
            if (isAutoScroll) {
              setTimeout(() => {
                scrollViewport.scrollTo({ 
                  top: scrollViewport.scrollHeight, 
                  behavior: 'smooth' 
                });
              }, 100);
            }
          }
        }
      }
    }
  }, [messages, spacerHeight, isAutoScroll]);

  // Effect 3: Continue auto-scrolling during AI response (only if auto-scroll enabled and spacer removed)
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (isAutoScroll && lastMessage && !lastMessage.isUser && lastMessage.status === 'streaming' && spacerHeight === 0) {
      const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        scrollViewport.scrollTo({ 
          top: scrollViewport.scrollHeight, 
          behavior: 'smooth' 
        });
      }
    }
  }, [messages, isAutoScroll, spacerHeight]);

  // Effect 4: Clean up when message is complete
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage && !lastMessage.isUser && lastMessage.status === 'complete') {
      setSpacerHeight(0); // Ensure spacer is removed
    }
  }, [messages.map(m => m.status).join(',')]); // Trigger when any message status changes

  useEffect(() => {
    if (!chatId || !user) return;

    const onOpen = () => {
      const kickOffMessage = location.state?.firstMessage;
      if (kickOffMessage) {
        sendMessage(wsRef.current, kickOffMessage);
        window.history.replaceState({ ...window.history.state, firstMessage: undefined }, '');
      }
    };

    const ws = connectWebSocket(
      `ws://localhost:8000/chat/${chatId}/ws`,
      handleWebSocketMessage,
      handleWebSocketError,
      onOpen
    );
    wsRef.current = ws;

    return () => {
      closeWebSocket(ws);
      wsRef.current = null;
    };
  }, [chatId, user]);
  
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    const messageText = inputValue.trim();

    // Optimistically add the user's message to the UI
    const optimisticMessage: MessageType = {
      content: messageText,
      isUser: true,
      timestamp: new Date(),
      status: 'complete',
      isComplete: true
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setIsLoading(true); // Start loading for AI response

    // Send the message via WebSocket
    const success = sendMessage(wsRef.current, messageText);
    
    if (success) {
      setInputValue('');
    } else {
      // If sending fails, revert the optimistic updates
      console.error("Failed to send message via WebSocket. Reverting UI updates.");
      setMessages(prev => prev.slice(0, -1)); // Remove optimistic message
      setIsLoading(false);
      setSpacerHeight(0);
      alert("Failed to send message. Please check your connection.");
    }
  };

  const handleWebSocketMessage = (text: string) => {
    if (text === '[DONE]') {
      setIsLoading(false);
      setSpacerHeight(0);
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, status: 'complete', isComplete: true } : m));
    } else {
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && !lastMessage.isUser) {
          return [...prev.slice(0, -1), { ...lastMessage, content: lastMessage.content + text }];
        }
        return [...prev, { content: text, isUser: false, timestamp: new Date(), status: 'streaming' }];
      });
    }
  };

  const handleWebSocketError = (error: Error) => {
    console.error('WebSocket error:', error);
    setIsLoading(false);
    setSpacerHeight(0);
    setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, status: 'incomplete' } : m));
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={() => setIsAutoScroll(!isAutoScroll)} className={cn("rounded-full size-6", isAutoScroll && "bg-accent-blue/10 text-accent-blue")}>
            <ArrowDown className="w-3 h-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isAutoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}</TooltipContent>
      </Tooltip>
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
    <div className={cn(config.inputWrapperClass, config.inputHeight)}>
      <textarea
        className={cn(
          "w-full p-2 rounded-md resize-none border focus:outline-none focus:ring-2 focus:ring-accent-blue/50",
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

    return (
      <div className={cn(
        "border-t p-3 relative",
        theme === 'dark' ? 'border-border-dark bg-neutral-900/50' : 'border-border-light bg-neutral-100/50'
      )}>
        <div className="flex items-center gap-2 mb-3">
          <Hash className="w-4 h-4 text-neutral-500" />
          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Conversation Topics
          </span>
        </div>
        
        {/* Quick scroll buttons */}
        <div className="flex gap-1 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={scrollToTop}
            className="h-6 px-2 text-xs flex items-center gap-1"
          >
            <ArrowDown className="w-3 h-3 rotate-180" />
            Top
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={scrollToBottom}
            className="h-6 px-2 text-xs flex items-center gap-1"
          >
            <ArrowDown className="w-3 h-3" />
            Bottom
          </Button>
        </div>

        {/* Scrollable navigation items */}
        <div className="flex-1">
          <div className=" max-h-[50vh] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-neutral-400 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
            {/* Navigation items */}
            {navigationItems.map((item) => (
              <div
                key={item.id}
                className="relative"
                onMouseEnter={(e) => handleMouseEnter(item.id, e)}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  onClick={() => {
                      scrollToMessage(item.messageIndex);
                      setHoveredItem(null);
                      setHoverPosition(null);
                  }}
                  className={cn(
                    "w-full text-left p-2 rounded-md transition-colors flex items-center gap-2",
                    "hover:bg-neutral-200 dark:hover:bg-neutral-800",
                    theme === 'dark' 
                      ? 'text-neutral-300 hover:text-neutral-100  bg-neutral-900' 
                      : 'text-neutral-600 hover:text-neutral-900  bg-neutral-100',
                  )}
                >
                    <div className="space-y-1">
                      <div className="flex items-start gap-1">
                        <User className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-blue-600 dark:text-blue-400 leading-tight">
                          {item.question}
                        </span>
                      </div>
                      <div className="flex items-start gap-1">
                        <Bot className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-green-600 dark:text-green-400 leading-tight">
                          {item.answer}
                        </span>
                      </div>
                    </div>
                </button>
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
        {hoveredItem && hoverPosition && (
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
            {(() => {
              const item = navigationItems.find(item => item.id === hoveredItem);
              if (!item || item.type !== 'conversation') return null;
              
              return (
                <div className="space-y-3 ">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3 h-3 text-blue-500" />
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Question</span>
                    </div>
                    <p className="text-xs leading-relaxed pl-5">{item.questionFull}</p>
                  </div>
                  <div className="overflow-y-hidden">
                    <div className="flex items-center gap-2 mb-1">
                      <Bot className="w-3 h-3 text-green-500" />
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">Answer</span>
                    </div>
                    <div className="text-xs leading-relaxed pl-5 prose prose-xs max-w-none dark:prose-invert overflow-hidden overflow-y-hidden">
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {item.answerFull.slice(0, 1000)}
                      </Markdown>
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t dark:from-neutral-800 from-white to-transparent pointer-events-none" />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex-1 flex", chatPosition === 'right' ? 'flex-row' : 'flex-col', chatPosition === 'top' && 'flex-col-reverse')}>
      <div className="flex-1 min-h-0 ">
        <ScrollArea className="h-full dark:bg-neutral-800 dark:text-neutral-100 " ref={scrollAreaRef as React.RefObject<HTMLDivElement>}>
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