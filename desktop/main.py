from typing import Callable, Optional, Dict, Any
import asyncio
import websockets
import json
from pathlib import Path
import time
import threading
from focus import stream_focus
from blink_detection import stream_blinks
from threading import Thread
from muselsl import list_muses, stream

# Set of connected clients
clients = set()

# Global state for blink tracking
blink_state = {
    "active": False,
    "thread": None,
    "stop_event": None,
    "latest_data": None,
    "event_loop": None  # Store event loop for broadcasting
}


async def register(websocket):
    """Register a new client connection and handle incoming messages"""
    clients.add(websocket)
    try:
        # Listen for incoming messages
        async for message in websocket:
            await handle_client_message(websocket, message)
    except websockets.exceptions.ConnectionClosed:
        pass
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


def start_blink_tracking():
    """Start blink detection thread"""
    global blink_state

    if blink_state["active"]:
        print("[INFO] Blink tracking already active")
        return

    print("[INFO] Starting blink tracking...")
    blink_state["stop_event"] = threading.Event()
    blink_state["active"] = True

    def blink_callback(data):
        """Store latest blink data and broadcast if no focus stream"""
        blink_state["latest_data"] = data

        # If there's no focus stream active, broadcast blink data independently
        # This allows blink detection to work without Muse S
        if data.get("status") in ["tracking", "no_face"] and blink_state["event_loop"]:
            broadcast_data = {
                "status": "blink_only",
                "timestamp": data.get("timestamp"),
                "blinks": {
                    "total": data.get("total_blinks", 0),
                    "rate": data.get("blink_rate", 0),
                    "ear": data.get("ear", 0),
                    "face_detected": data.get("face_detected", False)
                }
            }
            # Broadcast to all clients
            asyncio.run_coroutine_threadsafe(
                broadcast(broadcast_data),
                blink_state["event_loop"]
            )

    blink_state["thread"] = Thread(
        target=stream_blinks,
        args=(blink_callback, blink_state["stop_event"]),
        daemon=True
    )
    blink_state["thread"].start()


def stop_blink_tracking():
    """Stop blink detection thread"""
    global blink_state

    if not blink_state["active"]:
        print("[INFO] Blink tracking not active")
        return

    print("[INFO] Stopping blink tracking...")
    if blink_state["stop_event"]:
        blink_state["stop_event"].set()

    blink_state["active"] = False
    blink_state["latest_data"] = None

    # Wait for thread to finish
    if blink_state["thread"] and blink_state["thread"].is_alive():
        blink_state["thread"].join(timeout=2)


async def handle_client_message(websocket, message):
    """Handle incoming messages from clients"""
    try:
        data = json.loads(message)
        action = data.get("action")

        if action == "startBlinkTracking":
            start_blink_tracking()
            await websocket.send(json.dumps({
                "status": "success",
                "message": "Blink tracking started"
            }))

        elif action == "stopBlinkTracking":
            stop_blink_tracking()
            await websocket.send(json.dumps({
                "status": "success",
                "message": "Blink tracking stopped"
            }))

        else:
            await websocket.send(json.dumps({
                "status": "error",
                "message": f"Unknown action: {action}"
            }))

    except json.JSONDecodeError:
        await websocket.send(json.dumps({
            "status": "error",
            "message": "Invalid JSON"
        }))
    except Exception as e:
        await websocket.send(json.dumps({
            "status": "error",
            "message": str(e)
        }))


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
        # Merge blink data if available
        if blink_state["active"] and blink_state["latest_data"]:
            blink_data = blink_state["latest_data"]
            # Only include blink data if tracking status is active
            if blink_data.get("status") in ["tracking", "no_face"]:
                data["blinks"] = {
                    "total": blink_data.get("total_blinks", 0),
                    "rate": blink_data.get("blink_rate", 0),
                    "ear": blink_data.get("ear", 0),
                    "face_detected": blink_data.get("face_detected", False)
                }

        # Schedule broadcast() safely on the main loop
        asyncio.run_coroutine_threadsafe(broadcast(data), main_loop)

    try:
        stream_focus(callback)
    except RuntimeError as e:
        print(f"[WARNING] Muse S not available: {e}")
        print("[INFO] Server will continue running for blink detection only")


async def main():
    port = 6969
    base_url = "localhost"

    async with websockets.serve(register, base_url, port):
        print(f"WebSocket server running at ws://{base_url}:{port}")

        # Store the main event loop for blink detection broadcasting
        loop = asyncio.get_event_loop()
        blink_state["event_loop"] = loop

        # Start focus stream thread (optional - will fail gracefully if Muse S not available)
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
