import { useAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { sidebarCollapsedAtom, userAtom, chatPositionAtom } from '@/lib/atoms';
import { useEffect, useState } from 'react';
import { Plus, Search, SidebarOpen, LogOut, PanelLeft, PanelLeftClose, MessageCircleCode } from 'lucide-react';
import { GitHubLoginButton } from '@/components/auth/GitHubLoginButton';
import { ChatList } from '@/components/chat/ChatList';
import { useAuthStatus, useLogout } from '@/lib/queries';
import { useNavigate } from '@tanstack/react-router';

export function ChatLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const { theme } = useTheme();
  const [user, setUser] = useAtom(userAtom);
  const [chatPosition] = useAtom(chatPositionAtom);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: authData } = useAuthStatus();
  const logoutMutation = useLogout();
  const navigate = useNavigate();

  useEffect(() => {
    setUser(authData ?? null);
  }, [authData, setUser]);

  const handleLogout = () => {
    logoutMutation.mutate();
    setUser(null);
  };

  const handleNewChat = () => {
    if (chatPosition === 'right') {
      setSheetOpen(false);
    }
    navigate({ to: '/' });
  };

  // Sidebar content component that can be reused
  const SidebarContent = ({ onChatClick }: { onChatClick?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Header with New Chat and Search */}
      <div className="flex items-center justify-between w-full mb-4">
      <div className="text-lg font-bold flex items-center gap-1 flex-shrink-0">
        <MessageCircleCode className="w-5 h-5 flex-shrink-0" />
        <span className="whitespace-nowrap">Omni Chat</span>
      </div>
       {/* Close button for regular sidebar mode */}
       {chatPosition !== 'right' && (
          <div className="flex justify-end">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setSidebarCollapsed(true)}
              className="size-6" 
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          </div>
        )}
        
      </div>

      <div className="mb-6 space-y-3">
       
        
        {/* Action buttons */}
        <div className="space-y-2">
          <Button
            onClick={handleNewChat}
            className={cn(
              "w-full justify-start gap-3 h-10",
              theme === 'dark' 
                ? "bg-neutral-700 hover:bg-neutral-600 text-neutral-100" 
                : "bg-neutral-200 hover:bg-neutral-300 text-neutral-900"
            )}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
          
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start gap-3 h-10",
              theme === 'dark' 
                ? "border-neutral-600 hover:bg-neutral-700" 
                : "border-neutral-300 hover:bg-neutral-100"
            )}
          >
            <Search className="w-4 h-4" />
            Search
          </Button>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-hidden">
        <ChatList onChatClick={onChatClick} />
      </div>

      {/* User Profile Section */}
      <div className="mt-auto pt-4 border-t border-neutral-200 dark:border-neutral-700">
        {user ? (
          <div className="space-y-3 w-full">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                className="h-auto w-full p-2 justify-start text-left hover:bg-transparent"
              >
              <img 
                src={user.avatar_url} 
                alt={user.name} 
                className="w-8 h-8 rounded-full border-2 border-neutral-200 dark:border-neutral-600" 
              />
              <div className="flex-1 min-w-0">
                  <div>
                    <div className="font-medium text-sm truncate">{user.name}</div>
                    <div className="text-xs text-neutral-500 truncate">@{user.login}</div>
                  </div>
              </div>
                </Button>
              
            </div>
            <div className="text-xs text-neutral-400 text-center font-bold">
              v0.0.1
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <GitHubLoginButton />
            <div className="text-xs text-neutral-400 text-center">
              v0.0.0
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn(
      "flex h-screen w-full relative",
    )}
    style={{
      backgroundColor: theme === 'dark' ? 'rgb(19, 19, 19)' : 'rgb(243, 244, 246)'
    }}
    >
      {chatPosition !== 'right' ? (
        <div className={cn(
          "transition-all duration-300 flex flex-col border-r z-20 overflow-hidden",
          sidebarCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'p-4 w-64 opacity-100',
          theme === 'dark' 
            ? 'bg-neutral-900 border-neutral-700 text-neutral-100' 
            : 'bg-neutral-50 border-neutral-200 text-neutral-900'
        )}>
          <div className={cn("flex flex-col h-full", sidebarCollapsed && 'opacity-0 pointer-events-none')}>
            <SidebarContent />
          </div>
        </div>
      ) : (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed top-4 left-4 z-30 bg-background shadow-md border border-border size-8"
              aria-label="Open sidebar"
            >
              <SidebarOpen className="w-4 h-4" />
            </Button>
          </SheetTrigger>
          <SheetContent 
            side="left" 
            className={cn(
              "w-80 p-4",
              theme === 'dark' ? "bg-neutral-900" : "bg-neutral-50"
            )}
          >
            <SidebarContent onChatClick={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
      
      {((sidebarCollapsed && chatPosition !== 'right') || (chatPosition === 'right' && !sheetOpen)) && (
        <div className="fixed top-4 left-4 z-30">
          <div className={cn(
            "flex flex-col rounded-lg border shadow-md overflow-hidden",
            theme === 'dark' ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-200"
          )}>
            <Button
              variant="ghost"
              size="icon"
              onClick={chatPosition === 'right' ? () => setSheetOpen(true) : () => setSidebarCollapsed(false)}
              className="size-8 rounded-none border-b border-neutral-200 dark:border-neutral-700"
              aria-label="Open sidebar"
            >
              <SidebarOpen className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewChat}
              className="size-8 rounded-none border-b border-neutral-200 dark:border-neutral-700"
              aria-label="New chat"
            >
              <Plus className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-none"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <main className="flex-1 flex h-full">
        {children}
      </main>
    </div>
  );
}