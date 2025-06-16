import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-context";
import {
  chatPositionAtom,
  isAutoScrollAtom,
  searchEnabledAtom,
  selectedModelAtom,
  sidebarCollapsedAtom,
} from "@/lib/atoms";
import {
  LayoutGrid,
  Sun,
  Moon,
  Search,
  ArrowDown,
  User,
  Bot,
  Globe,
  Send,
  Square,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { ChatInput, type ChatInputRef } from "@/components/chat/ChatInput";
import { ShineBorder } from "@/components/magicui/shine-border";
import { useCallback, useMemo, useState, useRef } from "react";
import remarkGfm from "remark-gfm";
import Markdown from "react-markdown";
import type { Message as MessageType } from "@/lib/atoms";
import { VoiceRecordButton } from "./VoiceRecordButton";
import { ChatSettingsPopover } from "@/components/chat/ChatSettingsPopover";

interface FloatingChatContainerProps {
  onSendMessage: (message: string) => void;
  onVoiceTranscription: (text: string) => void;
  onTerminateGeneration?: () => void;
  isLoading: boolean;
  placeholder?: string;
  className?: string;
  messages?: MessageType[];
  scrollAreaRef?: React.RefObject<HTMLDivElement | null>;
}

const layoutConfig = {
  bottom: {
    containerClass: "w-full max-w-4xl mx-auto px-6 mb-4",
    innerClass: "flex flex-col gap-4 p-2",
    inputWrapperClass: "flex-1",
    controlsClass: "flex justify-between mb-1 mx-1",
    inputRows: 1,
    inputHeight: "min-h-[44px]",
    showNavigation: false,
  },
  top: {
    containerClass: "w-full max-w-4xl mx-auto px-6 mt-4",
    innerClass: "flex items-center gap-3 p-4",
    inputWrapperClass: "flex-1",
    controlsClass: "flex items-center gap-2 mb-2",
    inputRows: 2,
    inputHeight: "min-h-[64px]",
    showNavigation: false,
  },
  right: {
    containerClass: "w-xs h-[100vh] flex ",
    innerClass: "flex flex-col gap-4 p-6",
    inputWrapperClass: "flex-1",
    controlsClass: "flex flex-wrap items-center gap-2",
    inputRows: 6,
    inputHeight: "min-h-[120px]",
    showNavigation: true,
  },
};

export function FloatingChatContainer({
  onSendMessage,
  onVoiceTranscription,
  onTerminateGeneration,
  isLoading,
  placeholder,
  className,
  messages = [],
  scrollAreaRef,
}: FloatingChatContainerProps) {
  const [chatPosition, setChatPosition] = useAtom(chatPositionAtom);
  const [isAutoScroll, setIsAutoScroll] = useAtom(isAutoScrollAtom);
  const { theme, toggleTheme } = useTheme();
  const [searchEnabled, setSearchEnabled] = useAtom(searchEnabledAtom);
  const [selectedModel] = useAtom(selectedModelAtom);
  const [sidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const chatInputRef = useRef<ChatInputRef>(null);
  const [inputValue, setInputValue] = useState('');

  const handlePositionChange = () => {
    const positions = Object.keys(
      layoutConfig
    ) as (keyof typeof layoutConfig)[];
    const currentIndex = positions.indexOf(chatPosition);
    const nextIndex = (currentIndex + 1) % positions.length;
    setChatPosition(positions[nextIndex]);
  };

  const handleVoiceTranscription = useCallback(
    (text: string) => {
      if (chatInputRef.current) {
        chatInputRef.current.setText(text);
        chatInputRef.current.focus();
      }
      setInputValue(text);
      onVoiceTranscription(text);
    },
    [onVoiceTranscription]
  );

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const message = chatInputRef.current?.getValue()?.trim();
      if (message && !isLoading) {
        onSendMessage(message);
        chatInputRef.current?.clear();
        setInputValue('');
      }
    }
  }, [onSendMessage, isLoading]);

  const handleSendClick = useCallback(() => {
    const message = chatInputRef.current?.getValue()?.trim();
    if (message && !isLoading) {
      onSendMessage(message);
      chatInputRef.current?.clear();
      setInputValue('');
    }
  }, [onSendMessage, isLoading]);

  const handleTerminateClick = useCallback(() => {
    if (onTerminateGeneration) {
      onTerminateGeneration();
    }
  }, [onTerminateGeneration]);

  const hasText = inputValue.trim().length > 0;
  const showVoiceButton = !hasText && !isLoading;
  const showSubmitButton = hasText && !isLoading;
  const showTerminateButton = isLoading;

  const config = layoutConfig[chatPosition];

  const controls = (
    <div className={config.controlsClass}>
        <div className="flex items-center gap-2">

      <ChatSettingsPopover />

      <ModelSelector className="rounded-full" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={searchEnabled ? "default" : "ghost"}
            size="icon"
            onClick={() => setSearchEnabled(!searchEnabled)}
            disabled={!selectedModel.supports_search}
            className={cn(
              "rounded-full size-8",
              searchEnabled && "bg-blue-600 hover:bg-blue-700 text-white",
              !searchEnabled &&
                "hover:bg-neutral-200 dark:hover:bg-neutral-700",
              !selectedModel.supports_search && "opacity-50 cursor-not-allowed"
            )}
          >
            <Globe  className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {!selectedModel.supports_search
            ? "Search not supported by this model"
            : searchEnabled
              ? "Disable Google Search"
              : "Enable Google Search"}
        </TooltipContent>
      </Tooltip>
      </div>

      <div>

      {/* Action Buttons */}
      {showVoiceButton && (
        <VoiceRecordButton
          onTranscriptionComplete={handleVoiceTranscription}
          disabled={isLoading}
          className="size-8"
        />
      )}


      
      {showSubmitButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleSendClick}
              size="icon"
              className={cn(
                "rounded-full size-8 transition-colors",
                theme === 'dark' 
                  ? "bg-white hover:bg-neutral-200 text-black" 
                  : "bg-black hover:bg-neutral-800 text-white"
              )}
            >
              <Send className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Send message</TooltipContent>
        </Tooltip>
      )}
      
      {showTerminateButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleTerminateClick}
              size="icon"
              variant="destructive"
              className="rounded-full size-8 bg-red-500 hover:bg-red-600 text-white"
            >
              <Square className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop generation</TooltipContent>
        </Tooltip>
      )}
      </div>
    </div>
  );

  // Chat Navigation Component (only shown in right position)
  function ChatNavigation() {
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);
    const [hoverPosition, setHoverPosition] = useState<{
      top: number;
      left: number;
    } | null>(null);

    const navigationItems = useMemo(() => {
      const items: Array<{
        id: string;
        question: string;
        answer: string;
        questionFull: string;
        answerFull: string;
        timestamp: Date;
        messageIndex: number;
        type: "conversation" | "start";
      }> = [];

      if (messages.length === 0) return items;

      // Create conversation blocks from user-AI message pairs
      for (let i = 0; i < messages.length - 1; i++) {
        const currentMessage = messages[i];
        const nextMessage = messages[i + 1];

        // Look for user question followed by AI answer
        if (currentMessage.isUser && !nextMessage.isUser) {
          const question = currentMessage.content.trim();
          const answer = nextMessage.content.trim();

          // Create shortened versions for display
          const questionShort =
            question.length > 30 ? question.substring(0, 30) + "..." : question;
          const answerShort =
            answer.length > 40 ? answer.substring(0, 40) + "..." : answer;

          items.push({
            id: `conversation-${i}`,
            question: questionShort,
            answer: answerShort,
            questionFull: question,
            answerFull: answer,
            timestamp: currentMessage.timestamp,
            messageIndex: i,
            type: "conversation",
          });
        }
      }

      return items;
    }, [messages]);

    const scrollToMessage = useCallback(
      (messageIndex: number) => {
        const scrollViewport = scrollAreaRef?.current?.querySelector(
          "[data-radix-scroll-area-viewport]"
        );
        if (!scrollViewport) return;

        // Find the message element by its index in the messages array
        const messageElements =
          scrollViewport.querySelectorAll(".message-item");
        const targetElement = messageElements[messageIndex] as HTMLElement;

        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      },
      [scrollAreaRef]
    );

    const scrollToTop = useCallback(() => {
      const scrollViewport = scrollAreaRef?.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, [scrollAreaRef]);

    const scrollToBottom = useCallback(() => {
      const scrollViewport = scrollAreaRef?.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTo({
          top: scrollViewport.scrollHeight,
          behavior: "smooth",
        });
      }
    }, [scrollAreaRef]);

    const handleMouseEnter = useCallback(
      (itemId: string, event: React.MouseEvent) => {
        setHoveredItem(itemId);
        const rect = event.currentTarget.getBoundingClientRect();
        setHoverPosition({
          top: rect.top,
          left: rect.left - 2,
        });
      },
      []
    );

    const handleMouseLeave = useCallback(() => {
      setHoveredItem(null);
      setHoverPosition(null);
    }, []);

    const hoveredConversation = hoveredItem
      ? navigationItems.find((item) => item.id === hoveredItem)
      : null;

    if (!config.showNavigation) return null;

    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Navigation
          </h3>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={scrollToTop}
                  className="size-5"
                >
                  <ArrowDown className="w-3 h-3 rotate-180" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Go to top</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={scrollToBottom}
                  className="size-5"
                >
                  <ArrowDown className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Go to bottom</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          <div className="space-y-1">
            {navigationItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "p-2 rounded-md cursor-pointer transition-colors border-l-2 border-transparent",
                  "hover:bg-neutral-100 dark:hover:bg-neutral-700",
                  "hover:border-l-blue-500"
                )}
                onMouseEnter={(e) => handleMouseEnter(item.id, e)}
                onMouseLeave={handleMouseLeave}
                onClick={() => scrollToMessage(item.messageIndex)}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <User className="w-3 h-3" />
                    <span className="font-mono">
                      {item.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200 line-clamp-2">
                    {item.question}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <Bot className="w-3 h-3" />
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                    {item.answer}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {messages.length > 0 && (
          <div className="mt-3 pt-2 border-t border-neutral-300 dark:border-neutral-700">
            <div className="text-xs text-neutral-500">
              {
                navigationItems.filter((item) => item.type === "conversation")
                  .length
              }{" "}
              topic
              {navigationItems.filter((item) => item.type === "conversation")
                .length !== 1
                ? "s"
                : ""}{" "}
              • {messages.length} message{messages.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        {/* Hover preview - positioned outside scroll container */}
        {hoveredItem && hoverPosition && hoveredConversation && (
          <div
            className={cn(
              "fixed z-50 w-[28rem] p-3 rounded-lg shadow-lg border",
              "max-h-60 overflow-y-hidden",
              theme === "dark"
                ? "bg-neutral-800 border-neutral-700 text-neutral-100"
                : "bg-white border-neutral-300 text-neutral-900"
            )}
            style={{
              top: hoverPosition.top,
              left: hoverPosition.left - 448 - 8,
              transform: "translateY(-50%)",
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">Question</span>
              </div>
              <div className="text-sm text-neutral-700 dark:text-neutral-300 pl-6">
                {hoveredConversation.questionFull}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Bot className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium">Answer</span>
              </div>
              <div className="text-sm text-neutral-700 dark:text-neutral-300 pl-6">
                <Markdown
                  children={
                    hoveredConversation.answerFull.length > 200
                      ? hoveredConversation.answerFull.substring(0, 200) + "..."
                      : hoveredConversation.answerFull
                  }
                  remarkPlugins={[remarkGfm]}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={config.containerClass}>
      <div
        className={cn(
          "relative rounded-3xl shadow-2xl backdrop-blur-sm border",
          theme === "dark"
            ? "bg-neutral-900/95 border-neutral-700/50"
            : "bg-white/95 border-neutral-200/50",
          config.showNavigation && "min-h-[500px]" // Ensure minimum height for navigation
        )}
      >
        {messages.length === 0 && (
          <ShineBorder
            className="opacity-50"
            shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]}
          />
        )}

        <div
          className={cn(
            config.innerClass,
            config.showNavigation && "h-full",
            "relative z-10"
          )}
        >

          <div className={config.inputWrapperClass}>
            <ChatInput
              theme={theme}
              placeholder={placeholder}
              inputWrapperClass="relative"
              inputHeight={config.inputHeight}
              rows={config.inputRows}
              isFloating={true}
              disabled={isLoading}
              onInputChange={handleInputChange}
              onKeyDown={handleKeyDown}
              ref={chatInputRef}
              />
          </div>
        
            {chatPosition !== "right" && controls}

          {chatPosition === "right" && (
            <>
              {controls}
              <ChatNavigation />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
