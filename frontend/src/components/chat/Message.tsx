import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { useState, useMemo, useEffect, useRef } from 'react';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus as syntaxHighlighterStyle, materialLight as syntaxHighlighterStyleLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
// import { vs2015 as syntaxHighlighterStyle } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { Copy, CheckIcon, CopyIcon } from 'lucide-react';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import golang from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import Markdown from 'react-markdown';

import '../../markdown.css';


// Register languages for syntax highlighting
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('go', golang);
SyntaxHighlighter.registerLanguage('rust', rust);


interface MessageProps {
  content: string;
  isUser: boolean;
  timestamp: Date;
  model: string;
  completedAt?: Date; // When the message was completed (for AI messages)
  status?: 'complete' | 'incomplete' | 'streaming';
  isComplete?: boolean;
  tokens?: number; // Token count for this message
}

interface CustomCodeProps extends React.HTMLAttributes<HTMLElement> {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Message({ content, isUser, timestamp, model, completedAt, status, isComplete, tokens }: MessageProps) {
  const { theme } = useTheme();
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [displayedContent, setDisplayedContent] = useState('');
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);
  const contentRef = useRef<HTMLDivElement>(null);
  const isStreaming = status === 'streaming';

  // Calculate tokens per second for AI messages
  const tokensPerSecond = useMemo(() => {
    if (!tokens || isUser || !completedAt || !timestamp) return undefined;
    
    const durationMs = completedAt.getTime() - timestamp.getTime();
    const durationSeconds = durationMs / 1000;
    
    if (durationSeconds <= 0) return undefined;
    
    return Math.round((tokens / durationSeconds) * 10) / 10; // Round to 1 decimal place
  }, [tokens, isUser, completedAt, timestamp]);

  // Smooth content streaming with height animation
  useEffect(() => {
    if (isUser || status === 'complete') {
      // For user messages or completed AI messages, show everything immediately
      setDisplayedContent(content);
      setContainerHeight(undefined); // Let it be auto
      return;
    }

    if (status === 'streaming') {
      // Update content and animate height
      setDisplayedContent(content);
      
      // Measure content height for smooth animation
      if (contentRef.current) {
        const newHeight = contentRef.current.scrollHeight;
        setContainerHeight(newHeight);
      }
    }
  }, [content, status, isUser]);

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
      <ol className="list-decimal mb-3 mt-2 pl-4 space-y-1" {...props}>{children}</ol>
    ),
    ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className="[&>li]:list-disc [&>li>ul>li]:list-disc [&>li>ul>li>ul>li]:list-disc [&>li>ul>li>ul>li>ul>li]:list-disc mb-2 mt-2 pl-2 space-y-1" {...props}>{children}</ul>
    ),
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
      <li className=" mb-1 ml-2 mt-2" {...props}>{children}</li>
    ),
    table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
      <div className='w-full  overflow-x-auto'>
        <table className="mb-2 mt-2" {...props}>{children}</table>
      </div>
    ),
    tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
      <tr className="mb-2 mt-2 " {...props}>{children}</tr>
    ),
    td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <td className="border border-neutral-700 p-1 align-top pl-2" {...props}>{children}</td>
    ),
    th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <th className="border border-neutral-700 p-1" {...props}>{children}</th>
    ),
    tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
      <tbody className="mb-2 mt-2" {...props}>{children}</tbody>
    ),
    thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
      <thead className="mb-2 mt-2" {...props}>{children}</thead>
    ),
    tfoot: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
      <tfoot className="mb-2 mt-2" {...props}>{children}</tfoot>
    ),
    code: ({ inline, className, children, ...props }: CustomCodeProps) => {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');
      const language = match?.[1];
      const uniqueCopyId = `copy-code-${codeString.slice(0, 20)}-${codeString.length}`;
      

      return !inline && language ? (
        <div className="relative  group my-3 dark:bg-neutral-700 bg-neutral-300 rounded-md text-md max-w-[600px] min-w-full overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-600 scrollbar-track-neutral-900">
          <div className="flex justify-between items-center p-1 z-10">
            <span className=" text-neutral-400 bg rounded-md px-1 py-0.5 font-mono !text-sm" >{language}</span>
            <div className="flex items-center gap-1">
            <button
              onClick={() => handleCopyCode(codeString, uniqueCopyId)}
              className="p-1.5 dark:bg-neutral-700 bg-neutral-300 rounded-md text-xs dark:text-neutral-300 text-neutral-900 dark:hover:bg-neutral-600 hover:bg-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copiedStates[uniqueCopyId] ? 'Copied!' : <Copy size={14} />}
            </button>
            </div>
          </div>
          <SyntaxHighlighter
            style={syntaxHighlighterStyle as any}
            language={language}
            PreTag="div"
            className={'dark:!bg-neutral-950 !bg-neutral-700 dark:brightness-120 brightness-150'}
            customStyle={{ borderBottomLeftRadius: '0.5rem', borderBottomRightRadius: '0.5rem', margin: '0', }}
            {...props}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      ) : !inline ? (
        <span className="dark:bg-neutral-900 bg-neutral-300 bg-opacity-50 dark:text-slate-300 text-neutral-900 pt-0.5 my-0.5 px-2 mx-1 rounded-lg text-sm inline-flex max-w-[600px] overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-600 scrollbar-track-neutral-900" {...props}>
          <code className="font-mono">{children}</code>
        </span>
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
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p className="mb-4 mt-4" {...props}>{children}</p>
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
      

      <div className={cn(
        'flex flex-col w-full'
      )}>
        {/* Message bubble */}
        <div className={cn(
          'px-4 py-2.5',
          isUser ? (
            'bg-blue-600 text-white rounded-b-md rounded-tl-md'
          ) : theme === 'dark' ? (
            ' text-neutral-100 '
          ) : (
            ' text-neutral-900'
          )
        )}>
          {/* Streaming viewport container */}
          <div 
            className={cn(
              "relative transition-all duration-100 linear",
              isStreaming && "overflow-hidden"
            )}
            style={{
              height: isStreaming && containerHeight ? `${containerHeight}px` : 'auto'
            }}
          >
            <div 
              ref={contentRef}
              className="break-words markdown-body leading-relaxed"
            >
              {isUser ? (
                content
              ) : (
                <Markdown
                  children={displayedContent || content}
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                />
              )}
              {/* Streaming cursor indicator */}
              {isStreaming && !isUser && (
                // fade out effect 
                <>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t h-28 from-neutral-800 to-transparent " />
                <span className="inline-block w-2 h-4 bg-neutral-500 dark:bg-neutral-400 ml-1 animate-pulse" />
                </>
              )}
            </div>
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

          {/* Model */}
          {!isUser && model && (
            <>
              <span>•</span>
              <span>{model}</span>
            </>
          )}

          {/* Token count - only show for AI messages with token data */}
          {tokens !== undefined && (
            <>
              <span>•</span>
              <span title={`${tokens} tokens${tokensPerSecond ? ` at ${tokensPerSecond} tokens/sec` : ''}`}>
                {tokens} tokens{tokensPerSecond ? ` (${tokensPerSecond} tokens/sec)` : ''}
              </span>
            </>
          )}

          {/* Time to complete */}
          {completedAt && (
            <>
              <span>•</span>
              <span>
                {Math.round((completedAt.getTime() - timestamp.getTime()) / 10) / 100}s
              </span>
            </>
          )}
          

          {/* Action buttons - only show on hover */}
          <div className="flex gap-1">
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
          </div>
        </div>
      </div>

      {/* Avatar for User */}
      {isUser && (
        <div className="w-13 h-8 rounded-full bg-blue-600 flex items-center justify-center ml-[30%] mt-1">
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