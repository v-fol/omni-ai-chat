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
import { Settings, Sun, Moon, LayoutGrid, ScrollText } from "lucide-react"
import { Tooltip , TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function ChatSettingsPopover() {
  const [chatPosition, setChatPosition] = useAtom(chatPositionAtom)
  const [isAutoScroll, setIsAutoScroll] = useAtom(isAutoScrollAtom)
  const { theme, toggleTheme } = useTheme()

  const handlePositionChange = () => {
    const positions = ['bottom', 'top', 'right'] as const
    const currentIndex = positions.indexOf(chatPosition)
    const nextIndex = (currentIndex + 1) % positions.length
    setChatPosition(positions[nextIndex])
  }

  const getPositionLabel = () => {
    switch (chatPosition) {
      case 'bottom': return 'Bottom'
      case 'top': return 'Top'
      case 'right': return 'Right'
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
        <DropdownMenuContent className="w-56" align="start">
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

            {/* Position Toggle */}
            <DropdownMenuItem onClick={handlePositionChange} className="cursor-pointer">
              <div className="flex items-center gap-2 w-full">
                <LayoutGrid className="w-4 h-4" />
                <span className="flex-1">Input Position</span>
                <span className="text-xs text-neutral-500">{getPositionLabel()}</span>
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
