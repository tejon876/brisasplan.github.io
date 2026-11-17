export function connectMailAccount(state, email, provider = 'Google') {
  const clean = email.trim().toLowerCase();
  if (!clean || state.mailAccounts.some((a) => a.email === clean)) return false;
  state.mailAccounts.push({
    id: `acc-${Date.now()}`,
    email: clean,
    provider,
    connectedAt: new Date().toISOString()
  });
  return true;
}

export function addMessage(state, { account, sender, subject, isSpam = false, important = false }) {
  if (!subject.trim()) return;
  const spamKeywords = ['premio', 'ganaste', 'oferta urgente', 'casino', 'lotería', 'haz clic aquí'];
  const autoSpam = isSpam || spamKeywords.some((kw) => subject.toLowerCase().includes(kw));

  state.messages.unshift({
    id: `m-${Date.now()}`,
    account: account || (state.mailAccounts[0]?.email ?? 'principal'),
    sender: sender.trim() || 'Remitente',
    subject: subject.trim(),
    isSpam: autoSpam,
    important,
    read: false
  });
}

export function cleanAllSpam(state) {
  const before = state.messages.length;
  state.messages = state.messages.filter((m) => !m.isSpam);
  return before - state.messages.length;
}

export function toggleMessageRead(state, id) {
  const msg = state.messages.find((m) => m.id === id);
  if (msg) msg.read = !msg.read;
}

export function removeMessage(state, id) {
  state.messages = state.messages.filter((m) => m.id !== id);
}
