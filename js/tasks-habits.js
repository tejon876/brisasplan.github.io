import { todayISO } from './storage.js';

export function isHabitDoneToday(habit) {
  return habit.lastCompletedDate === todayISO();
}

export function addHabit(state, name, category = 'General') {
  const clean = name.trim();
  if (!clean) return;
  state.habits.unshift({
    id: `h-${Date.now()}`,
    name: clean,
    category,
    streak: 0,
    lastCompletedDate: null,
    history: []
  });
}

export function toggleHabit(state, id) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return;
  const today = todayISO();
  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);
  const yesterday = new Date(yDate - yDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];

  if (habit.lastCompletedDate === today) {
    habit.history = habit.history.filter((d) => d !== today);
    habit.lastCompletedDate = habit.history.slice(-1)[0] || null;
    habit.streak = Math.max(0, (habit.streak || 1) - 1);
  } else {
    habit.streak = habit.lastCompletedDate === yesterday ? (habit.streak || 0) + 1 : 1;
    habit.lastCompletedDate = today;
    if (!habit.history.includes(today)) habit.history.push(today);
  }
}

export function removeHabit(state, id) {
  state.habits = state.habits.filter((h) => h.id !== id);
}

export function addTask(state, title, priority = 'media', color = '#4A93C6') {
  const clean = title.trim();
  if (!clean) return;
  state.tasks.unshift({
    id: `t-${Date.now()}`,
    title: clean,
    priority,
    color,
    done: false
  });
}

export function updateTaskColor(state, id, color) {
  const task = state.tasks.find((t) => t.id === id);
  if (task) task.color = color;
}

export function toggleTask(state, id) {
  const task = state.tasks.find((t) => t.id === id);
  if (task) task.done = !task.done;
}

export function removeTask(state, id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
}
