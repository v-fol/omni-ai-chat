import { useAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare } from 'lucide-react';
import { activeChatIdAtom, chatsAtom } from '@/lib/atoms';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { useEffect } from 'react';

export function ChatList() {
  const [chats, setChats] = useAtom(chatsAtom);
  const [activeChatId, setActiveChatId] = useAtom(activeChatIdAtom);
  const { theme } = useTheme();

  const createNewChat = async () => {
    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        const newChat = {
          id: data.chat_id,
          updated_at: new Date().toISOString(),
          messages: []
        };
        setChats(prev => [...prev, newChat]);
        setActiveChatId(data.chat_id);
      }
    } catch (error) {
      console.error('Failed to create chat:', error);
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

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        onClick={createNewChat}
        className="w-full justify-start gap-2"
      >
        <Plus className="w-4 h-4" />
        New Chat
      </Button>
      
      <div className="flex flex-col gap-1">
        {chats.map((chat) => (
          <Button
            key={chat.id}
            variant="ghost"
            onClick={() => setActiveChatId(chat.id)}
            className={cn(
              "w-full justify-start gap-2",
              activeChatId === chat.id && "bg-accent"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="truncate">
              {new Date(chat.updated_at).toLocaleDateString()}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
} 