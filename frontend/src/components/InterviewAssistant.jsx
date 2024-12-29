import { useState, useEffect, useRef } from 'react';
import { base64ToFloat32Array, float32ToPcm16 } from '../lib/utils';

const InterviewAssistant = () => {
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [status, setStatus] = useState('Ready to start interview');
  const [hasCleanedUp, setHasCleanedUp] = useState(false);

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
      setHasCleanedUp(false);
      // Reset audio queue and playing state
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      // Initialize WebSocket with timeout
      const connectWebSocket = async () => {
        const wsUrl = `${import.meta.env.VITE_WS_URL}/ws/${Date.now()}`;
        const ws = new WebSocket(wsUrl);

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

      // Create audio input pipeline
      const microphoneSource = audioContextRef.current.createMediaStreamSource(streamRef.current);
      const analyser = audioContextRef.current.createAnalyser();
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      // Connect audio nodes
      microphoneSource.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContextRef.current.destination);

      // Process audio data
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
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

      // Store references for cleanup
      mediaRecorderRef.current = processor;

      // Handle incoming messages
      wsRef.current.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received message type:', message.type);

          if (message.type === 'audio' && message.data) {
            await playAudio(message.data);
          } else if (message.type === 'text') {
            setStatus(`AI: ${message.data}`);
            console.log('Received text:', message.data);
          }
        } catch (error) {
          console.error('Error handling message:', error);
        }
      };

      setIsInterviewStarted(true);
      setStatus('Interview in progress...');

    } catch (error) {
      console.error('Error starting interview:', error);
      setStatus(`Error starting interview: ${error.message}`);
      // Cleanup on error
      stopInterview();
    }
  };

  const stopInterview = () => {
    if (!isInterviewStarted || hasCleanedUp) return;

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
    setHasCleanedUp(true);
  };

  useEffect(() => {
    // Only cleanup on unmount if interview was started
    return () => {
      if (isInterviewStarted && !hasCleanedUp) {
        stopInterview();
      }
    };
  }, [isInterviewStarted, hasCleanedUp]);

  return (
    <div className="bg-gradient-to-b from-gray-50 to-gray-100 min-h-screen">
      <div className="container mx-auto px-6 py-8 max-w-7xl"> {/* Increased max width and padding */}
        {/* Header Section */}
        <div className="text-center mb-10"> {/* Reduced margin */}
          <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-tight"> {/* Reduced text size */}
            AI Interview Assistant
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto"> {/* Adjusted text size and max width */}
            Your personal AI-powered interview practice companion. Get real-time feedback and improve your communication skills.
          </p>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto"> {/* Increased max width */}
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-8"> {/* Adjusted padding */}
            {/* Controls */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={startInterview}
                  disabled={isInterviewStarted}
                  className={`px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg
                    hover:from-indigo-700 hover:to-indigo-800 transition-all duration-200
                    flex items-center justify-center gap-2 text-base font-medium ${
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
                  className={`px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg
                    hover:from-red-600 hover:to-red-700 transition-all duration-200
                    flex items-center justify-center gap-2 text-base font-medium ${
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
              <div className={`mt-4 p-4 rounded-lg text-center text-base transition-all duration-300
                ${isInterviewStarted
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  : 'bg-gray-50 text-gray-700 border border-gray-100'}
                min-h-[50px] flex items-center justify-center`}
              >
                {status}
              </div>
            </div>

            {/* Interview Instructions */}
            <div className="mt-8 border-t border-gray-100 pt-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">How it works</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                      1
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">Start Interview</h3>
                      <p className="text-gray-600">Click the button to begin your session</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                      2
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">Speak Clearly</h3>
                      <p className="text-gray-600">Use your microphone to respond</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                      3
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">Get Feedback</h3>
                      <p className="text-gray-600">Say 'EVALUATE' to receive analysis</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                      4
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">End Session</h3>
                      <p className="text-gray-600">Click 'End Interview' when finished</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewAssistant;
