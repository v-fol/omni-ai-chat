import { ChatLayout } from '@/components/chat/ChatLayout';
import { ThemeProvider } from '@/lib/theme-context';

function App() {
  return (
    <ThemeProvider>
      <ChatLayout />
    </ThemeProvider>
  );
}

export default App;