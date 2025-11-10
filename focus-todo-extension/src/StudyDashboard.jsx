import React, { useEffect, useState } from "react";

export default function StudyDashboard() {
  const [todos, setTodos] = useState([]);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [sprite, setSprite] = useState(chrome.runtime.getURL("images/study_mode/sprite_study.gif"));
  const [progressData, setProgressData] = useState([]);

  useEffect(() => {
    // Load todos on mount
    chrome.storage.local.get(["todos"], (result) => {
      const loadedTodos = result.todos || [];
      setTodos(loadedTodos);
      calculateProgress(loadedTodos);
    });

    // Listen for updates from background script
    const handleMessage = (msg) => {
      if (msg.action === "updateTodos") {
        setTodos(msg.todos);
        calculateProgress(msg.todos);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const calculateProgress = (todos) => {
    const categories = ["Eating", "Exercising", "Focus", "Sleeping"];

    const newProgress = categories.map((category) => {
      const categoryTodos = todos.filter((t) => t.category === category);
      const done = categoryTodos.filter((t) => t.state === "done").length;
      const total = categoryTodos.length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;
      return { category, progress };
    });

    setProgressData(newProgress);

    const allDone = newProgress.every((p) => p.progress >= 100);
    setSprite(
      chrome.runtime.getURL(
        allDone
          ? "images/study_mode/happy.gif"
          : "images/study_mode/sprite_study.gif"
      )
    );
  };

  return (
    <div className="p-4 flex flex-col items-center text-center space-y-4">
      {/* Sprite Display */}
      <div className="flex flex-col items-center">
        <img
          src={sprite}
          alt="Pomo Sprite"
          className="w-40 h-40 rounded-2xl shadow-md"
        />
        <p className="mt-2 text-lg font-medium">
          {currentCategory
            ? `Currently working on ${currentCategory}`
            : "Idle — no active task"}
        </p>
      </div>

      {/* Progress Overview */}
      <div className="w-full max-w-md space-y-3">
        {progressData.map((p) => (
          <div key={p.category} className="text-left">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-gray-800">{p.category}</span>
              <span className="text-sm text-gray-600">{p.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="progress-fill h-3 rounded-full transition-all duration-500"
                style={{
                  width: `${p.progress}%`,
                  background: {
                    Eating: "linear-gradient(90deg, #f97316, #fb923c)",
                    Exercising: "linear-gradient(90deg, #10b981, #22c55e)",
                    Focus: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                    Sleeping: "linear-gradient(90deg, #8b5cf6, #a78bfa)",
                  }[p.category],
                }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
