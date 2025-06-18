import { useState, useRef, useCallback } from 'react';
import { transcribeVoice } from '@/lib/api/chat';

export interface VoiceRecordingState {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
}

export interface VoiceRecordingActions {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
}

export const useVoiceRecording = (): VoiceRecordingState & VoiceRecordingActions => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Failed to start recording. Please check microphone permissions.');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        try {
          setIsRecording(false);
          setIsTranscribing(true);

          // Stop all tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }

          // Create audio blob
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: 'audio/webm;codecs=opus' 
          });

          // Convert to base64
          const reader = new FileReader();
          reader.onloadend = async () => {
            try {
              const base64Audio = (reader.result as string).split(',')[1];
              
              // Transcribe using Gemini API
              const result = await transcribeVoice(base64Audio, 'audio/webm');
              
              setIsTranscribing(false);
              resolve(result.transcribed_text || null);
              
            } catch (err) {
              console.error('Transcription error:', err);
              setError('Failed to transcribe audio. Please try again.');
              setIsTranscribing(false);
              resolve(null);
            }
          };
          
          reader.readAsDataURL(audioBlob);
          
        } catch (err) {
          console.error('Error processing recording:', err);
          setError('Failed to process recording.');
          setIsTranscribing(false);
          resolve(null);
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    audioChunksRef.current = [];
    setError(null);
  }, [isRecording]);

  return {
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}; 