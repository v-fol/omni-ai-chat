import { useAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, X } from 'lucide-react';
import { activeChatIdAtom, chatsAtom, isDraftChatAtom } from '@/lib/atoms';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { useEffect } from 'react';
import type { Chat } from '@/lib/atoms';

// Helper function to group chats by time period
const groupChatsByTime = (chats: Chat[]) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  return {
    today: chats.filter(chat => new Date(chat.updated_at) >= today),
    yesterday: chats.filter(chat => {
      const date = new Date(chat.updated_at);
      return date >= yesterday && date < today;
    }),
    lastWeek: chats.filter(chat => {
      const date = new Date(chat.updated_at);
      return date >= lastWeek && date < yesterday;
    }),
    lastMonth: chats.filter(chat => {
      const date = new Date(chat.updated_at);
      return date >= lastMonth && date < lastWeek;
    }),
    older: chats.filter(chat => new Date(chat.updated_at) < lastMonth),
  };
};

// Helper function to format time
const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { 
    hour: '2-digit',
    minute: '2-digit'
  });
};

export function ChatList() {
  const [chats, setChats] = useAtom(chatsAtom);
  const [activeChatId, setActiveChatId] = useAtom(activeChatIdAtom);
  const [isDraft, setIsDraft] = useAtom(isDraftChatAtom);
  const { theme } = useTheme();

  const startNewChat = () => {
    setIsDraft(true);
    setActiveChatId(null);
  };

  const deleteChat = async (chatId: string) => {
    if (!confirm('Are you sure you want to delete this chat?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/chat/${chatId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (response.ok) {
        // Remove chat from the list
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        
        // If this was the active chat, clear it
        if (activeChatId === chatId) {
          setActiveChatId(null);
          setIsDraft(true);
        }
      } else {
        alert('Failed to delete chat. Please try again.');
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
      alert('Failed to delete chat. Please try again.');
    }
  };

  const loadChats = async () => {
    try {
      const response = await fetch('http://localhost:8000/chats', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats);
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  };

  // Load chats on mount
  useEffect(() => {
    loadChats();
  }, []);

  const groupedChats = groupChatsByTime(chats);

  // Helper component for the time section
  const TimeSection = ({ title, chats }: { title: string; chats: Chat[] }) => {
    if (chats.length === 0) return null;

    return (
      <div className="mb-4">
        <div className="text-xs font-medium text-neutral-500 mb-2 px-2">
          {title}
        </div>
        <div className="space-y-1">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "group relative flex items-center",
                "rounded-lg overflow-hidden",
                activeChatId === chat.id && !isDraft && (
                  theme === 'dark' ? "bg-neutral-800" : "bg-neutral-100"
                )
              )}
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setIsDraft(false);
                  setActiveChatId(chat.id);
                }}
                className={cn(
                  "flex-1 justify-start gap-3 h-auto py-3 px-3",
                  "text-left rounded-lg"
                )}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {chat.title}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">
                    {formatTime(new Date(chat.updated_at))}
                  </div>
                </div>
              </Button>
              
              {/* Delete button - only visible on hover */}
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                className={cn(
                  "absolute right-2 w-6 h-6 p-0",
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  "hover:bg-red-500/20 hover:text-red-500",
                  theme === 'dark' ? "bg-neutral-800" : "bg-neutral-100"
                )}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      <Button
        variant="outline"
        onClick={startNewChat}
        className={cn(
          "w-full justify-start gap-2 mb-4",
          theme === 'dark' ? "hover:bg-neutral-800" : "hover:bg-neutral-100",
          isDraft && (theme === 'dark' ? "bg-neutral-800" : "bg-neutral-100")
        )}
      >
        <Plus className="w-4 h-4" />
        New Chat
      </Button>
      
      <div className="space-y-2 overflow-y-auto">
        <TimeSection title="Today" chats={groupedChats.today} />
        <TimeSection title="Yesterday" chats={groupedChats.yesterday} />
        <TimeSection title="Last 7 Days" chats={groupedChats.lastWeek} />
        <TimeSection title="Last Month" chats={groupedChats.lastMonth} />
        <TimeSection title="Older" chats={groupedChats.older} />
      </div>
    </div>
  );
} 