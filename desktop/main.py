from typing import Callable, Optional, Dict, Any
import asyncio
import websockets
import json
from focus import stream_focus
from threading import Thread

# Set of connected clients
clients = set()

async def register(websocket):
    """Register a new client connection"""
    clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        clients.remove(websocket)

async def broadcast(data):
    """Broadcast data to all connected clients"""
    if clients:
        # Convert data to JSON string
        message = json.dumps(data)
        # Broadcast to all connected clients
        await asyncio.gather(
            *[client.send(message) for client in clients],
            return_exceptions=True
        )

def focus_stream_thread():
    """Run focus stream in separate thread"""
    # Convert async broadcast to sync using event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    def callback(data):
        loop.create_task(broadcast(data))
    
    stream_focus(callback)

async def main():
    # Start WebSocket server
    port = 6969
    base_url = "localhost"
    async with websockets.serve(register, base_url, port):
        print(f"WebSocket server running at ws://{base_url}:{port}")
        
        # Run focus stream in separate thread
        thread = Thread(target=focus_stream_thread, daemon=True)
        thread.start()
        
        # Keep server running
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped")