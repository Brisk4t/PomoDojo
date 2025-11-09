import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';

function App() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('all');
  const [focusData, setFocusData] = useState({ attention: 0, source: 'Simulated' });

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

  useEffect(() => {
    // Load latest focus data on mount
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

  const deleteTodo = (id) => {
    setTodos(todos.filter(t => t.id !== id));
  };

  const filteredTodos = todos.filter(t => filter === 'all' || t.state === filter);
  const doingTodo = todos.find(t => t.state === 'doing');

  const getStateEmoji = (state) => ({ todo: '⭕', doing: '🔵', done: '✅' }[state] || '⭕');

  return (
    <div className="container">
      <div className="header">
        <h1>Focus Todo</h1>
        <img src="sprite_1.gif" alt="Sprite" className="sprite" />
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
          <div className="label">Data Source</div>
          <div className="value">{focusData.source}</div>
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
