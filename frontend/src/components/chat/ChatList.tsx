import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, MessageSquare, Trash2, Clock, Calendar, Archive, MessageCircle } from 'lucide-react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import type { Chat } from '@/lib/atoms';
import { useChats, useDeleteChat, useAuthStatus } from '@/lib/queries';
import { useState } from 'react';
import { ScrollArea } from '@radix-ui/react-scroll-area';
import { useAtom } from 'jotai';
import { userAtom } from '@/lib/atoms';

interface ChatListProps {
  onChatClick?: () => void;
}

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

// Get icon for time section
const getSectionIcon = (section: string) => {
  switch (section) {
    case 'Today':
      return Clock;
    case 'Yesterday':
      return Clock;
    case 'Last 7 Days':
      return Calendar;
    case 'Last Month':
      return Calendar;
    case 'Older':
      return Archive;
    default:
      return Clock;
  }
};

export function ChatList({ onChatClick }: ChatListProps) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [user] = useAtom(userAtom);
  const { data: chatsData, isLoading: isLoadingChats } = useChats();
  const deleteChatMutation = useDeleteChat();
  
  // Get the current chat ID from the router params
  const activeChatId = params.chatId || null;

  const handleDeleteClick = (chatId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setChatToDelete(chatId);
  };

  const handleDeleteConfirm = () => {
    if (chatToDelete) {
      deleteChatMutation.mutate(chatToDelete, {
        onSuccess: () => {
          if (activeChatId === chatToDelete) {
            navigate({ to: '/' });
          }
          setChatToDelete(null);
        },
      });
    }
  };

  const handleChatClick = () => {
    onChatClick?.();
  };

  const chats = chatsData?.chats || [];
  const groupedChats = groupChatsByTime(chats);
  const chatToDeleteData = chats.find(chat => chat.id === chatToDelete);

  const TimeSection = ({ title, chats }: { title: string; chats: Chat[] }) => {
    if (chats.length === 0) return null;

    const IconComponent = getSectionIcon(title);

    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 mb-3 px-2">
          <IconComponent className="w-3 h-3" />
          {title}
        </div>
        <div className="space-y-1.5 pr-1">
            {chats.map((chat) => (
                <Link
                  to="/chat/$chatId"
                  params={{ chatId: chat.id }}
                  onClick={handleChatClick}
                  className={cn(
                    "group relative flex items-center justify-start gap-3 w-full py-1.5 px-3 rounded-lg transition-all duration-200",
                    "text-left focus-visible:outline-none",
                    // Base state - light gray background
                    theme === 'dark' ? "bg-neutral-800" : "bg-neutral-100",
                    // Hover state - slightly darker
                    theme === 'dark' ? "hover:bg-neutral-700" : "hover:bg-neutral-200",
                    // Active state - distinct blue-tinted background
                    activeChatId === chat.id && (
                      theme === 'dark' ? "!bg-blue-900/30 border border-blue-700/50 shadow-sm" : "!bg-blue-50 border border-blue-200 shadow-sm"
                    ),
                    chatToDelete === chat.id && "opacity-50"
                  )}
                >
                  
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate mb-0.5 pr-5 first-letter:uppercase">
                      {chat.title}
                    </div>
                    <div className="text-xs text-neutral-500 truncate flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(new Date(chat.updated_at))}
                      </span>
                      {chat.message_count !== undefined && chat.message_count > 0 && (
                        <>
                          <span className="text-xs flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {chat.message_count}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleDeleteClick(chat.id, e)}
                    className={cn(
                      "absolute right-2 w-6 h-6 p-0 shrink-0",
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                      "hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400",
                      "focus-visible:opacity-100"
                    )}
                    title="Delete chat"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </Link>
            ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {isLoadingChats ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-neutral-500">Loading chats...</div>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="w-8 h-8 text-neutral-400 mb-3" />
            <div className="text-sm text-neutral-500 mb-1">No chats yet</div>
            {user && (
              <div className="text-xs text-neutral-400">Start a new conversation to get started</div>
            )}
            {!user && (
              <div className="text-xs text-neutral-400">Login to see your chats</div>
            )}
          </div>
        ) : (
          <ScrollArea className="space-y-2 overflow-y-auto ">
            <TimeSection title="Today" chats={groupedChats.today} />
            <TimeSection title="Yesterday" chats={groupedChats.yesterday} />
            <TimeSection title="Last 7 Days" chats={groupedChats.lastWeek} />
            <TimeSection title="Last Month" chats={groupedChats.lastMonth} />
            <TimeSection title="Older" chats={groupedChats.older} />
          </ScrollArea>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!chatToDelete} onOpenChange={() => setChatToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-400 hover:bg-red-600 focus:ring-red-500"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 