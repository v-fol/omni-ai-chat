import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ChatLayout } from '@/components/chat/ChatLayout'

export const Route = createRootRoute({
  component: () => (
    <>
      <ChatLayout>
        <Outlet />
      </ChatLayout>
      <TanStackRouterDevtools />
    </>
  ),
}) 