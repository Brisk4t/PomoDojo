// State management
let todos = [];
let currentFilter = 'all';
let isTracking = false;
let focusData = {
  level: 'N/A',
  attention: 0,
  fps: 0
};

const SPRITE_EMOTIONS = {
  veryFocused: '😍',
  focused: '😊',
  neutral: '😐',
  distracted: '😕',
  sleeping: '😴'
};

// Load todos from storage on startup
async function loadTodos() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['todos'], (result) => {
      todos = result.todos || [];
      renderTodos();
      resolve();
    });
  });
}

// Save todos to storage
function saveTodos() {
  chrome.storage.local.set({ todos });
}

// Add new todo
function addTodo(text) {
  if (!text.trim()) return;

  const todo = {
    id: Date.now(),
    text: text.trim(),
    state: 'todo', // todo, doing, done
    createdAt: new Date().toISOString(),
    attentionData: [],
    totalFocusTime: 0
  };

  todos.unshift(todo);
  saveTodos();
  renderTodos();
  document.getElementById('todoInput').value = '';
  updateCurrentTask();
}

// Update todo state
function updateTodoState(id, newState) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  // Notify background script to start/stop tracking
  if (newState === 'doing' && todo.state !== 'doing') {
    chrome.runtime.sendMessage({ action: 'startTracking', todoId: id });
  } else if (newState !== 'doing' && todo.state === 'doing') {
    chrome.runtime.sendMessage({ action: 'stopTracking', todoId: id });
  }

  todo.state = newState;
  saveTodos();
  renderTodos();
  updateCurrentTask();
}

// Delete todo
function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  saveTodos();
  renderTodos();
  updateCurrentTask();
}

// Render todos
function renderTodos() {
  const container = document.getElementById('todosContainer');

  const filtered = todos.filter(todo => {
    if (currentFilter === 'all') return true;
    return todo.state === currentFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">No todos yet. Add one to get started!</div>';
    return;
  }

  container.innerHTML = filtered
    .map(todo => {
      const stateEmoji = {
        todo: '⭕',
        doing: '🔵',
        done: '✅'
      }[todo.state];

      const avgAttention =
        todo.attentionData.length > 0
          ? (todo.attentionData.reduce((a, b) => a + b, 0) / todo.attentionData.length * 100).toFixed(0)
          : 'N/A';

      return `
        <div class="todo-item ${todo.state}">
          <div class="todo-state" data-id="${todo.id}" data-state="${todo.state}">
            ${stateEmoji}
          </div>
          <div class="todo-text">${escapeHtml(todo.text)}</div>
          ${todo.state === 'doing' ? `<div class="todo-attention">📊 ${avgAttention}%</div>` : ''}
          <div class="todo-actions">
            <button class="todo-btn delete-btn" data-id="${todo.id}">×</button>
          </div>
        </div>
      `;
    })
    .join('');

  // Attach event listeners
  document.querySelectorAll('.todo-state').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const currentState = e.target.dataset.state;
      const states = ['todo', 'doing', 'done'];
      const nextState = states[(states.indexOf(currentState) + 1) % states.length];
      updateTodoState(id, nextState);
    });
  });

  document.querySelectorAll('.delete-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      deleteTodo(id);
    });
  });
}

// Update current task display
function updateCurrentTask() {
  const doingTodo = todos.find(t => t.state === 'doing');
  const taskName = doingTodo ? doingTodo.text : 'None';
  document.getElementById('currentTask').textContent = taskName.substring(0, 25) + (taskName.length > 25 ? '...' : '');
}

// Update focus level display
function updateFocusDisplay() {
  document.getElementById('focusLevel').textContent = `${focusData.attention}%`;
  if (focusData.source) {
    document.getElementById('dataSource').textContent = focusData.source;
  }
  updateSprite();
}

// Update sprite animation based on focus level
function updateSprite() {
  const sprite = document.getElementById('sprite');
  const attention = focusData.attention;

  // Apply filter effects based on focus level
  if (attention >= 85) {
    // Very focused - brighten and add glow
    sprite.style.filter = 'brightness(1.3) drop-shadow(0 0 8px #667eea)';
    sprite.style.animation = 'idle 1s ease-in-out infinite';
  } else if (attention >= 70) {
    // Focused - normal with slight glow
    sprite.style.filter = 'brightness(1.1) drop-shadow(0 0 4px #667eea)';
    sprite.style.animation = 'idle 2s ease-in-out infinite';
  } else if (attention >= 40) {
    // Neutral - normal
    sprite.style.filter = 'brightness(1) drop-shadow(0 0 0px transparent)';
    sprite.style.animation = 'idle 2s ease-in-out infinite';
  } else if (attention >= 20) {
    // Distracted - dim
    sprite.style.filter = 'brightness(0.7) saturate(0.8)';
    sprite.style.animation = 'idle 3s ease-in-out infinite';
  } else {
    // Very distracted - very dim, grayscale
    sprite.style.filter = 'brightness(0.5) grayscale(0.8)';
    sprite.style.animation = 'idle 4s ease-in-out infinite';
  }
}

// Listen for focus data updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateFocusData') {
    focusData = request.data;
    updateFocusDisplay();
  }

  if (request.action === 'museStatusUpdate') {
    updateMuseStatus(request.isConnected);
  }
});

// Handle filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.filter;
    renderTodos();
  });
});

// Handle add button
document.getElementById('addBtn').addEventListener('click', () => {
  addTodo(document.getElementById('todoInput').value);
});

// Handle enter key in input
document.getElementById('todoInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addTodo(e.target.value);
  }
});

// Handle tracking buttons
document.getElementById('startTracking').addEventListener('click', () => {
  if (!todos.some(t => t.state === 'doing')) {
    alert('Please mark a todo as "Doing" first!');
    return;
  }

  // Start simulated attention tracking
  isTracking = true;
  document.getElementById('startTracking').style.display = 'none';
  document.getElementById('stopTracking').style.display = 'block';
  chrome.runtime.sendMessage({ action: 'startAttentionTracking' });
});

document.getElementById('stopTracking').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopAttentionTracking' });
  isTracking = false;
  document.getElementById('startTracking').style.display = 'block';
  document.getElementById('stopTracking').style.display = 'none';
});

// Muse S connection (in popup context)
let museConnected = false;
let museDevice = null;
let museServer = null;

const MUSE_CONFIG = {
  SERVICE_UUID: '0000fe8d-0000-1000-8000-00805f9b34fb',
  ALPHA_UUID: '273e000d-4c4d-454d-96be-f03bac821358',
  BETA_UUID: '273e000e-4c4d-454d-96be-f03bac821358'
};

document.getElementById('connectMuse').addEventListener('click', async () => {
  const btn = document.getElementById('connectMuse');

  if (museConnected && museDevice) {
    // Disconnect
    try {
      if (museDevice.gatt?.connected) {
        await museDevice.gatt.disconnect();
      }
      museConnected = false;
      museDevice = null;
      museServer = null;

      chrome.runtime.sendMessage({ action: 'setMuseConnected', isConnected: false });
      btn.style.opacity = '0.6';
      btn.textContent = '🧠 Muse S (Disconnected)';
      updateDataSource('Simulated');
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  } else {
    // Connect
    btn.textContent = '🧠 Scanning...';
    btn.disabled = true;

    try {
      // Check if Web Bluetooth is available
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth API not available in this browser');
      }

      console.log('Scanning for Muse S device...');

      museDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'Muse' }],
        optionalServices: [MUSE_CONFIG.SERVICE_UUID]
      });

      console.log('Muse S device selected:', museDevice.name);

      museDevice.addEventListener('gattserverdisconnected', () => {
        console.log('Muse S disconnected');
        museConnected = false;
        chrome.runtime.sendMessage({ action: 'setMuseConnected', isConnected: false });
        btn.style.opacity = '0.6';
        btn.textContent = '🧠 Muse S (Disconnected)';
        updateDataSource('Simulated');
      });

      museServer = await museDevice.gatt.connect();
      console.log('GATT server connected');

      const service = await museServer.getPrimaryService(MUSE_CONFIG.SERVICE_UUID);

      // Get bandpower characteristics
      try {
        const alphaCh = await service.getCharacteristic(MUSE_CONFIG.ALPHA_UUID);
        const betaCh = await service.getCharacteristic(MUSE_CONFIG.BETA_UUID);

        await alphaCh.startNotifications();
        await betaCh.startNotifications();

        let museAlpha = 0;
        let museBeta = 0;

        alphaCh.addEventListener('characteristicvaluechanged', (event) => {
          if (event.target.value.byteLength >= 4) {
            museAlpha = event.target.value.getFloat32(0, true);
            // Send data to background
            chrome.runtime.sendMessage({
              action: 'setMuseData',
              bandpower: { alpha: museAlpha, beta: museBeta }
            });
          }
        });

        betaCh.addEventListener('characteristicvaluechanged', (event) => {
          if (event.target.value.byteLength >= 4) {
            museBeta = event.target.value.getFloat32(0, true);
            // Send data to background
            chrome.runtime.sendMessage({
              action: 'setMuseData',
              bandpower: { alpha: museAlpha, beta: museBeta }
            });
          }
        });

        museConnected = true;
        chrome.runtime.sendMessage({ action: 'setMuseConnected', isConnected: true });
        btn.style.opacity = '1';
        btn.textContent = '🧠 Muse S (Connected)';
        updateDataSource('Muse S');
        console.log('Muse S connected and listening for EEG data');
      } catch (e) {
        console.log('Bandpower characteristics not found:', e);
        throw new Error('Could not connect to Muse S characteristics');
      }
    } catch (error) {
      console.error('Failed to connect to Muse S:', error);
      btn.disabled = false;
      btn.textContent = '🧠 Muse S (Failed)';
      setTimeout(() => {
        btn.textContent = '🧠 Muse S';
        btn.disabled = false;
      }, 2000);
    }

    btn.disabled = false;
  }
});

function updateMuseStatus(isConnected) {
  museConnected = isConnected;
  const btn = document.getElementById('connectMuse');

  if (isConnected) {
    btn.style.opacity = '1';
    btn.textContent = '🧠 Muse S (Connected)';
    updateDataSource('Muse S');
  } else {
    btn.style.opacity = '0.6';
    btn.textContent = '🧠 Muse S (Disconnected)';
    updateDataSource('Simulated');
  }
}

function updateDataSource(source) {
  document.getElementById('dataSource').textContent = source;
}

// Handle sprite click for easter egg
document.getElementById('sprite').addEventListener('click', () => {
  const sprite = document.getElementById('sprite');
  sprite.style.transform = 'rotate(360deg)';
  setTimeout(() => {
    sprite.style.transform = 'rotate(0deg)';
  }, 600);
});

// Utility function
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize
loadTodos().then(() => {
  updateCurrentTask();
  updateFocusDisplay();
});

// Periodically check tracking status
setInterval(() => {
  chrome.runtime.sendMessage({ action: 'getTrackingStatus' }, (response) => {
    if (response?.isTracking !== undefined) {
      isTracking = response.isTracking;
      const startBtn = document.getElementById('startTracking');
      const stopBtn = document.getElementById('stopTracking');

      if (isTracking) {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
      } else {
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
      }
    }
  });
}, 1000);
