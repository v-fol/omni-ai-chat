import { createFileRoute, useLocation } from '@tanstack/react-router'
import { useAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { chatPositionAtom, isAutoScrollAtom, chatMessagesAtom, isLoadingAtom, userAtom } from '@/lib/atoms';
import type { Message as MessageType } from '@/lib/atoms';
import { useEffect, useRef, useState } from 'react';
import { connectWebSocket, sendMessage, closeWebSocket } from '@/lib/websocket';
import { LayoutGrid, ArrowDown, Sun, Moon } from 'lucide-react';
import { Message } from '@/components/chat/Message';
import { useChat } from '@/lib/queries';

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
  
  const { data: chatData } = useChat(chatId);
  
  const [inputValue, setInputValue] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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
  
  useEffect(() => {
    if (isAutoScroll && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, isAutoScroll]);

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
      alert("Failed to send message. Please check your connection.");
    }
  };

  const handleWebSocketMessage = (text: string) => {
    if (text === '[DONE]') {
      setIsLoading(false);
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
    setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, status: 'incomplete' } : m));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
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
        onKeyPress={handleKeyPress}
        disabled={isLoading}
      />
    </div>
  );
  
  return (
    <div className={cn("flex-1 flex", chatPosition === 'right' ? 'flex-row' : 'flex-col', chatPosition === 'top' && 'flex-col-reverse')}>
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full" ref={scrollAreaRef as React.RefObject<HTMLDivElement>}>
          <div className="p-6 space-y-4">
            {messages.map((message, index) => (
              <Message key={index} {...message} isUser={message.isUser} timestamp={message.timestamp} />
            ))}
          </div>
        </ScrollArea>
      </div>
      
      {config.sidebar ? (
        <div className={cn(
          'sidebarClass' in config && config.sidebarClass, 
          theme === 'dark' ? 'border-border-dark' : 'border-border-light'
        )}>
          <div className="flex flex-row items-center gap-4 p-4">{controls}</div>
          <div className="flex-1 p-4 pt-0">{input}</div>
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