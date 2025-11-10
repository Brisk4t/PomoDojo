"""
Blink detection module for attention tracking.
Streams blink data (rate, EAR) via callback function.
"""

from scipy.spatial import distance as dist
from imutils.video import VideoStream
from imutils import face_utils
import numpy as np
import imutils
import time
import dlib
import cv2
from collections import deque
from typing import Callable, Dict, Any, Optional
import threading


def eye_aspect_ratio(eye):
    """
    Compute the Eye Aspect Ratio (EAR) for blink detection.

    Args:
        eye: Array of (x, y) coordinates for eye landmarks

    Returns:
        float: Eye aspect ratio value
    """
    # Compute euclidean distances between vertical eye landmarks
    A = dist.euclidean(eye[1], eye[5])
    B = dist.euclidean(eye[2], eye[4])
    # Compute euclidean distance between horizontal eye landmarks
    C = dist.euclidean(eye[0], eye[3])
    # Compute and return eye aspect ratio
    ear = (A + B) / (2.0 * C)
    return ear


def stream_blinks(
    callback: Callable[[Dict[str, Any]], None],
    stop_event: Optional[threading.Event] = None,
    shape_predictor_path: str = "Eye-Blink-Detection/shape_predictor_68_face_landmarks.dat",
    ear_threshold: float = 0.25,
    consec_frames: int = 4,
    update_every: float = 1.0
):
    """
    Stream blink detection data with callback for output handling.

    Args:
        callback: Function that receives blink data dictionary
        stop_event: Threading event to signal stop
        shape_predictor_path: Path to dlib facial landmark predictor model
        ear_threshold: EAR threshold below which indicates closed eye
        consec_frames: Number of consecutive frames for blink detection
        update_every: Update frequency in seconds
    """
    if stop_event is None:
        stop_event = threading.Event()

    try:
        # Initialize dlib's face detector and facial landmark predictor
        print("[INFO] Loading facial landmark predictor...")
        detector = dlib.get_frontal_face_detector()
        predictor = dlib.shape_predictor(shape_predictor_path)

        # Get facial landmark indices for left and right eye
        (lStart, lEnd) = face_utils.FACIAL_LANDMARKS_IDXS["left_eye"]
        (rStart, rEnd) = face_utils.FACIAL_LANDMARKS_IDXS["right_eye"]

        # Initialize counters
        counter = 0
        total_blinks = 0

        # Blink rate tracking (rolling window of 60 seconds)
        blink_timestamps = deque(maxlen=100)

        # Start video stream
        print("[INFO] Starting video stream for blink detection...")
        vs = VideoStream(src=0).start()
        time.sleep(2.0)  # Allow camera sensor to warm up

        last_update = time.time()
        start_time = time.time()

        callback({
            "status": "connected",
            "message": "Blink detection initialized"
        })

        # Main detection loop
        while not stop_event.is_set():
            # Grab frame from video stream
            frame = vs.read()
            if frame is None:
                callback({
                    "status": "error",
                    "message": "No video frame received"
                })
                time.sleep(0.1)
                continue

            # Resize and convert to grayscale
            frame = imutils.resize(frame, width=450)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # Detect faces
            rects = detector(gray, 0)

            current_ear = 0.0
            face_detected = len(rects) > 0

            # Process each detected face
            for rect in rects:
                # Determine facial landmarks
                shape = predictor(gray, rect)
                shape = face_utils.shape_to_np(shape)

                # Extract eye coordinates
                leftEye = shape[lStart:lEnd]
                rightEye = shape[rStart:rEnd]

                # Calculate EAR for both eyes
                leftEAR = eye_aspect_ratio(leftEye)
                rightEAR = eye_aspect_ratio(rightEye)

                # Average EAR for both eyes
                ear = (leftEAR + rightEAR) / 2.0
                current_ear = ear

                # Check for blink
                if ear < ear_threshold:
                    counter += 1
                else:
                    # If eyes were closed for sufficient frames, count as blink
                    if counter >= consec_frames:
                        total_blinks += 1
                        blink_timestamps.append(time.time())
                    counter = 0

            # Calculate blink rate (blinks per minute) over last 60 seconds
            current_time = time.time()
            recent_blinks = [ts for ts in blink_timestamps if current_time - ts <= 60]
            blink_rate = len(recent_blinks)  # Already per minute since window is 60 seconds

            # Send update at specified interval
            if current_time - last_update >= update_every:
                elapsed_time = current_time - start_time

                data = {
                    "status": "tracking" if face_detected else "no_face",
                    "timestamp": current_time,
                    "total_blinks": total_blinks,
                    "blink_rate": blink_rate,
                    "ear": round(current_ear, 3),
                    "face_detected": face_detected,
                    "elapsed_time": round(elapsed_time, 1)
                }

                callback(data)
                last_update = current_time

            # Small delay to prevent excessive CPU usage
            time.sleep(0.03)  # ~30 fps

        # Cleanup
        print("[INFO] Stopping blink detection...")
        vs.stop()
        cv2.destroyAllWindows()

        callback({
            "status": "stopped",
            "message": "Blink detection stopped",
            "total_blinks": total_blinks
        })

    except Exception as e:
        callback({
            "status": "error",
            "message": f"Blink detection error: {str(e)}"
        })
        print(f"[ERROR] Blink detection failed: {e}")


if __name__ == "__main__":
    """Test the blink detection streaming"""
    stop = threading.Event()

    def test_callback(data):
        if data["status"] == "tracking":
            print(f"Blinks: {data['total_blinks']} | Rate: {data['blink_rate']}/min | EAR: {data['ear']}")
        else:
            print(data)

    try:
        stream_blinks(callback=test_callback, stop_event=stop)
    except KeyboardInterrupt:
        print("\nStopping...")
        stop.set()
        time.sleep(1)
