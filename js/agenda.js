import { todayISO } from './storage.js';

export function addAgendaItem(state, time, title, color = '#4A93C6', date = todayISO()) {
  const clean = title.trim();
  if (!time || !clean) return;
  state.agenda.push({
    id: `a-${Date.now()}`,
    date,
    time,
    title: clean,
    color
  });
  sortAgenda(state);
}

export function shiftAgendaTime(state, id, deltaMinutes) {
  const item = state.agenda.find((a) => a.id === id);
  if (!item) return;
  const [hh, mm] = item.time.split(':').map(Number);
  let total = hh * 60 + mm + deltaMinutes;
  if (total < 0) total += 1440;
  total = total % 1440;
  const newH = String(Math.floor(total / 60)).padStart(2, '0');
  const newM = String(total % 60).padStart(2, '0');
  item.time = `${newH}:${newM}`;
  sortAgenda(state);
}

export function moveAgendaTomorrow(state, id) {
  const item = state.agenda.find((a) => a.id === id);
  if (!item) return;
  const base = new Date(item.date + 'T12:00:00');
  base.setDate(base.getDate() + 1);
  item.date = base.toISOString().split('T')[0];
  sortAgenda(state);
}

export function removeAgendaItem(state, id) {
  state.agenda = state.agenda.filter((a) => a.id !== id);
}

function sortAgenda(state) {
  state.agenda.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}
