import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceRecording } from '@/lib/hooks/useVoiceRecording';

interface VoiceRecordButtonProps {
  onTranscriptionComplete: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceRecordButton({ 
  onTranscriptionComplete, 
  disabled = false,
  className 
}: VoiceRecordButtonProps) {
  const {
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecording();

  const handleClick = async () => {
    if (isRecording) {
      // Stop recording and get transcription
      const transcribedText = await stopRecording();
      if (transcribedText) {
        onTranscriptionComplete(transcribedText);
      }
    } else {
      // Start recording
      await startRecording();
    }
  };

  const isActive = isRecording || isTranscribing;
  const isLoading = isTranscribing;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          disabled={disabled || isLoading}
          className={cn(
            "rounded-full transition-all duration-200",
            isRecording && "bg-red-500 hover:bg-red-600 text-white animate-pulse",
            isTranscribing && "bg-blue-500 hover:bg-blue-600 text-white",
            error && "bg-red-100 text-red-600",
            className
          )}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : isTranscribing ? (
          "Transcribing audio..."
        ) : isRecording ? (
          "Click to stop recording"
        ) : (
          "Click to start voice recording"
        )}
      </TooltipContent>
    </Tooltip>
  );
} 