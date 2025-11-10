import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';

function App() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('Focus');
  const [focusData, setFocusData] = useState({ attention: 0, source: 'Simulated' });
  const [spriteBase, setSpriteBase] = useState('');
  const [shakingTodoId, setShakingTodoId] = useState(null);
  const [showSnackbar, setShowSnackbar] = useState(false);

  const categories = ['Eating', 'Exercising', 'Focus', 'Sleeping'];

  const categorySprites = {
    'Eating': chrome.runtime.getURL('images/eating/eating idle.gif'),
    'Exercising': chrome.runtime.getURL('images/study_mode/sprite_study.gif'),
    'Focus': chrome.runtime.getURL('images/study_mode/sprite_study.gif'),
    'Sleeping': chrome.runtime.getURL('images/sleeping/sleeping idle.gif'),
  };

  // Load sprites on mount
  useEffect(() => {
    setSpriteBase(chrome.runtime.getURL('images/idle.gif'));
  }, []);

  // Update sprite based on current doing task's category
  useEffect(() => {
    const doingTask = todos.find(t => t.state === 'doing');
    if (doingTask && doingTask.category) {
      setSpriteBase(categorySprites[doingTask.category]);
    } else {
      setSpriteBase(chrome.runtime.getURL('images/idle.gif'));
    }
  }, [todos]);


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
      category: selectedCategory,
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

    // Check if trying to set to "doing" when another task is already "doing"
    const currentDoingTodo = todos.find(t => t.state === 'doing');
    if (newState === 'doing' && currentDoingTodo && currentDoingTodo.id !== id) {
      // Shake the currently doing task
      setShakingTodoId(currentDoingTodo.id);
      setTimeout(() => setShakingTodoId(null), 500);
      // Show snackbar
      setShowSnackbar(true);
      setTimeout(() => setShowSnackbar(false), 2500);
      return; // Don't allow multiple "doing" tasks
    }

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
  const getCategoryEmoji = (category) => ({
    'Eating': '🍽️',
    'Exercising': '💪',
    'Focus': '🎯',
    'Sleeping': '😴'
  }[category] || '🎯');

  return (
    <div className="container">
        <div className="sprite-wrapper">
          <div className="sprite-container">
            <img src={spriteBase} alt="Sprite" className="sprite" />
          </div>
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
        <select
          className="category-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {getCategoryEmoji(cat)} {cat}
            </option>
          ))}
        </select>
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
        {['all', 'todo', 'done'].map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'todo' ? 'To-Do' : 'Done'}
          </button>
        ))}
      </div>

      <div className="todos-container">
        {filteredTodos.length === 0 ? (
          <div className="empty-state">
            {filter === 'all' && 'No todos yet. Add one to get started!'}
            {filter === 'todo' && 'No pending todos'}
            {filter === 'doing' && 'No tasks in progress'}
            {filter === 'done' && 'No completed todos'}
          </div>
        ) : (
          filteredTodos.map(todo => (
            <div key={todo.id} className={`todo-item ${todo.state} ${shakingTodoId === todo.id ? 'shake' : ''}`}>
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
              <div className="todo-content">
                <div className="todo-text">{todo.text}</div>
                {todo.category && (
                  <span className={`todo-category category-${todo.category.toLowerCase()}`}>
                    {getCategoryEmoji(todo.category)} {todo.category}
                  </span>
                )}
              </div>
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
      {showSnackbar && (
        <div className="snackbar">
          Finish your task first
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
