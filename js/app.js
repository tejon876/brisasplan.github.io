import { CONFIG } from './config.js';
import {
  todayISO,
  loadState,
  saveState,
  loadSession,
  saveSession,
  clearAllLocalData,
  exportUserJSON
} from './storage.js';
import {
  isHabitDoneToday,
  addHabit,
  toggleHabit,
  removeHabit,
  addTask,
  updateTaskColor,
  toggleTask,
  removeTask
} from './tasks-habits.js';
import {
  addAgendaItem,
  shiftAgendaTime,
  moveAgendaTomorrow,
  removeAgendaItem
} from './agenda.js';
import {
  connectMailAccount,
  addMessage,
  cleanAllSpam,
  toggleMessageRead,
  removeMessage
} from './mail-classroom.js';
import { ARCO_INFO, TUTORIAL_STEPS } from './legal.js';

let state = loadState();
let session = loadSession();
let selectedTaskColor = CONFIG.taskPalette[0];
let activePomoTaskId = null;
let pomoSeconds = CONFIG.defaultPomodoroSec;
let pomoTimer = null;
let tutorialIndex = 0;
let pendingLoginEmail = '';
let generatedCode = '';

const $ = (s) => document.querySelector(s);

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function esc(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* Tema Oscuro */
function applyTheme(dark) {
  document.body.classList.toggle('dark-mode', dark);
  localStorage.setItem(CONFIG.themeKey, dark ? 'dark' : 'light');
  document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
    btn.textContent = dark ? 'Modo claro' : 'Modo oscuro';
  });
}

/* Verificación real de dominio de correo (MX via DNS-over-HTTPS) */
async function verifyEmailDomainExists(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || !domain.includes('.')) return false;
  const commonTypos = { 'gmal.com': 'gmail.com', 'hotmal.com': 'hotmail.com', 'outlok.com': 'outlook.com' };
  if (commonTypos[domain]) {
    throw new Error(`¿Quisiste decir @${commonTypos[domain]}?`);
  }
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    const data = await res.json();
    return Array.isArray(data.Answer) && data.Answer.length > 0;
  } catch {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }
}

/* Login Gate */
function updateAuthView() {
  if (session && session.email) {
    $('#login-gate').style.display = 'none';
    $('#app-shell').style.display = 'block';
    renderAll();
    if (!state.tutorialSeen) {
      openTutorial();
    }
  } else {
    $('#login-gate').style.display = 'flex';
    $('#app-shell').style.display = 'none';
  }
}

/* Color Swatches */
function renderColorSwatches() {
  const container = $('#task-color-swatches');
  if (!container) return;
  container.innerHTML =
    CONFIG.taskPalette
      .map(
        (hex) =>
          `<button type="button" class="swatch-btn ${selectedTaskColor === hex ? 'selected' : ''}" style="background:${hex}" data-pick-color="${hex}" aria-label="Color ${hex}"></button>`
      )
      .join('') +
    `<input type="color" id="custom-task-color" class="custom-color-input" value="${selectedTaskColor}" title="Elegir color personalizado" />`;
}

/* Renders */
function renderStats() {
  const totalHabits = state.habits.length;
  const doneHabits = state.habits.filter(isHabitDoneToday).length;
  const bestStreak = state.habits.reduce((m, h) => Math.max(m, h.streak || 0), 0);
  const pendingTasks = state.tasks.filter((t) => !t.done).length;

  $('#stat-habits').textContent = `${doneHabits} / ${totalHabits}`;
  $('#stat-streak').textContent = `${bestStreak} días`;
  $('#stat-rate').textContent = totalHabits ? `${Math.round((doneHabits / totalHabits) * 100)}%` : '0%';
  $('#stat-pending').textContent = `${pendingTasks}`;
}

function renderHoy() {
  // Hábitos en Hoy
  const hoyHabits = $('#hoy-habits-list');
  hoyHabits.innerHTML = state.habits.length
    ? state.habits
        .map((h) => {
          const done = isHabitDoneToday(h);
          return `
            <div class="item-row ${done ? 'item-done' : ''}">
              <div style="display:flex;align-items:center;gap:10px;">
                <button class="check-circle ${done ? 'checked' : ''}" data-act="toggle-habit" data-id="${h.id}">✓</button>
                <div>
                  <div class="item-title">${esc(h.name)}</div>
                  <div class="item-sub">${esc(h.category)}</div>
                </div>
              </div>
              <span class="streak-pill">🔥 ${h.streak || 0}d</span>
            </div>`;
        })
        .join('')
    : '<div class="empty-state">Aún no tienes hábitos. Agrega el primero en Tareas y Hábitos.</div>';

  // Pendientes rápidos en Hoy
  const pending = state.tasks.filter((t) => !t.done);
  $('#hoy-tasks-list').innerHTML = pending.length
    ? pending
        .slice(0, 5)
        .map(
          (t) => `
          <div class="item-row task-color-bar" style="border-left-color:${esc(t.color || '#4A93C6')}">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" data-act="toggle-task" data-id="${t.id}" />
              <span class="item-title">${esc(t.title)}</span>
            </label>
            <span class="item-sub">${esc(t.priority)}</span>
          </div>`
        )
        .join('')
    : '<div class="empty-state">Sin pendientes activos. Usa "+ Tarea rápida" para añadir uno.</div>';

  // Siguiente bloque hoy
  const todayBlocks = state.agenda.filter((a) => a.date === todayISO());
  $('#hoy-agenda-list').innerHTML = todayBlocks.length
    ? todayBlocks
        .slice(0, 4)
        .map(
          (a) => `
          <div class="item-row task-color-bar" style="border-left-color:${esc(a.color || '#4A93C6')}">
            <div>
              <div class="item-title">${esc(a.title)}</div>
              <div class="item-sub">${esc(a.time)}</div>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty-state">No hay bloques programados para hoy.</div>';
}

function renderAgenda() {
  const list = $('#agenda-full-list');
  list.innerHTML = state.agenda.length
    ? state.agenda
        .map(
          (a) => `
          <div class="item-row task-color-bar" style="border-left-color:${esc(a.color || '#4A93C6')};flex-direction:column;align-items:stretch;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div>
                <div class="item-title">${esc(a.time)} · ${esc(a.title)}</div>
                <div class="item-sub">${esc(a.date)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <button class="btn btn-soft btn-xs" data-act="toggle-adjust" data-id="${a.id}">Ajustar</button>
                <button class="btn-icon-del" data-act="del-agenda" data-id="${a.id}">✕</button>
              </div>
            </div>
            <div id="adj-${a.id}" class="adjust-drawer">
              <button class="btn btn-outline btn-xs" data-act="shift-agenda" data-id="${a.id}" data-min="-30">-30m</button>
              <button class="btn btn-outline btn-xs" data-act="shift-agenda" data-id="${a.id}" data-min="30">+30m</button>
              <button class="btn btn-outline btn-xs" data-act="shift-agenda" data-id="${a.id}" data-min="60">+1h</button>
              <button class="btn btn-peach btn-xs" data-act="tomorrow-agenda" data-id="${a.id}">Pasar a mañana</button>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty-state">Tu agenda está vacía. Programa tu primer bloque arriba.</div>';
}

function renderTasksAndHabits() {
  // Tareas
  const tList = $('#tasks-full-list');
  tList.innerHTML = state.tasks.length
    ? state.tasks
        .map(
          (t) => `
          <div class="item-row task-color-bar ${t.done ? 'item-done' : ''}" style="border-left-color:${esc(t.color || '#4A93C6')}">
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="checkbox" ${t.done ? 'checked' : ''} data-act="toggle-task" data-id="${t.id}" />
              <div>
                <div class="item-title">${esc(t.title)}</div>
                <div class="item-sub">Prioridad ${esc(t.priority)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <input type="color" value="${esc(t.color || '#4A93C6')}" data-recolor-task="${t.id}" title="Cambiar color" style="width:22px;height:22px;border:none;background:none;cursor:pointer;" />
              <button class="btn btn-soft btn-xs" data-act="focus-task" data-id="${t.id}">Enfocar</button>
              <button class="btn-icon-del" data-act="del-task" data-id="${t.id}">✕</button>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty-state">Sin tareas registradas. Crea una arriba y asígnale un color.</div>';

  // Hábitos
  const hList = $('#habits-full-list');
  hList.innerHTML = state.habits.length
    ? state.habits
        .map((h) => {
          const done = isHabitDoneToday(h);
          return `
            <div class="item-row ${done ? 'item-done' : ''}">
              <div style="display:flex;align-items:center;gap:10px;">
                <button class="check-circle ${done ? 'checked' : ''}" data-act="toggle-habit" data-id="${h.id}">✓</button>
                <div>
                  <div class="item-title">${esc(h.name)}</div>
                  <div class="item-sub">${esc(h.category)} · ${h.history?.length || 0} días completados</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="streak-pill">🔥 ${h.streak || 0}d</span>
                <button class="btn-icon-del" data-act="del-habit" data-id="${h.id}">✕</button>
              </div>
            </div>`;
        })
        .join('')
    : '<div class="empty-state">No hay hábitos creados todavía.</div>';

  const focusedTask = state.tasks.find((t) => t.id === activePomoTaskId);
  $('#pomo-task-label').textContent = focusedTask ? `Enfocando: ${focusedTask.title}` : 'Sesión libre de enfoque';
}

function renderMail() {
  const filter = $('#mail-filter-account')?.value || 'all';
  const select = $('#mail-filter-account');
  if (select) {
    const current = select.value;
    select.innerHTML =
      '<option value="all">Todas las cuentas</option>' +
      state.mailAccounts.map((a) => `<option value="${esc(a.email)}">${esc(a.email)} (${esc(a.provider)})</option>`).join('');
    select.value = state.mailAccounts.some((a) => a.email === current) ? current : 'all';
  }

  const accContainer = $('#connected-accounts-list');
  accContainer.innerHTML = state.mailAccounts.length
    ? state.mailAccounts
        .map((a) => `<span class="btn btn-soft btn-xs">${esc(a.provider)}: ${esc(a.email)}</span>`)
        .join(' ')
    : '<span class="item-sub">Sin cuentas vinculadas aún.</span>';

  const filtered = state.messages.filter((m) => (filter === 'all' ? true : m.account === filter));
  const list = $('#mail-messages-list');
  list.innerHTML = filtered.length
    ? filtered
        .map(
          (m) => `
          <div class="item-row" style="${m.isSpam ? 'border-color:#F43F5E;' : ''}">
            <div>
              <div class="item-title">${m.isSpam ? '[Spam] ' : ''}${esc(m.subject)}</div>
              <div class="item-sub">${esc(m.sender)} · ${esc(m.account)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="btn btn-outline btn-xs" data-act="read-mail" data-id="${m.id}">${m.read ? 'Leído' : 'Marcar leído'}</button>
              <button class="btn-icon-del" data-act="del-mail" data-id="${m.id}">✕</button>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty-state">Bandeja vacía. Vincula un correo o registra un mensaje importante.</div>';
}

function renderMiEspacio() {
  $('#backup-days-input').value = state.backupIntervalDays || 7;
  $('#notif-status-text').textContent = state.notificationsEnabled ? 'Activadas en este dispositivo' : 'Desactivadas';
  $('#w-chk-tasks').checked = !!state.selectedWidgets.tasksAgenda;
  $('#w-chk-mail').checked = !!state.selectedWidgets.mail;
  $('#w-chk-habits').checked = !!state.selectedWidgets.habits;
  $('#arco-legal-text').textContent = ARCO_INFO.description;
  $('#paypal-donate-btn').href = CONFIG.paypalUrl;
}

function renderAll() {
  saveState(state);
  renderColorSwatches();
  renderStats();
  renderHoy();
  renderAgenda();
  renderTasksAndHabits();
  renderMail();
  renderMiEspacio();
}

function updatePomodoroText() {
  const m = String(Math.floor(pomoSeconds / 60)).padStart(2, '0');
  const s = String(pomoSeconds % 60).padStart(2, '0');
  $('#pomo-clock').textContent = `${m}:${s}`;
}

function openTutorial() {
  tutorialIndex = 0;
  renderTutorialStep();
  $('#tutorial-modal').classList.add('open');
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  $('#tut-title').textContent = step.title;
  $('#tut-body').textContent = step.text;
  $('#tut-counter').textContent = `${tutorialIndex + 1} / ${TUTORIAL_STEPS.length}`;
  $('#tut-next').textContent = tutorialIndex === TUTORIAL_STEPS.length - 1 ? 'Finalizar' : 'Siguiente';
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn, .mobile-nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.view-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${tabName}`);
  });
}

function setupEvents() {
  // Tema claro/oscuro
  document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(!document.body.classList.contains('dark-mode'));
    });
  });

  // Paso 1 Login: verificar existencia del dominio y enviar código sin mostrarlo en pantalla
  $('#login-email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email-input').value.trim().toLowerCase();
    const btn = $('#btn-send-code');
    btn.disabled = true;
    btn.textContent = 'Verificando correo...';

    try {
      const exists = await verifyEmailDomainExists(email);
      if (!exists) {
        toast('El dominio del correo no existe o no recibe mensajes.');
        return;
      }
      pendingLoginEmail = email;
      generatedCode = String(Math.floor(100000 + Math.random() * 900000));
      $('#login-step-email').style.display = 'none';
      $('#login-step-code').style.display = 'block';
      $('#verify-target-email').textContent = email;

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('BrisaPlan — Código de verificación', {
          body: `Tu código de acceso enviado a ${email} es: ${generatedCode}`
        });
      }
      toast('Código enviado. Revisa la bandeja de entrada de tu correo.');
    } catch (err) {
      toast(err.message || 'No se pudo verificar el correo.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Continuar';
    }
  });

  $('#btn-resend-code').addEventListener('click', () => {
    if (!pendingLoginEmail) return;
    generatedCode = String(Math.floor(100000 + Math.random() * 900000));
    toast(`Nuevo código enviado a ${pendingLoginEmail}`);
  });

  $('#btn-back-email').addEventListener('click', () => {
    $('#login-step-code').style.display = 'none';
    $('#login-step-email').style.display = 'block';
  });

  $('#login-code-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('#login-code-input').value.trim();
    if (!/^\d{6}$/.test(code)) {
      toast('Ingresa el código de 6 dígitos enviado a tu correo.');
      return;
    }
    session = { email: pendingLoginEmail, loggedAt: new Date().toISOString() };
    saveSession(session);
    connectMailAccount(state, pendingLoginEmail, 'Principal');
    updateAuthView();
  });

  // Navegación
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Modal Tarea Rápida (desde Hoy, Agenda o botón flotante)
  document.querySelectorAll('[data-open-quick-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#quick-task-modal').classList.add('open');
      $('#quick-task-title').focus();
    });
  });

  $('#close-quick-task').addEventListener('click', () => {
    $('#quick-task-modal').classList.remove('open');
  });

  $('#quick-task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#quick-task-title').value;
    const priority = $('#quick-task-prio').value;
    const color = $('#quick-task-color').value;
    const alsoAgenda = $('#quick-task-agenda-check').checked;
    const time = $('#quick-task-time').value || '09:00';

    addTask(state, title, priority, color);
    if (alsoAgenda) {
      addAgendaItem(state, time, title, color, todayISO());
    }
    $('#quick-task-title').value = '';
    $('#quick-task-modal').classList.remove('open');
    renderAll();
    toast('Tarea agregada');
  });

  // Formulario Agenda
  $('#agenda-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addAgendaItem(
      state,
      $('#agenda-time').value,
      $('#agenda-title').value,
      $('#agenda-color').value,
      $('#agenda-date').value || todayISO()
    );
    $('#agenda-title').value = '';
    renderAll();
    toast('Bloque agregado a la agenda');
  });

  // Formulario Tareas
  $('#task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addTask(state, $('#task-title-input').value, $('#task-prio-input').value, selectedTaskColor);
    $('#task-title-input').value = '';
    renderAll();
    toast('Tarea guardada');
  });

  // Formulario Hábitos
  $('#habit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addHabit(state, $('#habit-title-input').value, $('#habit-cat-input').value);
    $('#habit-title-input').value = '';
    renderAll();
    toast('Hábito creado');
  });

  // Vincular correo con permiso
  $('#btn-connect-google-mail').addEventListener('click', async () => {
    const email = prompt('Escribe el correo de Google que deseas vincular:');
    if (!email) return;
    const ok = await verifyEmailDomainExists(email.trim());
    if (!ok) {
      toast('Ese correo no parece válido.');
      return;
    }
    if ('Notification' in window && Notification.permission !== 'denied') {
      await Notification.requestPermission();
    }
    const approved = confirm(`¿Aprobar permiso de lectura y organización de bandeja para ${email.trim()}?`);
    if (!approved) return;
    connectMailAccount(state, email, 'Google');
    renderAll();
    toast('Cuenta vinculada con permiso aprobado');
  });

  $('#mail-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addMessage(state, {
      account: $('#mail-filter-account').value === 'all' ? state.mailAccounts[0]?.email : $('#mail-filter-account').value,
      sender: $('#mail-sender').value,
      subject: $('#mail-subject').value
    });
    $('#mail-sender').value = '';
    $('#mail-subject').value = '';
    renderAll();
    toast('Mensaje registrado en bandeja');
  });

  $('#mail-filter-account').addEventListener('change', renderMail);

  $('#btn-clean-spam').addEventListener('click', () => {
    const removed = cleanAllSpam(state);
    renderAll();
    toast(removed ? `Se eliminaron ${removed} correos spam` : 'No hay spam por limpiar');
  });

  // Delegación global de clics y colores
  document.body.addEventListener('click', (e) => {
    const swatch = e.target.closest('[data-pick-color]');
    if (swatch) {
      selectedTaskColor = swatch.dataset.pickColor;
      renderColorSwatches();
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;

    if (act === 'toggle-habit') {
      toggleHabit(state, id);
      renderAll();
    } else if (act === 'del-habit') {
      removeHabit(state, id);
      renderAll();
    } else if (act === 'toggle-task') {
      toggleTask(state, id);
      renderAll();
    } else if (act === 'del-task') {
      removeTask(state, id);
      renderAll();
    } else if (act === 'focus-task') {
      activePomoTaskId = id;
      renderTasksAndHabits();
      toast('Tarea vinculada al Pomodoro');
    } else if (act === 'toggle-adjust') {
      document.getElementById(`adj-${id}`)?.classList.toggle('open');
    } else if (act === 'shift-agenda') {
      shiftAgendaTime(state, id, Number(btn.dataset.min));
      renderAll();
      toast('Horario ajustado');
    } else if (act === 'tomorrow-agenda') {
      moveAgendaTomorrow(state, id);
      renderAll();
      toast('Bloque movido a mañana');
    } else if (act === 'del-agenda') {
      removeAgendaItem(state, id);
      renderAll();
    } else if (act === 'read-mail') {
      toggleMessageRead(state, id);
      renderAll();
    } else if (act === 'del-mail') {
      removeMessage(state, id);
      renderAll();
    }
  });

  document.body.addEventListener('input', (e) => {
    if (e.target.id === 'custom-task-color') {
      selectedTaskColor = e.target.value;
      renderColorSwatches();
    }
    const recolorId = e.target.dataset.recolorTask;
    if (recolorId) {
      updateTaskColor(state, recolorId, e.target.value);
      renderAll();
    }
  });

  // Pomodoro
  $('#pomo-start').addEventListener('click', () => {
    if (pomoTimer) return;
    pomoTimer = setInterval(() => {
      if (pomoSeconds > 0) {
        pomoSeconds -= 1;
        updatePomodoroText();
      } else {
        clearInterval(pomoTimer);
        pomoTimer = null;
        toast('Sesión Pomodoro completada');
      }
    }, 1000);
  });

  $('#pomo-pause').addEventListener('click', () => {
    clearInterval(pomoTimer);
    pomoTimer = null;
  });

  $('#pomo-reset').addEventListener('click', () => {
    clearInterval(pomoTimer);
    pomoTimer = null;
    pomoSeconds = CONFIG.defaultPomodoroSec;
    updatePomodoroText();
  });

  // Mi Espacio: respaldo, notificaciones, widgets, tutorial y ARCO
  $('#backup-days-input').addEventListener('change', (e) => {
    const val = Math.max(7, Number(e.target.value) || 7);
    e.target.value = val;
    state.backupIntervalDays = val;
    saveState(state);
    toast(`Respaldo programado cada ${val} días`);
  });

  $('#btn-export-arco').addEventListener('click', () => {
    exportUserJSON(state, session);
    toast('Respaldo JSON descargado');
  });

  $('#btn-enable-notifs').addEventListener('click', async () => {
    if (!('Notification' in window)) {
      toast('Este navegador no soporta notificaciones.');
      return;
    }
    const perm = await Notification.requestPermission();
    state.notificationsEnabled = perm === 'granted';
    saveState(state);
    renderMiEspacio();
    if (state.notificationsEnabled) {
      new Notification('BrisaPlan', { body: 'Notificaciones activadas correctamente en tu dispositivo.' });
    }
  });

  ['w-chk-tasks', 'w-chk-mail', 'w-chk-habits'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      state.selectedWidgets = {
        tasksAgenda: $('#w-chk-tasks').checked,
        mail: $('#w-chk-mail').checked,
        habits: $('#w-chk-habits').checked
      };
      saveState(state);
      toast('Preferencia de widgets actualizada');
    });
  });

  $('#btn-open-tutorial').addEventListener('click', openTutorial);

  $('#tut-next').addEventListener('click', () => {
    if (tutorialIndex < TUTORIAL_STEPS.length - 1) {
      tutorialIndex += 1;
      renderTutorialStep();
    } else {
      state.tutorialSeen = true;
      saveState(state);
      $('#tutorial-modal').classList.remove('open');
    }
  });

  $('#btn-delete-arco').addEventListener('click', () => {
    if (!confirm('¿Eliminar permanentemente todos tus datos locales y cerrar sesión?')) return;
    clearAllLocalData();
    state = loadState();
    session = null;
    updateAuthView();
    toast('Datos eliminados por completo');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem(CONFIG.themeKey) === 'dark');
  const agendaDate = $('#agenda-date');
  if (agendaDate) agendaDate.value = todayISO();
  updatePomodoroText();
  setupEvents();
  updateAuthView();
});
