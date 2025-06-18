import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSearchTitles, useSearchMessages } from '@/lib/queries';
import { useTheme } from '@/lib/theme-context';
import { useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { userAtom } from '@/lib/atoms';
import { cn } from '@/lib/utils';
import { Search, MessageSquare, FileText, Clock, MessageCircle, User, Bot, X, LogIn } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResult {
  chat_id: string;
  title: string;
  updated_at: string;
  message_count: number;
  first_message?: string;
  message_content?: string;
  message_from_user?: boolean;
  message_created_at?: string;
  match_type: 'title' | 'message';
}

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [user] = useAtom(userAtom);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Search hooks - only enabled if user is authenticated
  const { data: titleResults, isLoading: titleLoading } = useSearchTitles(
    debouncedQuery,
    open && debouncedQuery.trim().length > 0 && !!user
  );
  
  const { data: messageResults, isLoading: messageLoading } = useSearchMessages(
    debouncedQuery,
    open && debouncedQuery.trim().length > 0 && !!user
  );

  const handleResultClick = (chatId: string) => {
    if (!user) return;
    navigate({ to: '/chat/$chatId', params: { chatId } });
    onOpenChange(false);
    setQuery('');
  };

  const handleClear = () => {
    setQuery('');
    setDebouncedQuery('');
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Unknown time';
    }
  };

  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;
    
    const regex = new RegExp(`(${searchQuery.trim()})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark 
          key={index} 
          className={cn(
            "px-1 rounded",
            theme === 'dark' 
              ? "bg-yellow-500/30 text-yellow-200" 
              : "bg-yellow-200 text-yellow-900"
          )}
        >
          {part}
        </mark>
      ) : part
    );
  };

  const ResultCard = ({ result }: { result: SearchResult }) => (
    <div
      onClick={() => handleResultClick(result.chat_id)}
      className={cn(
        "p-4 rounded-lg border cursor-pointer transition-all duration-200",
        "hover:shadow-md",
        theme === 'dark'
          ? "bg-neutral-800 border-neutral-700 hover:bg-neutral-750"
          : "bg-white border-neutral-200 hover:bg-neutral-50"
      )}
    >
      <div className="space-y-3">
        {/* Chat title */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-medium text-sm line-clamp-2">
            {result.match_type === 'title' 
              ? highlightText(result.title, debouncedQuery)
              : result.title
            }
          </h3>
          <div className="flex items-center gap-1 text-xs text-neutral-500 shrink-0">
            <MessageCircle className="w-3 h-3" />
            {result.message_count}
          </div>
        </div>

        {/* Content preview */}
        <div className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-3">
          {result.match_type === 'title' ? (
            result.first_message && (
              <div className="flex items-start gap-2">
                <User className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{result.first_message}</span>
              </div>
            )
          ) : (
            result.message_content && (
              <div className="flex items-start gap-2">
                {result.message_from_user ? (
                  <User className="w-3 h-3 mt-0.5 shrink-0 text-blue-500" />
                ) : (
                  <Bot className="w-3 h-3 mt-0.5 shrink-0 text-green-500" />
                )}
                <span>{highlightText(result.message_content, debouncedQuery)}</span>
              </div>
            )
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimeAgo(result.updated_at)}
          </div>
          {result.match_type === 'message' && result.message_created_at && (
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {formatTimeAgo(result.message_created_at)}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const EmptyState = ({ type }: { type: 'titles' | 'messages' }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {type === 'titles' ? (
        <FileText className="w-8 h-8 text-neutral-400 mb-3" />
      ) : (
        <MessageSquare className="w-8 h-8 text-neutral-400 mb-3" />
      )}
      <div className="text-sm text-neutral-500 mb-1">
        No {type === 'titles' ? 'titles' : 'messages'} found
      </div>
      <div className="text-xs text-neutral-400">
        Try different search terms
      </div>
    </div>
  );

  const LoadingState = () => (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className={cn(
          "p-4 rounded-lg border animate-pulse",
          theme === 'dark' ? "bg-neutral-800 border-neutral-700" : "bg-neutral-100 border-neutral-200"
        )}>
          <div className="space-y-3">
            <div className={cn(
              "h-4 rounded",
              theme === 'dark' ? "bg-neutral-700" : "bg-neutral-300"
            )} />
            <div className={cn(
              "h-3 rounded w-3/4",
              theme === 'dark' ? "bg-neutral-700" : "bg-neutral-300"
            )} />
            <div className={cn(
              "h-3 rounded w-1/2",
              theme === 'dark' ? "bg-neutral-700" : "bg-neutral-300"
            )} />
          </div>
        </div>
      ))}
    </div>
  );

  // Show login prompt if user is not authenticated
  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(
          "max-w-md w-[90vw] p-0",
          theme === 'dark' ? "bg-neutral-900" : "bg-white"
        )}>
          <DialogHeader className="p-6">
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Search Chats
            </DialogTitle>
          </DialogHeader>
          
          <div className="p-6 pt-0">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <LogIn className="w-12 h-12 text-neutral-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">Authentication Required</h3>
              <p className="text-sm text-neutral-500 mb-4">
                Please sign in with GitHub to search your chats and messages.
              </p>
              <Button 
                onClick={() => onOpenChange(false)}
                className={cn(
                  theme === 'dark' 
                    ? "bg-blue-600 hover:bg-blue-700" 
                    : "bg-blue-500 hover:bg-blue-600"
                )}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-w-6xl w-[90vw] h-[90vh] p-0",
        theme === 'dark' ? "bg-neutral-900" : "bg-white"
      )}>
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Search Chats
          </DialogTitle>
          
          {/* Search Input */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              placeholder="Search in titles and messages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(
                "pl-10 pr-10",
                theme === 'dark' 
                  ? "bg-neutral-800 border-neutral-700" 
                  : "bg-neutral-50 border-neutral-200"
              )}
              autoFocus
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClear}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 w-6 h-6"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-2 gap-6 p-6 pt-0 min-h-0 h-[67vh]">
          {/* Title Search Column */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-blue-500" />
              <h3 className="font-medium text-sm">Chat Titles</h3>
              {titleResults?.results && (
                <span className="text-xs text-neutral-500">
                  ({titleResults.results.length})
                </span>
              )}
            </div>
            
            <ScrollArea className="flex-1 overflow-y-auto pr-4 h-[67vh]">
              {!debouncedQuery.trim() ? (
                <div className="flex flex-col items-center justify-center text-center h-[52vh]">
                  <FileText className="w-8 h-8 text-neutral-400 mb-3" />
                  <div className="text-sm text-neutral-500">Search chat titles</div>
                  <div className="text-xs text-neutral-400">Enter search terms above</div>
                </div>
              ) : titleLoading ? (
                <LoadingState />
              ) : titleResults?.results?.length > 0 ? (
                <div className="space-y-3">
                  {titleResults.results.map((result: SearchResult, index: number) => (
                    <ResultCard key={`title-${result.chat_id}-${index}`} result={result} />
                  ))}
                </div>
              ) : (
                <EmptyState type="titles" />
              )}
            </ScrollArea>
          </div>

          {/* Message Search Column */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-green-500" />
              <h3 className="font-medium text-sm">Message Content</h3>
              {messageResults?.results && (
                <span className="text-xs text-neutral-500">
                  ({messageResults.results.length})
                </span>
              )}
            </div>
            
            <ScrollArea className="flex-1 overflow-y-auto pr-4 h-[67vh]">
              {!debouncedQuery.trim() ? (
                <div className="flex flex-col items-center justify-center text-center h-[52vh]">
                  <MessageSquare className="w-8 h-8 text-neutral-400 mb-3" />
                  <div className="text-sm text-neutral-500">Search message content</div>
                  <div className="text-xs text-neutral-400">Enter search terms above</div>
                </div>
              ) : messageLoading ? (
                <LoadingState />
              ) : messageResults?.results?.length > 0 ? (
                <div className="space-y-3">
                  {messageResults.results.map((result: SearchResult, index: number) => (
                    <ResultCard key={`message-${result.chat_id}-${index}`} result={result} />
                  ))}
                </div>
              ) : (
                <EmptyState type="messages" />
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 