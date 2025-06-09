import { useAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { sidebarCollapsedAtom, userAtom } from '@/lib/atoms';
import { useEffect } from 'react';
import { ChevronLeft, Menu, LogOut } from 'lucide-react';
import { GitHubLoginButton } from '@/components/auth/GitHubLoginButton';
import { ChatList } from '@/components/chat/ChatList';
import { useAuthStatus, useLogout } from '@/lib/queries';

export function ChatLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const { theme } = useTheme();
  const [user, setUser] = useAtom(userAtom);

  const { data: authData } = useAuthStatus();
  const logoutMutation = useLogout();

  useEffect(() => {
    setUser(authData ?? null);
  }, [authData, setUser]);

  const handleLogout = () => {
    logoutMutation.mutate();
    setUser(null);
  };

  return (
    <div className={cn(
      "flex h-screen w-full relative",
      theme === 'dark' ? 'bg-background-dark-primary' : 'bg-background-primary'
    )}>
      <div className={cn(
        "transition-all duration-300 flex flex-col border-r z-20 overflow-hidden",
        sidebarCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'p-4 w-64 opacity-100',
        theme === 'dark' ? 'bg-background-dark-secondary border-border-dark' : 'bg-background-secondary border-border-light'
      )}>
        <div className={cn("flex flex-col h-full", sidebarCollapsed && 'opacity-0 pointer-events-none')}>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(true)} className="size-6" aria-label="Close sidebar">
                <ChevronLeft className="w-3 h-3" />
              </Button>
            </div>
            {user ? (
              <>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-neutral-800/50">
                  <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-sm text-neutral-400 truncate">{user.login}</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full mt-2 text-red-500 hover:text-red-600 hover:bg-red-500/10">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <GitHubLoginButton />
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatList />
          </div>
        </div>
      </div>
      
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

      <main className="flex-1 flex h-full">
        {children}
      </main>
    </div>
  );
}