import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import StudyDashboard from "./StudyDashboard";
import './popup.css';
import './style.css';

function App() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('Focus');
  const [focusData, setFocusData] = useState({ attention: 0, source: 'Simulated' });
  const [spriteBase, setSpriteBase] = useState('');
  const [shakingTodoId, setShakingTodoId] = useState(null);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

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

  // Pomodoro constants (in seconds)
  const POMODORO_WORK_TIME = 25 * 60; // 25 minutes
  const POMODORO_BREAK_TIME = 5 * 60; // 5 minutes

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
      pomodoroTime: POMODORO_WORK_TIME,
      pomodoroRunning: false,
      pomodoroType: 'work',
      pomodoroCount: 0,
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
      // Auto-start pomodoro timer when task is set to "doing"
      setTodos(todos.map(t => t.id === id ? { ...t, state: newState, pomodoroRunning: true } : t));
      return;
    } else if (newState !== 'doing' && todo.state === 'doing') {
      chrome.runtime.sendMessage({ action: 'stopTracking', todoId: id });
      // Stop pomodoro timer when task is no longer "doing"
      setTodos(todos.map(t => t.id === id ? { ...t, state: newState, pomodoroRunning: false } : t));
      return;
    }

    setTodos(todos.map(t => t.id === id ? { ...t, state: newState } : t));
  };

  // Delete todo
  const deleteTodo = (id) => {
    setTodos(todos.filter(t => t.id !== id));
  };

  // Skip break - switch back to work immediately
  const skipBreak = (id) => {
    setTodos(todos.map(t => {
      if (t.id === id) {
        return {
          ...t,
          pomodoroType: 'work',
          pomodoroTime: POMODORO_WORK_TIME,
          pomodoroRunning: true,
        };
      }
      return t;
    }));
  };

  // Timer countdown effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
      setTodos(prevTodos => prevTodos.map(todo => {
        if (todo.pomodoroRunning && todo.pomodoroTime > 0) {
          const newTime = todo.pomodoroTime - 1;
          if (newTime === 0) {
            // Timer finished - auto switch to break or work and keep running
            const newType = todo.pomodoroType === 'work' ? 'break' : 'work';
            return {
              ...todo,
              pomodoroTime: newType === 'work' ? POMODORO_WORK_TIME : POMODORO_BREAK_TIME,
              pomodoroType: newType,
              pomodoroRunning: true, // Keep timer running
              pomodoroCount: newType === 'work' ? todo.pomodoroCount : todo.pomodoroCount + 1,
            };
          }
          return { ...todo, pomodoroTime: newTime };
        }
        return todo;
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [POMODORO_WORK_TIME, POMODORO_BREAK_TIME]);

  // Format time for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
    <h1 class="pixel-header">PomoDojo</h1>
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
                {todo.state === 'doing' && (
                  <div className="pomodoro-timer">
                    <div className={`pomodoro-display ${todo.pomodoroType}`}>
                      <span className="pomodoro-time">{formatTime(todo.pomodoroTime || 0)}</span>
                      <span className="pomodoro-type">{todo.pomodoroType === 'work' ? '🎯 Focus' : '☕ Break'}</span>
                    </div>
                    {focusData.blinks && (
                      <div className="blink-metrics">
                        <div className="blink-metric">
                          <span className="blink-label">👁️ Blinks:</span>
                          <span className="blink-value">{focusData.blinks.rate}/min</span>
                        </div>
                        <div className="blink-metric">
                          <span className="blink-label">EAR:</span>
                          <span className="blink-value">{focusData.blinks.ear.toFixed(2)}</span>
                        </div>
                        {!focusData.blinks.face_detected && (
                          <div className="blink-warning">⚠️ No face detected</div>
                        )}
                      </div>
                    )}
                    {todo.pomodoroType === 'break' && (
                      <div className="pomodoro-controls">
                        <button
                          className="pomodoro-btn skip-btn"
                          onClick={() => skipBreak(todo.id)}
                          title="Skip Break"
                        >
                          ⏭ Skip Break
                        </button>
                      </div>
                    )}
                    <div className="pomodoro-count">
                      Pomodoros: {todo.pomodoroCount || 0}
                    </div>
                  </div>
                )}
              </div>
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
