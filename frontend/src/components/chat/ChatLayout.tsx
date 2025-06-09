import { useAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { chatPositionAtom, isAutoScrollAtom, sidebarCollapsedAtom, chatMessagesAtom, isLoadingAtom, userAtom, activeChatIdAtom, chatsAtom, isDraftChatAtom } from '@/lib/atoms';
import type { Message as MessageType, Chat } from '@/lib/atoms';
import { useEffect, useRef, useState } from 'react';
import { connectWebSocket, sendMessage, closeWebSocket } from '@/lib/websocket';
import {
  LayoutGrid,
  ArrowDown,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Menu,
  LogOut
} from 'lucide-react';
import { Message } from '@/components/chat/Message';
import { GitHubLoginButton } from '@/components/auth/GitHubLoginButton';
import { ChatList } from '@/components/chat/ChatList';

interface ChatLayoutProps {
  children?: React.ReactNode;
}

interface BaseLayoutConfig {
  mainClass: string;
  sidebar: boolean;
  inputWrapperClass: string;
  controlsWrapperClass: string;
  inputFirst: boolean;
  inputRows: number;
  inputHeight: string;
}

interface StandardLayoutConfig extends BaseLayoutConfig {
  sidebar: false;
}

interface SidebarLayoutConfig extends BaseLayoutConfig {
  sidebar: true;
  sidebarClass: string;
}

type LayoutConfig = {
  bottom: StandardLayoutConfig;
  top: StandardLayoutConfig;
  right: SidebarLayoutConfig;
};

const layoutConfig: LayoutConfig = {
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

export function ChatLayout({ children }: ChatLayoutProps) {
  const [chatPosition, setChatPosition] = useAtom(chatPositionAtom);
  const [isAutoScroll, setIsAutoScroll] = useAtom(isAutoScrollAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const { theme, toggleTheme } = useTheme();
  const [messages, setMessages] = useAtom(chatMessagesAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [user, setUser] = useAtom(userAtom);
  const [activeChatId, setActiveChatId] = useAtom(activeChatIdAtom);
  const [chats, setChats] = useAtom(chatsAtom);
  const [isDraft, setIsDraft] = useAtom(isDraftChatAtom);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  // Debug logging for messages state
  useEffect(() => {
    console.log('Messages state updated:', messages);
  }, [messages]);

  // Debug logging for rendering
  useEffect(() => {
    console.log('Rendering state:', {
      messages,
      isStreaming,
      isLoading
    });
  }, [messages, isStreaming, isLoading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isAutoScroll && scrollAreaRef.current) {
      const scrollArea = scrollAreaRef.current;
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [messages, isAutoScroll]);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('http://localhost:8000/auth/status', {
          credentials: 'include'
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
      } catch (error) {
        console.error('Failed to check auth status:', error);
      }
    };
    checkAuth();
  }, []);

  // Clear messages when switching chats or starting a new chat
  useEffect(() => {
    if (isDraft) {
      setMessages([]);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
  }, [isDraft]);

  // Load chat messages when active chat changes
  useEffect(() => {
    const loadChatMessages = async () => {
      if (!activeChatId || isDraft) {
        return;
      }

      try {
        console.log('Loading messages for chat:', activeChatId);
        const response = await fetch(`http://localhost:8000/chat/${activeChatId}`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const chat = await response.json();
          const loadedMessages = chat.messages.map((msg: any) => ({
            content: msg.content,
            isUser: msg.from_user,
            timestamp: new Date(msg.created_at),
            status: msg.status,
            isComplete: msg.is_complete
          }));
          console.log('Loaded messages:', loadedMessages);
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Failed to load chat messages:', error);
      }
    };

    loadChatMessages();
  }, [activeChatId, isDraft]);

  // Handle WebSocket connection
  useEffect(() => {
    if (!activeChatId || isDraft || !user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    console.log('Creating WebSocket for chat:', activeChatId);
    wsRef.current = connectWebSocket(
      `ws://localhost:8000/chat/${activeChatId}/ws`,
      handleWebSocketMessage,
      handleWebSocketError
    );

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [activeChatId, isDraft, user]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const messageText = inputValue.trim();
    setInputValue('');
    
    let chatId = activeChatId;
    let isNewChat = false;

    // Step 1: Create chat if needed
    if (isDraft) {
      console.log('Creating new chat...');
      isNewChat = true;
      try {
        const response = await fetch('http://localhost:8000/chat', {
          method: 'POST',
          credentials: 'include',
        });
        
        if (!response.ok) {
          console.error('Failed to create chat');
          setInputValue(messageText);
          return;
        }

        const data = await response.json();
        chatId = data.chat_id;
        console.log('Created chat with ID:', chatId);

        // Create title from first message
        const words = messageText.split(' ').slice(0, 10);
        const title = words.join(' ') + (messageText.split(' ').length > 10 ? '...' : '');
        
        // Add chat to list
        setChats(prev => [{
          id: chatId!,
          title,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: []
        }, ...prev]);
        
        // Switch to the new chat
        setIsDraft(false);
        setActiveChatId(chatId);
        
        console.log('Chat created, waiting for WebSocket...');
        // Wait for WebSocket to be ready
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Failed to create chat:', error);
        setInputValue(messageText);
        return;
      }
    }

    if (!chatId) {
      console.error('No chat ID available');
      setInputValue(messageText);
      return;
    }

    // Step 2: Add user message to UI immediately
    const userMessage: MessageType = {
      content: messageText,
      isUser: true,
      timestamp: new Date()
    };
    
    console.log('Adding user message to UI');
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Step 3: Wait for WebSocket and send message
    try {
      // Wait for WebSocket to be ready
      let wsReady = false;
      for (let i = 0; i < 50; i++) { // 5 seconds max
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsReady = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!wsReady) {
        throw new Error('WebSocket not ready');
      }

      console.log('Sending message via WebSocket:', messageText);
      const sent = sendMessage(messageText);
      if (!sent) {
        throw new Error('Failed to send message via WebSocket');
      }

      // The title update is now handled by the backend.
      // The UI will be eventually consistent on the next chat list refresh.
      
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsLoading(false);
      alert('Failed to send message. Please try again.');
    }
  };

  const handleWebSocketMessage = (text: string) => {
    console.log('Received WebSocket message:', text);
    
    if (text === '[DONE]') {
      console.log('Stream completed');
      setIsStreaming(false);
      setIsLoading(false);
      // Update the last message to mark it as complete
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && !lastMessage.isUser) {
          const messagesWithoutLast = prev.slice(0, -1);
          return [...messagesWithoutLast, {
            ...lastMessage,
            status: 'complete',
            isComplete: true
          }];
        }
        return prev;
      });
    } else {
      console.log('Received chunk:', text.substring(0, 50) + '...');
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && !lastMessage.isUser && (lastMessage.status === 'streaming' || !lastMessage.status)) {
          // Update existing AI message
          const messagesWithoutLast = prev.slice(0, -1);
          return [...messagesWithoutLast, {
            ...lastMessage,
            content: lastMessage.content + text,
            status: 'streaming'
          }];
        } else {
          // Create new AI message
          return [...prev, {
            content: text,
            isUser: false,
            timestamp: new Date(),
            status: 'streaming',
            isComplete: false
          }];
        }
      });
      setIsStreaming(true);
    }
  };

  const handleWebSocketError = (error: Error) => {
    console.error('WebSocket error:', error);
    setIsLoading(false);
    setIsStreaming(false);
    // Mark the last message as incomplete if there's an error
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && !lastMessage.isUser) {
        const messagesWithoutLast = prev.slice(0, -1);
        return [...messagesWithoutLast, {
          ...lastMessage,
          status: 'incomplete',
          isComplete: false
        }];
      }
      return prev;
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePositionChange = () => {
    const positions = Object.keys(layoutConfig);
    const currentIndex = positions.indexOf(chatPosition);
    const nextIndex = (currentIndex + 1) % positions.length;
    setChatPosition(positions[nextIndex] as typeof chatPosition);
  };

  const handleLogout = async () => {
    try {
      await fetch('http://localhost:8000/logout', {
        credentials: 'include'
      });
      setUser(null);
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const config = layoutConfig[chatPosition];

  // Controls JSX (rendered once)
  const controls = (
    <div
      className={cn(
        config.controlsWrapperClass,
        theme === 'dark' ? 'border-border-dark' : 'border-border-light',
        chatPosition === 'right' && 'border-0'
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={handlePositionChange}
            className="rounded-full size-6"
          >
            <LayoutGrid className="w-3 h-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Move input area (bottom/top/right)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsAutoScroll(!isAutoScroll)}
            className={cn(
              "rounded-full size-6",
              isAutoScroll && "bg-accent-blue/10 text-accent-blue"
            )}
          >
            <ArrowDown className="w-3 h-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isAutoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            className="rounded-full size-6"
          >
            {theme === 'dark' ? (
              <Sun className="w-3 h-3" />
            ) : (
              <Moon className="w-3 h-3" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{theme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}</TooltipContent>
      </Tooltip>
    </div>
  );

  // Input JSX (rendered once)
  const input = (
    <div
      className={cn(
        config.inputWrapperClass,
        theme === 'dark' ? (config.inputWrapperClass.includes('border-t') ? 'border-border-dark' : config.inputWrapperClass.includes('border-l') ? 'border-border-dark' : '') : (config.inputWrapperClass.includes('border-t') ? 'border-border-light' : config.inputWrapperClass.includes('border-l') ? 'border-border-light' : ''),
        config.inputHeight
      )}
    >
      <textarea
        className={cn(
          "w-full p-2 rounded-md resize-none",
          config.inputHeight,
          theme === 'dark'
            ? 'bg-background-dark-secondary text-text-light-primary border-border-dark'
            : 'bg-background-secondary text-text-primary border-border-light',
          'border focus:outline-none focus:ring-2 focus:ring-accent-blue/50'
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
    <div className={cn(
      "flex h-screen w-full relative",
      theme === 'dark' ? 'bg-background-dark-primary' : 'bg-background-primary'
    )}>
      {/* Sidebar (always rendered, animated) */}
      <div
        className={cn(
          "transition-all duration-300 flex flex-col border-r z-20 overflow-hidden",
          sidebarCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'p-4 w-64 opacity-100',
          theme === 'dark' 
            ? 'bg-background-dark-secondary border-border-dark' 
            : 'bg-background-secondary border-border-light'
        )}
      >
        <div className={cn(
          "flex flex-col h-full",
          sidebarCollapsed && 'opacity-0 pointer-events-none'
        )}>
          {/* User section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(true)}
                className="size-6"
                aria-label="Close sidebar"
              >
                <ChevronLeft className="w-3 h-3" />
              </Button>
            </div>
            {user ? (
              <>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-neutral-800/50">
                  <img 
                    src={user.avatar_url} 
                    alt={user.name} 
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-sm text-neutral-400 truncate">{user.login}</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="w-full mt-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <GitHubLoginButton />
            )}
          </div>

          {/* Chat list */}
          <div className="flex-1 overflow-hidden">
            <ChatList />
          </div>
        </div>
      </div>
      {/* Floating burger button */}
      {sidebarCollapsed && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarCollapsed(false)}
          className="fixed top-4 left-4 z-30 bg-background shadow-md border border-border size-6"
          aria-label="Open sidebar"
        >
          <Menu className="w-3 h-3" />
        </Button>
      )}
      {/* Main content */}
      <div className="flex-1 flex h-full">
        {/* Messages and input container */}
        <div className={cn(
          "flex-1 flex",
          chatPosition === 'right' ? 'flex-row' : 'flex-col',
          chatPosition === 'top' && 'flex-col-reverse'
        )}>
          {/* Messages area */}
          <div className={cn(
            "flex-1 min-h-0", // min-h-0 is crucial for proper scrolling in flex container
            chatPosition === 'right' && 'flex-1'
          )}>
            <ScrollArea className="h-full">
              <div className="flex flex-col space-y-4 p-6">
                {messages.map((message, index) => (
                  <Message
                    key={index}
                    content={message.content}
                    isUser={message.isUser}
                    timestamp={message.timestamp}
                  />
                ))}
                {isStreaming && (
                  <Message
                    content="..."
                    isUser={false}
                    timestamp={new Date()}
                    isStreaming={true}
                  />
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Input area */}
          {chatPosition === 'right' ? (
            <div className={cn(
              "w-80 min-w-[16rem] max-w-xs flex flex-col border-l",
              theme === 'dark' ? 'border-border-dark' : 'border-border-light'
            )}>
              <div className="flex flex-row items-center gap-4 p-4">
                {controls}
              </div>
              <div className="flex-1 p-4 pt-0">
                {input}
              </div>
            </div>
          ) : (
            <div className={cn(
              "flex flex-row border-t",
              theme === 'dark' ? 'border-border-dark' : 'border-border-light'
            )}>
              <div className="flex flex-col items-center gap-2 p-2">
                {controls}
              </div>
              <div className="flex-1 pl-0 pb-1 pt-2 pr-4">
                {input}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}