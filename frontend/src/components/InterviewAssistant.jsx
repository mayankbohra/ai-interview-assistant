import { useState, useEffect, useRef } from 'react';
import { base64ToFloat32Array, float32ToPcm16 } from '../lib/utils';

const InterviewAssistant = () => {
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [status, setStatus] = useState('Ready to start interview');

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current) {
      return;
    }

    isPlayingRef.current = true;
    const audioData = audioQueueRef.current.shift();

    try {
      const float32Data = base64ToFloat32Array(audioData);

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000
        });
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const audioBuffer = audioContextRef.current.createBuffer(
        1,
        float32Data.length,
        24000
      );

      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioContextRef.current.createBufferSource();
      const gainNode = audioContextRef.current.createGain();

      source.buffer = audioBuffer;
      gainNode.gain.value = 1.0;

      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      source.onended = () => {
        console.log('Audio playback ended');
        isPlayingRef.current = false;
        playNextInQueue(); // Play next audio in queue
      };

      source.start(0);
      console.log('Audio playback started', {
        queueLength: audioQueueRef.current.length
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      isPlayingRef.current = false;
      playNextInQueue(); // Try next audio in case of error
    }
  };

  const playAudio = async (audioData) => {
    audioQueueRef.current.push(audioData);
    if (!isPlayingRef.current) {
      await playNextInQueue();
    }
  };

  const startInterview = async () => {
    try {
      // Reset audio queue and playing state
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      // Initialize WebSocket with timeout
      const connectWebSocket = async () => {
        const ws = new WebSocket(process.env.REACT_APP_WEBSOCKET_URL + '/ws/' + Date.now());

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket connection timeout'));
          }, 5000); // 5 second timeout

          ws.onopen = () => {
            clearTimeout(timeout);
            console.log('WebSocket connected successfully');
            resolve(ws);
          };

          ws.onerror = (error) => {
            clearTimeout(timeout);
            console.error('WebSocket error:', error);
            reject(error);
          };
        });
      };

      // Try to connect with retries
      let retries = 3;
      let ws = null;

      while (retries > 0 && !ws) {
        try {
          ws = await connectWebSocket();
        } catch (error) {
          console.log(`Connection attempt failed. Retries left: ${retries - 1}`);
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        }
      }

      // Store WebSocket reference
      wsRef.current = ws;

      // Initialize audio context once
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      });

      // Get microphone access with specific constraints
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Create audio source from microphone stream
      const microphoneSource = audioContextRef.current.createMediaStreamSource(streamRef.current);
      const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      // Process audio data in real-time
      scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);

          // Convert Float32Array to PCM16
          const pcm16Data = float32ToPcm16(inputData);

          // Convert to base64
          const base64Data = btoa(
            String.fromCharCode(...new Uint8Array(pcm16Data.buffer))
          );

          // Send audio data
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: base64Data
          }));
        }
      };

      // Connect the audio nodes
      microphoneSource.connect(scriptProcessor);
      scriptProcessor.connect(audioContextRef.current.destination);

      // Store script processor reference for cleanup
      mediaRecorderRef.current = scriptProcessor;

      // Handle incoming messages
      wsRef.current.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message type:', message.type);

        if (message.type === 'audio' && message.data) {
          await playAudio(message.data);
        } else if (message.type === 'text') {
          setStatus(`AI: ${message.data}`);
        }
      };

      setIsInterviewStarted(true);
      setStatus('Interview in progress...');

    } catch (error) {
      console.error('Error starting interview:', error);
      setStatus(`Error starting interview: ${error.message}`);
      stopInterview();
    }
  };

  const stopInterview = () => {
    // Clear audio queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    // Disconnect audio processing
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.disconnect();
    }

    // Stop all audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setIsInterviewStarted(false);
    setStatus('Interview completed!');
  };

  useEffect(() => {
    // Cleanup on component unmount
    return () => {
      stopInterview();
    };
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">AI Interview Assistant</h1>
          <p className="text-gray-600">Your personal interview practice companion</p>
        </div>

        {/* Main Content */}
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
          {/* Controls */}
          <div className="space-y-4">
            <div className="flex justify-center gap-4">
              <button
                onClick={startInterview}
                disabled={isInterviewStarted}
                className={`px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 flex items-center gap-2 ${
                  isInterviewStarted ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Start Interview
              </button>
              <button
                onClick={stopInterview}
                disabled={!isInterviewStarted}
                className={`px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 flex items-center gap-2 ${
                  !isInterviewStarted ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
                End Interview
              </button>
            </div>

            {/* Status Display */}
            <div className="mt-4 p-4 rounded-lg bg-gray-100 text-center text-gray-700 min-h-[50px] flex items-center justify-center">
              {status}
            </div>
          </div>

          {/* Interview Instructions */}
          <div className="mt-8 border-t pt-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">How it works:</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li>Click "Start Interview" to begin</li>
              <li>Speak clearly into your microphone</li>
              <li>The AI interviewer will ask you questions</li>
              <li>Respond naturally as you would in a real interview</li>
              <li>Click "End Interview" when you're finished</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewAssistant;
