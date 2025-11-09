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

// Muse S BLE Integration
const MUSE_S = {
  isConnected: false,
  device: null,
  server: null,
  characteristics: {},

  bandpower: {
    delta: 0,
    theta: 0,
    alpha: 0,
    beta: 0,
    gamma: 0
  },

  // Muse S GATT UUIDs
  MUSE_SERVICE_UUID: '0000fe8d-0000-1000-8000-00805f9b34fb',
  CONTROL_CHARACTERISTIC: '273e0003-4c4d-454d-96be-f03bac821358',
  EEG_CHARACTERISTICS: {
    tp9: '273e0001-4c4d-454d-96be-f03bac821358',
    af7: '273e0002-4c4d-454d-96be-f03bac821358',
    af8: '273e0003-4c4d-454d-96be-f03bac821358',
    tp10: '273e0004-4c4d-454d-96be-f03bac821358'
  },
  ALPHA_RELATIVE_UUID: '273e000d-4c4d-454d-96be-f03bac821358',
  BETA_RELATIVE_UUID: '273e000e-4c4d-454d-96be-f03bac821358',

  connect: async function() {
    try {
      console.log('Scanning for Muse S device...');

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'Muse' }],
        optionalServices: [
          this.MUSE_SERVICE_UUID,
          '0000180a-0000-1000-8000-00805f9b34fb' // Device info
        ]
      });

      console.log('Muse S device selected:', this.device.name);

      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('Muse S disconnected');
        this.isConnected = false;
        notifyMuseStatus(false);
      });

      this.server = await this.device.gatt.connect();
      console.log('GATT server connected');

      const service = await this.server.getPrimaryService(this.MUSE_SERVICE_UUID);

      // Get bandpower characteristics (easiest to use for attention)
      try {
        const alphaCh = await service.getCharacteristic(this.ALPHA_RELATIVE_UUID);
        const betaCh = await service.getCharacteristic(this.BETA_RELATIVE_UUID);

        // Start notifications
        await alphaCh.startNotifications();
        await betaCh.startNotifications();

        alphaCh.addEventListener('characteristicvaluechanged', (event) => {
          this.parseAlphaData(event.target.value);
        });

        betaCh.addEventListener('characteristicvaluechanged', (event) => {
          this.parseBetaData(event.target.value);
        });

        console.log('Muse S connected and listening for EEG data');
        this.isConnected = true;
        notifyMuseStatus(true);
        return true;
      } catch (e) {
        console.log('Bandpower characteristics not found, trying raw EEG...');
        // Fallback to raw EEG data parsing
        return this.connectRawEEG(service);
      }
    } catch (error) {
      console.error('Failed to connect to Muse S:', error);
      this.isConnected = false;
      return false;
    }
  },

  connectRawEEG: async function(service) {
    try {
      // Get raw EEG characteristics
      for (const [channel, uuid] of Object.entries(this.EEG_CHARACTERISTICS)) {
        try {
          const ch = await service.getCharacteristic(uuid);
          await ch.startNotifications();
          ch.addEventListener('characteristicvaluechanged', (event) => {
            this.parseEEGData(event.target.value, channel);
          });
          console.log(`Listening to ${channel} channel`);
        } catch (e) {
          console.log(`Channel ${channel} not available`);
        }
      }
      this.isConnected = true;
      notifyMuseStatus(true);
      return true;
    } catch (error) {
      console.error('Failed to connect to raw EEG:', error);
      return false;
    }
  },

  parseAlphaData: function(dataView) {
    // Alpha relative is at bytes 0-3 (4 channels)
    if (dataView.byteLength >= 16) {
      const alpha = dataView.getFloat32(0, true); // Channel 1 alpha
      this.bandpower.alpha = alpha;
    }
  },

  parseBetaData: function(dataView) {
    // Beta relative is at bytes 0-3
    if (dataView.byteLength >= 16) {
      const beta = dataView.getFloat32(0, true);
      this.bandpower.beta = beta;
    }
  },

  parseEEGData: function(dataView, channel) {
    // Raw EEG data - simplified for demo
    if (dataView.byteLength >= 4) {
      const value = Math.abs(dataView.getFloat32(0, true));
      // Rough estimation of attention based on signal strength
      if (value > 0) {
        this.bandpower.beta = Math.min(100, value / 100);
      }
    }
  },

  disconnect: async function() {
    if (this.device && this.device.gatt.connected) {
      await this.device.gatt.disconnect();
    }
    this.isConnected = false;
    notifyMuseStatus(false);
  },

  getAttention: function() {
    // Calculate attention from EEG bandpower
    // Higher beta/alpha ratio indicates focus/attention
    const betaAlphaRatio = (this.bandpower.beta || 0) / (Math.max(this.bandpower.alpha, 0.1) || 0.1);
    const attention = Math.min(100, Math.max(0, betaAlphaRatio * 25)); // Scale to 0-100
    return Math.round(attention);
  },

  getStatus: function() {
    return {
      isConnected: this.isConnected,
      bandpower: this.bandpower,
      attention: this.getAttention()
    };
  }
};

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
