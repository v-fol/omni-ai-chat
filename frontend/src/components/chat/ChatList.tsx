import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, X } from 'lucide-react';
import { Link, useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import type { Chat } from '@/lib/atoms';
import { useChats, useDeleteChat } from '@/lib/queries';
import { useAuthStatus } from '@/lib/queries'; // Needed for activeChatId

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
  const { theme } = useTheme();
  const navigate = useNavigate();

  const { data: chatsData, isLoading: isLoadingChats } = useChats();
  const deleteChatMutation = useDeleteChat();
  
  // Get the current chat ID from the router state
  // This is a bit of a workaround until we refactor further
  const { data: authData } = useAuthStatus();
  const { pathname } = window.location;
  const activeChatId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;

  const handleDeleteChat = (chatId: string) => {
    if (!confirm('Are you sure you want to delete this chat?')) {
      return;
    }
    deleteChatMutation.mutate(chatId, {
      onSuccess: () => {
        if (activeChatId === chatId) {
          navigate({ to: '/' });
        }
      },
    });
  };

  const chats = chatsData?.chats || [];
  const groupedChats = groupChatsByTime(chats);

  const TimeSection = ({ title, chats }: { title: string; chats: Chat[] }) => {
    if (chats.length === 0) return null;

    return (
      <div className="mb-4">
        <div className="text-xs font-medium text-neutral-500 mb-2 px-2">
          {title}
        </div>
        <div className="space-y-1">
          {chats.map((chat) => (
            <Link
              key={chat.id}
              to="/chat/$chatId"
              params={{ chatId: chat.id }}
              className={cn(
                "group relative flex items-center justify-start gap-3 w-full h-auto py-3 px-3",
                "text-left rounded-lg",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
              activeProps={{
                className: theme === 'dark' ? "bg-neutral-800" : "bg-neutral-100"
              }}
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

              {/* Delete button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteChat(chat.id);
                }}
                className={cn(
                  "absolute right-2 w-6 h-6 p-0",
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  "hover:bg-red-500/20 hover:text-red-500"
                )}
              >
                <X className="w-3 h-3" />
              </Button>
            </Link>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      <Link
        to="/"
        className={cn(
          "flex items-center justify-start gap-2 mb-4 w-full h-10 px-4 py-2",
          "border border-input rounded-md text-sm font-medium",
          theme === 'dark' ? "hover:bg-neutral-800" : "hover:bg-neutral-100",
        )}
        activeProps={{
          className: theme === 'dark' ? "bg-neutral-800" : "bg-neutral-100"
        }}
      >
        <Plus className="w-4 h-4" />
        New Chat
      </Link>
      
      {isLoadingChats ? (
        <div>Loading chats...</div>
      ) : (
        <div className="space-y-2 overflow-y-auto">
          <TimeSection title="Today" chats={groupedChats.today} />
          <TimeSection title="Yesterday" chats={groupedChats.yesterday} />
          <TimeSection title="Last 7 Days" chats={groupedChats.lastWeek} />
          <TimeSection title="Last Month" chats={groupedChats.lastMonth} />
          <TimeSection title="Older" chats={groupedChats.older} />
        </div>
      )}
    </div>
  );
} 