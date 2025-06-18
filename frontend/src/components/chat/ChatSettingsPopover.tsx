import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { useAtom } from 'jotai'
import { chatPositionAtom, isAutoScrollAtom } from '@/lib/atoms'
import { useTheme } from '@/lib/theme-context'
import { Settings, Sun, Moon, ScrollText, PanelTop, PanelBottom, PanelRight, LayoutPanelLeft } from "lucide-react"
import { Tooltip , TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from '@/lib/utils'

export function ChatSettingsPopover() {
  const [chatPosition, setChatPosition] = useAtom(chatPositionAtom)
  const [isAutoScroll, setIsAutoScroll] = useAtom(isAutoScrollAtom)
  const { theme, toggleTheme } = useTheme()

  const handlePositionChange = (position: 'bottom' | 'top' | 'right') => {
    setChatPosition(position)
  }

  const getPositionIcon = (position: 'bottom' | 'top' | 'right') => {
    switch (position) {
      case 'bottom': return PanelBottom
      case 'top': return PanelTop  
      case 'right': return PanelRight
      default: return PanelBottom
    }
  }

  const getPositionLabel = (position: 'bottom' | 'top' | 'right') => {
    switch (position) {
      case 'bottom': return 'Bottom'
      case 'top': return 'Top'
      case 'right': return 'Side'
      default: return 'Bottom'
    }
  }

  return (
    <Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>  
            <Button variant="ghost" size="icon" className="rounded-full size-8 hover:bg-neutral-200 dark:hover:bg-neutral-700">
              <Settings className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuLabel>Chat Settings</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          <DropdownMenuGroup>
            {/* Theme Toggle */}
            <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
              <div className="flex items-center gap-2 w-full">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span className="flex-1">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </div>
            </DropdownMenuItem>

            {/* Layout Position Multi-Select */}
            <DropdownMenuItem 
              onClick={(e) => e.preventDefault()} 
              className="cursor-default focus:bg-transparent"
            >
              <div className="flex flex-col gap-3 w-full">
                <div className="flex items-center gap-2">
                  <LayoutPanelLeft className="w-4 h-4" />
                  <span className="flex-1">Input Position</span>
                </div>
                
                <div className="flex gap-2 w-full">
                  {(['bottom', 'top', 'right'] as const).map((position) => {
                    const IconComponent = getPositionIcon(position)
                    const isActive = chatPosition === position
                    
                    return (
                      <Tooltip key={position}>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handlePositionChange(position)
                            }}
                            className={cn(
                              "flex-1 flex  items-center gap-1 h-auto py-2 px-1",
                              isActive && "bg-blue-600 hover:bg-blue-700 text-white",
                              !isActive && "hover:bg-neutral-100 dark:hover:bg-neutral-700"
                            )}
                          >
                            <IconComponent className={cn(
                              "w-4 h-4",
                              isActive && "text-white"
                            )} />
                            <span className="text-xs">{getPositionLabel(position)}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Place input at {getPositionLabel(position).toLowerCase()}</p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            </DropdownMenuItem>

            {/* Auto-scroll Toggle */}
            <DropdownMenuItem 
              onClick={(e) => e.preventDefault()} 
              className="cursor-pointer focus:bg-transparent"
            >
              <div className="flex items-center gap-2 w-full">
                <ScrollText className="w-4 h-4" />
                <span className="flex-1">Auto-scroll</span>
                <Switch
                  checked={isAutoScroll}
                  onCheckedChange={setIsAutoScroll}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent>
        <p>Chat Settings</p>
      </TooltipContent>
    </Tooltip>
  )
}
