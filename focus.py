import numpy as np
from pylsl import StreamInlet, resolve_byprop
from scipy.signal import welch
import time
from collections import deque
from typing import Callable, Optional, Dict, Any


# Use welch's method to compute band power for each EEG band
def bandpower(data, sample_frequency_hz, band, nperseg=256):
    f, Pxx = welch(data, sample_frequency_hz, nperseg=nperseg)
    idx = np.logical_and(f >= band[0], f <= band[1])
    return np.trapezoid(Pxx[idx], f[idx])

# Calculate the EEG engagement heuristic
def compute_engagement(window, sample_frequency_hz):
    theta = alpha = beta = 0
    for ch in range(window.shape[0]):
        sig = window[ch]
        theta += bandpower(sig, sample_frequency_hz, (4, 8)) # get the theta power
        alpha += bandpower(sig, sample_frequency_hz, (8, 13)) # get the alpha power
        beta  += bandpower(sig, sample_frequency_hz, (13, 30)) # get the beta power
    theta /= window.shape[0]
    alpha /= window.shape[0]
    beta  /= window.shape[0]

    # Higher beta power ~ higher engagement
    # Higher alpha ~ relaxation
    # Higher theta ~ drowsiness
    # Alpha + Theta in denominator to penalize relaxed/drowsy states
    # 1e-6 scale factor
    return beta / (alpha + theta + 1e-6)

def map_to_focus_z(engagement, baseline_mean, baseline_std):
    z = (engagement - baseline_mean) / (baseline_std + 1e-6)
    # Map z ~ [-2, +2] → 1–100
    focus = 50 + 25 * z
    return float(np.clip(focus, 1, 100))

def stream_focus(callback: Callable[[Dict[str, Any]], None], 
                window_len=4, 
                update_every=1, 
                sample_frequency_hz=256):
    """
    Stream focus data with callback for output handling
    
    Args:
        callback: Function that receives focus data dictionary
        window_len: Window length in seconds
        update_every: Update frequency in seconds
        sample_frequency_hz: EEG sampling frequency
    """
    print("Looking for a Muse LSL stream...")
    streams = resolve_byprop('type', 'EEG', timeout=10)
    if not streams:
        raise RuntimeError("No EEG stream found. Run 'muselsl stream' first.")
    
    inlet = StreamInlet(streams[0])
    buffer = []
    n_samples = int(window_len * sample_frequency_hz)
    print("Connected. Calibrating...")

    history = deque(maxlen=30)
    last_update = time.time()

    while True:
        sample, timestamp = inlet.pull_sample(timeout=2.0)
        if sample is None:
            callback({"status": "error", "message": "No EEG data received"})
            continue
        
        buffer.append(sample[:4])

        if len(buffer) >= n_samples and time.time() - last_update > update_every:
            window = np.array(buffer[-n_samples:]).T
            engagement = compute_engagement(window, sample_frequency_hz)
            history.append(engagement)

            if len(history) < 10:
                data = {
                    "status": "calibrating",
                    "progress": len(history),
                    "total": 30
                }
            else:
                mean = np.mean(history)
                std = np.std(history)
                focus = map_to_focus_z(engagement, mean, std)
                data = {
                    "status": "focus",
                    "timestamp": time.time(),
                    "engagement": float(engagement),
                    "focus": float(focus),
                    "baseline": {
                        "mean": float(mean),
                        "std": float(std)
                    }
                }
            
            callback(data)
            last_update = time.time()

if __name__ == "__main__":
    stream_focus(callback=lambda data: print(data))
