import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';

function App() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('all');
  const [focusData, setFocusData] = useState({ attention: 0, source: 'Simulated' });
  const [spriteBase, setSpriteBase] = useState('');
  const [spriteOverlay, setSpriteOverlay] = useState('');
  const overlays = [
    chrome.runtime.getURL('images/study_mode/star_glasses.gif'),
    chrome.runtime.getURL('images/study_mode/heart_glasses.gif'),
    chrome.runtime.getURL('images/study_mode/blue_glasses.gif')
  ];
  const [overlayIndex, setOverlayIndex] = useState(0);

  const prevOverlay = () => {
    setOverlayIndex((prev) => (prev - 1 + overlays.length) % overlays.length);
    setSpriteOverlay(overlays[(overlayIndex - 1 + overlays.length) % overlays.length]);
  };

  const nextOverlay = () => {
    setOverlayIndex((prev) => (prev + 1) % overlays.length);
    setSpriteOverlay(overlays[(overlayIndex + 1) % overlays.length]);
  };

  useEffect(() => {
    setSpriteBase(chrome.runtime.getURL('images/study_mode/sprite_study.gif'));
    setSpriteOverlay(chrome.runtime.getURL('images/study_mode/star_glasses.gif'));
  }, []);


  // Load todos on mount
  useEffect(() => {
    chrome.storage.local.get(['todos'], (result) => {
      setTodos(result.todos || []);
    });
  }, []);

  // Save todos to storage
  useEffect(() => {
    chrome.storage.local.set({ todos });
  }, [todos]);

  // Load latest focus data on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'getLatestFocusData' }, (response) => {
      if (response?.data) setFocusData(response.data);
    });

    // Live updates from background
    const handler = (request) => {
      if (request.action === 'updateFocusData') {
        console.log('Received focus data:', request.data);
        setFocusData(request.data);
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Add new todo
  const addTodo = () => {
    if (!input.trim()) return;
    const todo = {
      id: Date.now(),
      text: input.trim(),
      state: 'todo',
      createdAt: new Date().toISOString(),
      attentionData: [],
    };
    setTodos([todo, ...todos]);
    setInput('');
  };

  // Update todo state
  const updateTodo = (id, newState) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    if (newState === 'doing' && todo.state !== 'doing') {
      chrome.runtime.sendMessage({ action: 'startTracking', todoId: id });
    } else if (newState !== 'doing' && todo.state === 'doing') {
      chrome.runtime.sendMessage({ action: 'stopTracking', todoId: id });
    }

    setTodos(todos.map(t => t.id === id ? { ...t, state: newState } : t));
  };

  // Delete todo
  const deleteTodo = (id) => {
    setTodos(todos.filter(t => t.id !== id));
  };

  const filteredTodos = todos.filter(t => filter === 'all' || t.state === filter);
  const doingTodo = todos.find(t => t.state === 'doing');

  const getStateEmoji = (state) => ({ todo: '⭕', doing: '🔵', done: '✅' }[state] || '⭕');

  return (
    <div className="container">
        <div className="sprite-wrapper">
          <button onClick={prevOverlay} className="sprite-btn">◀</button>
          <div className="sprite-container">
            <img src={spriteBase} alt="Base Sprite" className="sprite" />
            <img src={spriteOverlay} alt="Overlay Sprite" className="sprite overlay" />
          </div>
          <button onClick={nextOverlay} className="sprite-btn">▶</button>
        </div>

      <div className="stats">
        <div className="stat-item">
          <div className="label">Focus Level</div>
          <div className="value">{focusData.attention}%</div>
        </div>
        <div className="stat-item">
          <div className="label">Current Task</div>
          <div className="value">{doingTodo ? doingTodo.text.substring(0, 25) : 'None'}</div>
        </div>
        <div className="stat-item">
          <div className="label">Level</div>
          <div className="value">{focusData.level}</div>
        </div>
      </div>

      <div className="input-section">
        <input
          id="todoInput"
          type="text"
          placeholder="Add a new todo..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addTodo()}
        />
        <button id="addBtn" onClick={addTodo}>Add</button>
      </div>

      <div className="filter-buttons">
        {['all', 'todo', 'doing', 'done'].map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'todo' ? 'To-Do' : f === 'doing' ? 'Doing' : 'Done'}
          </button>
        ))}
      </div>

      <div className="todos-container">
        {filteredTodos.length === 0 ? (
          <div className="empty-state">No todos yet. Add one to get started!</div>
        ) : (
          filteredTodos.map(todo => (
            <div key={todo.id} className={`todo-item ${todo.state}`}>
              <div
                className="todo-state"
                onClick={() => {
                  const states = ['todo', 'doing', 'done'];
                  const next = states[(states.indexOf(todo.state) + 1) % 3];
                  updateTodo(todo.id, next);
                }}
              >
                {getStateEmoji(todo.state)}
              </div>
              <div className="todo-text">{todo.text}</div>
              {todo.state === 'doing' && (
                <div className="todo-attention">📊 N/A</div>
              )}
              <div className="todo-actions">
                <button className="todo-btn delete-btn" onClick={() => deleteTodo(todo.id)}>×</button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="footer">
        <button className="btn-secondary">▶ Start Tracking</button>
        <button
          className="btn-secondary"
          onClick={() => {
            chrome.runtime.sendMessage({ action: 'connectMuse' }, (response) => {
              if (response?.success) {
                console.log('Connecting to Muse WebSocket...');
              }
            });
          }}
        >
          🧠 Muse S
        </button>

      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
