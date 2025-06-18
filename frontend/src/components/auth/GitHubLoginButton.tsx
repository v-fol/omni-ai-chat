import { Button } from '@/components/ui/button';
import { Github } from 'lucide-react';

export function GitHubLoginButton() {
  const handleLogin = () => {
    // Redirect to the FastAPI GitHub auth endpoint
    window.location.href = 'http://localhost:8000/auth/github';
  };

  return (
    <Button
      onClick={handleLogin}
      className="flex w-full items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white"
    >
      <Github size={20} />
      Sign in with GitHub
    </Button>
  );
} 