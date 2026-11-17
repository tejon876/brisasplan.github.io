import { CONFIG } from './config.js';

export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split('T')[0];
}

export function createCleanState() {
  return {
    habits: [],
    tasks: [],
    agenda: [],
    mailAccounts: [],
    messages: [],
    backupIntervalDays: 7,
    lastBackupAt: null,
    selectedWidgets: {
      tasksAgenda: true,
      mail: true,
      habits: true
    },
    notificationsEnabled: false,
    tutorialSeen: false
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return createCleanState();
    const parsed = JSON.parse(raw);
    return { ...createCleanState(), ...parsed };
  } catch {
    return createCleanState();
  }
}

export function saveState(state) {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(CONFIG.sessionKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(CONFIG.sessionKey, JSON.stringify(session));
}

export function clearAllLocalData() {
  localStorage.removeItem(CONFIG.storageKey);
  localStorage.removeItem(CONFIG.sessionKey);
}

export function exportUserJSON(state, session) {
  const payload = {
    app: CONFIG.appName,
    exportedAt: new Date().toISOString(),
    user: session?.email || 'local',
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `BrisaPlan_Respaldo_${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  state.lastBackupAt = new Date().toISOString();
  saveState(state);
}
