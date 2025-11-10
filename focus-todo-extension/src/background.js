// Background service worker for attention tracking

let isTracking = false;
let currentTodoId = null;
let cameraStream = null;
let lastDistractedNotification = 0;
let spriteBase = chrome.runtime.getURL('images/study_mode/sprite_study.gif');

let focusData = {
  level: 'N/A',
  attention: 0,
  fps: 0,
  blinks: null  // Will contain {total, rate, ear, face_detected} when blink tracking is active
};

// Initialize icon on startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '0%' });
  chrome.action.setBadgeBackgroundColor({ color: '#d0c8d8' });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'startTracking':
      currentTodoId = request.todoId;
      // Start blink tracking when task tracking starts
      startBlinkTracking();
      sendResponse({ success: true });
      break;
    case 'stopTracking':
      currentTodoId = null;
      // Stop blink tracking when task tracking stops
      stopBlinkTracking();
      sendResponse({ success: true });
      break;
    case 'startAttentionTracking':
      startAttentionTracking();
      sendResponse({ success: true });
      break;
    case 'stopAttentionTracking':
      stopAttentionTracking();
      sendResponse({ success: true });
      break;
    case 'getTrackingStatus':
      sendResponse({ isTracking });
      break;
    case 'setMuseData':
      MUSE_S.bandpower = request.bandpower;
      sendResponse({ success: true });
      break;
    case 'setMuseConnected':
      MUSE_S.isConnected = request.isConnected;
      sendResponse({ success: true });
      break;
    case 'getMuseStatus':
      sendResponse(MUSE_S.getStatus());
      break;

    case 'connectMuse':
      connectMuseWithReconnect();
      sendResponse({ success: true });
      break;
  }
});


function notifyDistracted() {
  const now = Date.now();
  // Prevent spam: only one notification per minute
  if (now - lastDistractedNotification < 60_000) return;
  lastDistractedNotification = now;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: spriteBase,
    title: 'Pomo is sad',
    message: 'You seem distracted — refocus and get back on track!'
  }).catch(err => {
    console.warn('Failed to create notification:', err);
  });
}

function connectMuseWithReconnect() {
  if (!MUSE_S.isConnected) {
    MUSE_S.connect().catch(() => {
      // If failed, try reconnect after 5 seconds
      setTimeout(connectMuseWithReconnect, 5000);
    });
  }
}

// Use chrome.alarms to periodically ping the worker so it doesn't sleep
chrome.alarms.create('wakeUp', { periodInMinutes: 1 / 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'wakeUp') {
    console.log('Service worker woke up to keep alive');
    connectMuseWithReconnect();
  }
});

// Start attention tracking (simulated detection)
// Start attention tracking
function startAttentionTracking() {
  if (isTracking) return;
  isTracking = true;

  // Create an alarm to check attention every second
  chrome.alarms.create('attentionCheck', { periodInMinutes: 1 / 60 }); // ~1 second
}

// Stop attention tracking
function stopAttentionTracking() {
  isTracking = false;
  chrome.alarms.clear('attentionCheck');
}

// Start blink tracking
function startBlinkTracking() {
  if (MUSE_S.socket && MUSE_S.isConnected) {
    try {
      MUSE_S.socket.send(JSON.stringify({ action: 'startBlinkTracking' }));
      console.log('[INFO] Sent startBlinkTracking command to desktop app');
    } catch (err) {
      console.error('Failed to send startBlinkTracking command:', err);
    }
  } else {
    console.warn('Cannot start blink tracking: WebSocket not connected');
  }
}

// Stop blink tracking
function stopBlinkTracking() {
  if (MUSE_S.socket && MUSE_S.isConnected) {
    try {
      MUSE_S.socket.send(JSON.stringify({ action: 'stopBlinkTracking' }));
      console.log('[INFO] Sent stopBlinkTracking command to desktop app');
      // Clear blink data from focusData
      focusData.blinks = null;
    } catch (err) {
      console.error('Failed to send stopBlinkTracking command:', err);
    }
  }
}

function getAttentionLevel(value) {
  let state;

  if (value >= 80){ 
    state = 'Deep Focus';
  }
  
  if (value >= 60){ 
    state ='Focused';
    // chrome.action.setIcon({
    //   path: spriteBase
    // });
  }

  if (value >= 40){ 
    state ='Neutral';
    // chrome.action.setIcon({
    //   path: chrome.runtime.getURL('images/sprite_1.png')
    // });
  }

  if (value >= 20){
    state ='Distracted';
    // chrome.action.setIcon({
    //   path: chrome.runtime.getURL('images/sprite_1.png')
    // });
  }

  state ='Very Distracted';

  return state
}

// Periodic attention check
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'attentionCheck' || !isTracking) return;

  let attention;

  if (MUSE_S.isConnected) {
    attention = MUSE_S.getAttention();
  } else {
    // Simulate realistic attention
    const variation = Math.sin(Date.now() / 1000) * 20;
    const noise = (Math.random() - 0.5) * 15;
    attention = Math.max(0, Math.min(100, 60 + variation + noise));
  }

  focusData = {
    level: getAttentionLevel(attention),
    attention: Math.round(attention),
    fps: 30,
    timestamp: Date.now(),
    source: MUSE_S.isConnected ? 'Muse S' : 'Simulated'
  };

  // Update icon badge
  updateIconBadge();

  // Notify if distracted (cooldown: 1 minute) - only when actively working on a task
  if (currentTodoId && focusData.attention < 40) {
    notifyDistracted();
  }

  // Send data to popup
  chrome.runtime.sendMessage({ action: 'updateFocusData', data: focusData })
  .catch(() => {
    // Popup not open — ignore
  });

  // Save to current todo
  if (currentTodoId) {
    chrome.storage.local.get(['todos'], (result) => {
      const todos = result.todos || [];
      const todo = todos.find(t => t.id === currentTodoId);
      if (todo) {
        todo.attentionData.push(Math.round(attention));
        if (todo.attentionData.length > 300) todo.attentionData.shift();
        todo.totalFocusTime += 1;
        chrome.storage.local.set({ todos });
      }
    });
  }
});

// Muse S via WebSocket Integration
const MUSE_S = {
  isConnected: false,
  socket: null,

  connect: function () {
    return new Promise((resolve, reject) => {
      if (this.isConnected) return resolve();

      this.socket = new WebSocket('ws://localhost:6969');

      this.socket.addEventListener('open', () => {
        console.log('Connected to local Muse WebSocket');
        this.isConnected = true;
        notifyMuseStatus(true);
        resolve();
      });

      this.socket.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.status === 'focus') {
            focusData = {
              level: getAttentionLevel(msg.focus),
              attention: msg.focus,
              engagement: msg.engagement,
              baseline: msg.baseline,
              fps: 30,
              timestamp: msg.timestamp,
              source: 'WebSocket Muse',
              blinks: msg.blinks || null  // Include blink data if available
            };

            updateIconBadge();

            // Notify if distracted - only when actively working on a task
            if (currentTodoId && focusData.attention < 40) notifyDistracted();

          chrome.runtime.sendMessage({ action: 'updateFocusData', data: focusData })
            .catch(() => {
              // Popup not open — ignore
            });
          }
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
        reject(err);
      });
    });
  },

  disconnect: function () {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      notifyMuseStatus(false);
    }
  },

  getAttention: function () {
    return focusData.attention || 0;
  },

  getStatus: function () {
    return {
      isConnected: this.isConnected,
      focusData: focusData
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
  const attentionLevelText = focusData.level;
  const badgeText = attentionLevelText > 0 ? `${attentionLevelText}%` : '';
  const badgeColor = attentionLevelText >= 70 ? '#10b981' : attentionLevelText >= 40 ? '#f59e0b' : '#ef4444';

  chrome.action.setBadgeText({ text: badgeText }).catch(err => {
    console.warn('Failed to set badge text:', err);
  });

  chrome.action.setBadgeBackgroundColor({ color: badgeColor }).catch(err => {
    console.warn('Failed to set badge color:', err);
  });
}
