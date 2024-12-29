from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import os
from dotenv import load_dotenv
from websockets import connect
from typing import Dict

load_dotenv()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

with open("system_instruction.txt", "r", encoding="utf-8") as file:
    system_instruction_text = file.read()

class GeminiConnection:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.model = "gemini-2.0-flash-exp"
        self.uri = (
            "wss://generativelanguage.googleapis.com/ws/"
            "google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"
            f"?key={self.api_key}"
        )
        self.ws = None
        self.last_turn_complete = True  # Add this line

    async def connect(self):
        """Initialize connection to Gemini"""
        self.ws = await connect(self.uri, additional_headers={"Content-Type": "application/json"})

        # Send initial setup message with configuration
        setup_message = {
            "setup": {
                "model": f"models/{self.model}",
                "generation_config": {
                    "response_modalities": ["AUDIO"],
                    "speech_config": {
                        "voice_config": {
                            "prebuilt_voice_config": {
                                "voice_name": "Aoede"
                            }
                        }
                    }
                },
                "system_instruction": {
                    "parts": [
                        {
                            "text": system_instruction_text
                        }
                    ]
                }
            }
        }
        await self.ws.send(json.dumps(setup_message))
        return await self.ws.recv()

    async def send_audio(self, audio_data: str):
        """Send audio data to Gemini"""

        try:
            realtime_input_msg = {
                "realtime_input": {
                    "media_chunks": [
                        {
                            "data": audio_data,
                            "mime_type": "audio/pcm"
                        }
                    ]
                }
            }
            # print("Sending audio data to Gemini")
            await self.ws.send(json.dumps(realtime_input_msg))
            self.last_turn_complete = False
        except Exception as e:
            print(f"Error sending audio: {e}")

    async def receive(self):
        """Receive message from Gemini"""
        return await self.ws.recv()

    async def close(self):
        """Close the connection"""
        if self.ws:
            await self.ws.close()

    async def send_image(self, image_data: str):
        """Send image data to Gemini"""
        image_message = {
            "realtime_input": {
                "media_chunks": [
                    {
                        "data": image_data,
                        "mime_type": "image/jpeg"
                    }
                ]
            }
        }
        await self.ws.send(json.dumps(image_message))

    async def send_text(self, text: str):
        """Send text message to Gemini"""
        text_message = {
            "client_content": {
                "turns": [
                    {
                        "role": "user",
                        "parts": [{"text": text}]
                    }
                ],
                "turn_complete": True
            }
        }
        await self.ws.send(json.dumps(text_message))

# Store active connections
connections: Dict[str, GeminiConnection] = {}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    print(f"New connection attempt from client: {client_id}")
    client_task = None
    gemini_task = None

    try:
        await websocket.accept()
        print(f"WebSocket connection accepted for client: {client_id}")

        # Create and initialize Gemini connection
        gemini = GeminiConnection()
        connections[client_id] = gemini

        # Initialize Gemini connection immediately
        await gemini.connect()
        print(f"Gemini connection established for client {client_id}")

        # Send initial greeting
        initial_prompt = (
            "Greet the student, tell them who you are and what are you tasked for and ask for "
            "the name to start the interview."
        )
        await gemini.send_text(initial_prompt)

        # Handle bidirectional communication
        async def receive_from_client():
            try:
                while True:
                    try:
                        # Check if connection is closed
                        if websocket.client_state.value == 3:  # WebSocket.CLOSED
                            print("WebSocket connection closed by client")
                            return

                        message = await websocket.receive()

                        # Check for close message
                        if message["type"] == "websocket.disconnect":
                            print("Received disconnect message")
                            return

                        message_content = json.loads(message["text"])
                        # print(f"Received message type: {message_content['type']}")

                        if message_content["type"] == "audio":
                            # print("Received audio data from client")
                            await gemini.send_audio(message_content["data"])
                        elif message_content["type"] == "image":
                            await gemini.send_image(message_content["data"])
                        elif message_content["type"] == "text":
                            await gemini.send_text(message_content["data"])
                        else:
                            print(f"Unknown message type: {message_content['type']}")
                    except json.JSONDecodeError as e:
                        print(f"JSON decode error: {e}")
                        continue
                    except KeyError as e:
                        print(f"Key error in message: {e}")
                        continue
                    except Exception as e:
                        print(f"Error processing client message: {str(e)}")
                        if "disconnect message" in str(e):
                            return
                        continue

            except Exception as e:
                print(f"Fatal error in receive_from_client: {str(e)}")
                return

        async def receive_from_gemini():
            try:
                while True:
                    if websocket.client_state.value == 3:  # WebSocket.CLOSED
                        print("WebSocket closed, stopping Gemini receiver")
                        return

                    msg = await gemini.receive()
                    response = json.loads(msg)
                    # print("Received response from Gemini")

                    # Forward audio data to client
                    parts = response["serverContent"]["modelTurn"]["parts"]
                    for p in parts:
                        # Check connection state before each send
                        if websocket.client_state.value == 3:
                            return

                        if "inlineData" in p:
                            # print("Sending audio response to client")
                            await websocket.send_json({
                                "type": "audio",
                                "data": p["inlineData"]["data"]
                            })
                        elif "text" in p:
                            print(f"Sending text response: {p['text']}")
                            await websocket.send_json({
                                "type": "text",
                                "data": p["text"]
                            })

                    if response["serverContent"].get("turnComplete", False):
                        gemini.last_turn_complete = True
                        print("Turn complete")
            except Exception as e:
                print(f"Error receiving from Gemini: {e}")

        # Create and start both tasks
        client_task = asyncio.create_task(receive_from_client())
        gemini_task = asyncio.create_task(receive_from_gemini())

        # Wait for either task to complete
        done, pending = await asyncio.wait(
            [client_task, gemini_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        # Cancel any pending tasks
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    except asyncio.TimeoutError:
        print(f"Connection timed out for client {client_id}")
        await websocket.close(code=1001)  # Going away
    except Exception as e:
        print(f"WebSocket error for client {client_id}: {str(e)}")
        if not websocket.client_state.value == 3:  # If not already closed
            await websocket.close(code=1011)  # Internal error
    finally:
        # Cleanup tasks and connection
        if client_task and not client_task.done():
            client_task.cancel()
        if gemini_task and not gemini_task.done():
            gemini_task.cancel()
        if client_id in connections:
            await connections[client_id].close()
            del connections[client_id]
        print(f"Connection cleaned up for client {client_id}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
