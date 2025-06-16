import { useAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from '@/lib/utils';
import { selectedModelAtom, searchEnabledAtom, type Model, isOpenAtom } from '@/lib/atoms';
import { useModels } from '@/lib/queries';
import { ChevronDown, Bot, Search } from 'lucide-react';
import { useEffect } from 'react';

interface ModelSelectorProps {
  className?: string;
}

export function ModelSelector({ className }: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
  const [searchEnabled, setSearchEnabled] = useAtom(searchEnabledAtom);
  const [isOpen, setIsOpen] = useAtom(isOpenAtom);
  const { data: modelsData, isLoading } = useModels();

  const models = modelsData?.models || [];

  // Auto-disable search when selecting a model that doesn't support it
  useEffect(() => {
    if (!selectedModel.supports_search && searchEnabled) {
      setSearchEnabled(false);
    }
  }, [selectedModel, searchEnabled, setSearchEnabled]);

  const handleModelSelect = (model: Model) => {
    setSelectedModel(model);
  };

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled className={cn("min-w-[140px]", className)}>
        <Bot className="w-3 h-3 mr-2" />
        Loading...
      </Button>
    );
  }

  return (
    <DropdownMenu onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "min-w-[140px] justify-between text-left font-normal",
            className
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="w-3 h-3 shrink-0" />
            <span className="truncate text-xs">{selectedModel.name}</span>

          </div>
          <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform", isOpen && "rotate-180")}  />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-80 max-h-96 overflow-y-auto p-2 rounded-2xl" align="start">
        <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 px-2">
          Available Models
        </div>
        
        {/* Group by provider */}
        {['google', 'github', 'openrouter'].map(provider => {
          const providerModels = models.filter(m => m.provider === provider);
          if (providerModels.length === 0) return null;
          
          return (
            <div key={provider} className="mb-3">
              <div className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1 px-2 capitalize">
                {provider === 'google' ? 'Google' : provider === 'github' ? 'GitHub' : 'OpenRouter'}
              </div>
              <div className="space-y-1">
                {providerModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleModelSelect(model)}
                    className={cn(
                      "w-full text-left p-2 rounded-md text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors",
                      selectedModel.id === model.id && "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Bot className="w-3 h-3 shrink-0" />
                        <span className="font-medium truncate">{model.name}</span>
                        {model.supports_search && (
                          <Search className="w-3 h-3 text-blue-500 shrink-0" />
                        )}
                      </div>
                      {selectedModel.id === model.id && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 pl-5">
                      {model.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 