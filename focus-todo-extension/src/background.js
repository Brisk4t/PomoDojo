// Background service worker for attention tracking

let isTracking = false;
let currentTodoId = null;
let cameraStream = null;
let focusData = {
  level: 'N/A',
  attention: 0,
  fps: 0
};

// Initialize icon on startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '0%' });
  chrome.action.setBadgeBackgroundColor({ color: '#d0c8d8' });
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startTracking') {
    currentTodoId = request.todoId;
    sendResponse({ success: true });
  }

  if (request.action === 'stopTracking') {
    currentTodoId = null;
    sendResponse({ success: true });
  }

  if (request.action === 'startAttentionTracking') {
    startAttentionTracking();
    sendResponse({ success: true });
  }

  if (request.action === 'stopAttentionTracking') {
    stopAttentionTracking();
    sendResponse({ success: true });
  }

  if (request.action === 'getTrackingStatus') {
    sendResponse({ isTracking });
  }

  if (request.action === 'setMuseData') {
    // Popup sends us Muse data
    MUSE_S.bandpower = request.bandpower;
    sendResponse({ success: true });
  }

  if (request.action === 'setMuseConnected') {
    MUSE_S.isConnected = request.isConnected;
    sendResponse({ success: true });
  }

  if (request.action === 'getMuseStatus') {
    sendResponse(MUSE_S.getStatus());
  }
});

// Start attention tracking (simulated detection)
function startAttentionTracking() {
  if (isTracking) return;

  isTracking = true;
  runAttentionDetection();
}

// Stop attention tracking
function stopAttentionTracking() {
  isTracking = false;
}

// Run attention detection loop (uses Muse S if connected, otherwise simulated)
function runAttentionDetection() {
  if (!isTracking) return;

  let frameCount = 0;
  const detectionInterval = setInterval(() => {
    if (!isTracking) {
      clearInterval(detectionInterval);
      return;
    }

    let attention;

    if (MUSE_S.isConnected) {
      // Use real Muse S EEG data
      attention = MUSE_S.getAttention();
    } else {
      // Simulate realistic attention detection with variations
      // In production, integrate real detection (face-api.js, TensorFlow, etc)
      const baseAttention = 60;
      const variation = Math.sin(frameCount / 30) * 20; // Natural fluctuation
      const noise = (Math.random() - 0.5) * 15; // Random variation
      attention = Math.max(0, Math.min(100, baseAttention + variation + noise));
    }

    focusData = {
      level: getAttentionLevel(attention),
      attention: Math.round(attention),
      fps: 30,
      timestamp: Date.now(),
      source: MUSE_S.isConnected ? 'Muse S' : 'Simulated'
    };

    // Update icon badge with focus level
    updateIconBadge();

    // Send to popup
    chrome.runtime.sendMessage({
      action: 'updateFocusData',
      data: focusData
    }).catch(() => {
      // Popup not open, ignore
    });

    // Save to current todo
    if (currentTodoId) {
      chrome.storage.local.get(['todos'], (result) => {
        const todos = result.todos || [];
        const todo = todos.find(t => t.id === currentTodoId);
        if (todo) {
          todo.attentionData.push(Math.round(attention));
          // Keep last 300 samples (~10 minutes at 30fps)
          if (todo.attentionData.length > 300) {
            todo.attentionData.shift();
          }
          todo.totalFocusTime += 1;
          chrome.storage.local.set({ todos });
        }
      });
    }

    frameCount++;
  }, 33); // ~30 FPS
}

// Get attention level description
function getAttentionLevel(score) {
  if (score >= 80) return 'Very Focused';
  if (score >= 60) return 'Focused';
  if (score >= 40) return 'Neutral';
  if (score >= 20) return 'Distracted';
  return 'Very Distracted';
}

// Muse S via WebSocket Integration
const MUSE_S = {
  isConnected: false,
  socket: null,

  connect: function() {
    if (this.isConnected) return;

    this.socket = new WebSocket('ws://localhost:6969');

    this.socket.addEventListener('open', () => {
      console.log('Connected to local Muse WebSocket');
      this.isConnected = true;
      notifyMuseStatus(true);
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.status === 'calibrating') {
          focusData = {
            level: 'Calibrating',
            attention: 0,
            fps: 30,
            progress: msg.progress,
            total: msg.total,
            timestamp: Date.now(),
            source: 'WebSocket Muse'
          };
        } else if (msg.status === 'focus') {
          // Map focus value to attention level
          let level;
          if (msg.focus >= 80) level = 'Very Focused';
          else if (msg.focus >= 60) level = 'Focused';
          else if (msg.focus >= 40) level = 'Neutral';
          else if (msg.focus >= 20) level = 'Distracted';
          else level = 'Very Distracted';

          focusData = {
            level: level,
            attention: msg.focus,
            engagement: msg.engagement,
            baseline: msg.baseline,
            fps: 30,
            timestamp: msg.timestamp,
            source: 'WebSocket Muse'
          };
        }

        // Update icon badge
        updateIconBadge();
        console.log('Focus Data:', focusData);
        // Send to popup if open
        chrome.runtime.sendMessage({ action: 'updateFocusData', data: focusData });
      
      } catch (e) {
        console.warn('Invalid data from WebSocket', e);
      }
    });

    this.socket.addEventListener('close', () => {
      console.log('Muse WebSocket disconnected');
      this.isConnected = false;
      notifyMuseStatus(false);
    });

    this.socket.addEventListener('error', (err) => {
      console.error('Muse WebSocket error', err);
      this.isConnected = false;
      notifyMuseStatus(false);
    });
  },

  disconnect: function() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      notifyMuseStatus(false);
    }
  },

  getAttention: function() {
    return focusData.attention || 0;
  },

  getStatus: function() {
    return {
      isConnected: this.isConnected,
      focusData: focusData
    };
  }
};

// Listen for popup messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'connectMuse') {
    MUSE_S.connect();
    sendResponse({ success: true });
  }
  if (request.action === 'getLatestFocusData') {
    chrome.storage.local.get(['latestFocusData'], (result) => {
      sendResponse({ data: result.latestFocusData || focusData });
    });
    return true; // keep sendResponse alive for async
  }
});


// Notify popup of Muse status
function notifyMuseStatus(isConnected) {
  chrome.runtime.sendMessage({
    action: 'museStatusUpdate',
    isConnected: isConnected
  }).catch(() => {
    // Popup not open
  });
}

// Update extension icon badge with focus level
function updateIconBadge() {
  const attention = focusData.attention;
  const badgeText = attention > 0 ? `${attention}%` : '';
  const badgeColor = attention >= 70 ? '#10b981' : attention >= 40 ? '#f59e0b' : '#ef4444';

  chrome.action.setBadgeText({ text: badgeText }).catch(err => {
    console.warn('Failed to set badge text:', err);
  });

  chrome.action.setBadgeBackgroundColor({ color: badgeColor }).catch(err => {
    console.warn('Failed to set badge color:', err);
  });
}
