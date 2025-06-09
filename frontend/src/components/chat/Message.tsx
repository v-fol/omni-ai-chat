import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, CheckIcon, CopyIcon } from 'lucide-react';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';

// Register languages for syntax highlighting
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('sql', sql);


interface MessageProps {
  content: string;
  isUser: boolean;
  timestamp: Date;
  status?: 'complete' | 'incomplete' | 'streaming';
  isComplete?: boolean;
}

interface CustomCodeProps extends React.HTMLAttributes<HTMLElement> {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Message({ content, isUser, timestamp, status, isComplete }: MessageProps) {
  const { theme } = useTheme();
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  const handleCopyCode = (code: string, uniqueId: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedStates(prev => ({ ...prev, [uniqueId]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [uniqueId]: false }));
      }, 2000);
    });
  };

  // Custom components for react-markdown
  const markdownComponents = useMemo(() => ({
    
    ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
      <ol className="list-decimal mb-3 pl-4 space-y-1" {...props}>{children}</ol>
    ),
    ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className="list-disc mb-1 pl-2 space-y-1" {...props}>{children}</ul>
    ),
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
      <li className="mb-1" {...props}>{children}</li>
    ),
    code: ({ inline, className, children, ...props }: CustomCodeProps) => {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');
      const language = match?.[1];
      const uniqueCopyId = `copy-code-${codeString.slice(0, 20)}-${codeString.length}`;

      return !inline && language ? (
        <div className="relative group my-3 text-sm">
          <div className="absolute top-0 right-0 p-1 z-10">
            <button
              onClick={() => handleCopyCode(codeString, uniqueCopyId)}
              className="p-1.5 bg-neutral-700 rounded-md text-xs text-neutral-300 hover:bg-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copiedStates[uniqueCopyId] ? 'Copied!' : <Copy size={14} />}
            </button>
          </div>
          <SyntaxHighlighter
            style={vscDarkPlus as any}
            language={language}
            PreTag="div"
            customStyle={{ borderRadius: '0.5rem', margin: '0' }}
            {...props}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      ) : !inline ? (
        <pre className="bg-neutral-900 bg-opacity-50 text-slate-300 p-1 px-2 mx-1 rounded-lg text-sm inline-flex" {...props}>
          <code className="font-mono">{children}</code>
        </pre>
      ) : (
        <code className={`inline-block bg-neutral-600 px-1.5 py-0.5 rounded-md text-sm font-mono whitespace-pre-wrap overflow-wrap-break-word ${className || ''}`} {...props}>
          {children}
        </code>
      );
    },
    a: ({ children, ...props }: React.HTMLAttributes<HTMLAnchorElement>) => (
      <a className="text-blue-400 hover:text-blue-300 underline" {...props}>{children}</a>
    ),
    h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1 className="text-2xl font-semibold mb-3 mt-4" {...props}>{children}</h1>
    ),
    h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 className="text-xl font-semibold mb-3 mt-3" {...props}>{children}</h2>
    ),
    h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 className="text-lg font-semibold mb-2 mt-2" {...props}>{children}</h3>
    ),
    blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote className="border-l-4 border-neutral-600 pl-4 italic my-3 text-neutral-400" {...props}>{children}</blockquote>
    ),
  }), [copiedStates]);

  return (
    <div className={cn(
      "group relative flex items-start gap-4 p-4 rounded-lg",
      isUser ? "flex-row-reverse" : "flex-row",
      theme === 'dark' ? 'hover:bg-background-dark-secondary' : 'hover:bg-background-secondary'
    )}>
      {/* Avatar for AI */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center mr-2 mt-1">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 text-neutral-200"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 3.5V2m3 0v1.5m3 0V2M9 13h.01M15 13h.01M9 19.5V21m3 0v-1.5m3 0V21m-3-9.5v.5m-6 0a9 9 0 1118 0 9 9 0 01-18 0z"
            />
          </svg>
        </div>
      )}

      <div className={cn(
        'flex flex-col max-w-[80%] md:max-w-[70%] lg:max-w-[60%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* Message bubble */}
        <div className={cn(
          'rounded-2xl px-4 py-2.5 shadow-sm',
          isUser ? (
            'bg-blue-600 text-white rounded-br-md'
          ) : theme === 'dark' ? (
            'bg-neutral-800 text-neutral-100 rounded-bl-md border border-neutral-700'
          ) : (
            'bg-white text-neutral-900 rounded-bl-md border border-neutral-200'
          )
        )}>
          <div className="text-sm whitespace-pre-wrap break-words">
            {isUser ? (
              content
            ) : (
              <Markdown
                components={markdownComponents}
                remarkPlugins={[remarkGfm]}
              >
                {content || ''}
              </Markdown>
            )}
          </div>
        </div>

        {/* Timestamp and actions */}
        <div className={cn(
          'flex items-center gap-2 mt-1 text-xs',
          isUser ? 'text-neutral-400' : 'text-neutral-500',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-200'
        )}>
          {/* Time */}
          <span>
            {timestamp.toLocaleTimeString([], { 
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>

          {/* Action buttons - only show on hover */}
          <div className="flex gap-1">
            {!isUser && (
              <button
                className="p-1 hover:text-neutral-300 rounded transition-colors duration-200"
                title="Copy message"
                onClick={() => handleCopyCode(content, 'message-' + timestamp.getTime())}
              >
                {copiedStates['message-' + timestamp.getTime()] ? (
                  <CheckIcon className="w-3 h-3" />
                ) : (
                  <CopyIcon className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Avatar for User */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center ml-2 mt-1">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
      )}

      {/* Status indicator for incomplete messages */}
      {!isUser && status === 'incomplete' && (
        <div className="absolute top-2 right-2 flex items-center text-sm text-red-500">
          <span className="mr-1">⚠️</span>
          <span>Message incomplete</span>
        </div>
      )}
    </div>
  );
} 