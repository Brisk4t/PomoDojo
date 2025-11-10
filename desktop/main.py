from typing import Callable, Optional, Dict, Any
import asyncio
import websockets
import json
from pathlib import Path
import time
import threading
from focus import stream_focus
from threading import Thread
from muselsl import list_muses, stream

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
            *[client.send(message) for client in clients], return_exceptions=True
        )


def load_config(path: str = "config.json") -> Dict[str, Any]:
    cfg_path = Path(path)
    if not cfg_path.exists():
        return {}
    try:
        with cfg_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def start_muse_stream(muse_name: Optional[str] = None):
    """Start streaming from the specified Muse device (by name)."""
    muses = list_muses()
    if not muses:
        raise RuntimeError("No Muse devices found")

    chosen = None
    if muse_name:
        for m in muses:
            if m.get("name") == muse_name:
                chosen = m
                break
        if not chosen:
            for m in muses:
                if muse_name.lower() in (m.get("name") or "").lower():
                    chosen = m
                    break
        if not chosen:
            available = ", ".join([repr(m.get("name")) for m in muses])
            raise RuntimeError(
                f"Muse named {muse_name!r} not found. Available: {available}"
            )
    else:
        chosen = muses[0]

    print(f"Connecting to {chosen.get('name')} ({chosen.get('address')})...")

    # Create a separate thread with its own asyncio loop
    def thread_target():
        import asyncio

        asyncio.set_event_loop(asyncio.new_event_loop())
        stream(chosen["address"])

    stream_thread = threading.Thread(target=thread_target, daemon=True)
    stream_thread.start()

    time.sleep(5)
    return stream_thread


def focus_stream_thread(main_loop):
    """Run focus stream in separate thread"""

    def callback(data):
        # Schedule broadcast() safely on the main loop
        asyncio.run_coroutine_threadsafe(broadcast(data), main_loop)

    stream_focus(callback)


async def main():
    port = 6969
    base_url = "localhost"

    async with websockets.serve(register, base_url, port):
        print(f"WebSocket server running at ws://{base_url}:{port}")

        # Pass the main event loop to the thread
        loop = asyncio.get_event_loop()
        thread = Thread(target=focus_stream_thread, args=(loop,), daemon=True)
        thread.start()

        await asyncio.Future()  # Keep server alive


if __name__ == "__main__":
    cfg = load_config("config.json")
    muse_name = cfg.get("hardware", {}).get("BLE_SSID")

    try:
        # start_muse_stream()
        # print("Stream Started Succesfully")
        # time.sleep(5)
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped")
