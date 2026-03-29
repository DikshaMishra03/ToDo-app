// ─────────────── FIREBASE SETUP ───────────────
// ─────────────── FIREBASE SETUP ───────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD7NAR2Y0cJ-4qXH0_kvg0Ge5RigvrK0Og",
  authDomain: "todo-84da2.firebaseapp.com",
  projectId: "todo-84da2",
  storageBucket: "todo-84da2.firebasestorage.app",
  messagingSenderId: "330453368517",
  appId: "1:330453368517:web:f3d98166236558a3e27aac"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// ─────────────── STATE ───────────────
let currentUser = null;
let tasks = [];
let currentFilter = 'all';
let currentCat = 'all';
let isLight = false;

// ─────────────── TOAST ───────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// Make showToast globally accessible for inline HTML onclick handlers
window.showToast = showToast;

// ─────────────── AUTH TABS ───────────────
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
});

// ─────────────── PASSWORD TOGGLE ───────────────
function setupPwToggle(toggleId, inputId) {
  document.getElementById(toggleId).addEventListener('click', () => {
    const inp = document.getElementById(inputId);
    inp.type = inp.type === 'password' ? 'text' : 'password';
    document.getElementById(toggleId).textContent = inp.type === 'password' ? '👁' : '🙈';
  });
}
setupPwToggle('login-pw-toggle', 'login-pw');
setupPwToggle('signup-pw-toggle', 'signup-pw');

// ─────────────── PASSWORD STRENGTH ───────────────
document.getElementById('signup-pw').addEventListener('input', function() {
  const v = this.value;
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const cls = score <= 1 ? 'weak' : score === 2 ? 'medium' : 'strong';
  for (let i = 1; i <= 4; i++) {
    const bar = document.getElementById('pwb' + i);
    bar.className = 'pw-bar';
    if (i <= score) bar.classList.add(cls);
  }
});

// ─────────────── VALIDATION HELPERS ───────────────
function validateEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function showErr(id, show) {
  const el = document.getElementById(id);
  el && (show ? el.classList.add('show') : el.classList.remove('show'));
}
function markInput(id, error) {
  const el = document.getElementById(id);
  el && (error ? el.classList.add('error') : el.classList.remove('error'));
}

// ─────────────── LOGIN ───────────────
document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('login-pw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-pw').value;
  let ok = true;

  // Clear previous errors
  showErr('login-pw-err', false);
  markInput('login-pw', false);

  if (!validateEmail(email)) { markInput('login-email', true); showErr('login-email-err', true); ok = false; }
  else { markInput('login-email', false); showErr('login-email-err', false); }

  if (pw.length < 1) { markInput('login-pw', true); showErr('login-pw-err', true); ok = false; }
  else { markInput('login-pw', false); }

  if (!ok) return;

  const btn = document.getElementById('login-btn');
  btn.classList.add('loading');
  btn.innerHTML = '<span>Signing in…</span>';

  try {
    await signInWithEmailAndPassword(auth, email, pw);
    // onAuthStateChanged handles the rest
  } catch (err) {
    btn.classList.remove('loading');
    btn.innerHTML = '<span>Sign In</span> <span>→</span>';
    // Show "Email or password is incorrect" for any auth failure
    markInput('login-email', true);
    markInput('login-pw', true);
    showErr('login-pw-err', true);
  }
}

// ─────────────── SIGNUP ───────────────
document.getElementById('signup-btn').addEventListener('click', doSignup);

async function doSignup() {
  const fname = document.getElementById('signup-fname').value.trim();
  const lname = document.getElementById('signup-lname').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw = document.getElementById('signup-pw').value;
  const pw2 = document.getElementById('signup-pw2').value;
  let ok = true;

  // Clear previous errors
  showErr('signup-exists-err', false);

  if (!validateEmail(email)) { markInput('signup-email', true); showErr('signup-email-err', true); ok = false; }
  else { markInput('signup-email', false); showErr('signup-email-err', false); }

  if (pw.length < 8) { markInput('signup-pw', true); showErr('signup-pw-err', true); ok = false; }
  else { markInput('signup-pw', false); showErr('signup-pw-err', false); }

  if (pw !== pw2) { markInput('signup-pw2', true); showErr('signup-pw2-err', true); ok = false; }
  else { markInput('signup-pw2', false); showErr('signup-pw2-err', false); }

  if (!ok) return;

  const btn = document.getElementById('signup-btn');
  btn.classList.add('loading');
  btn.innerHTML = '<span>Creating account…</span>';

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, pw);
    // Store the display name in localStorage (not Firestore per requirements)
    const name = [fname, lname].filter(Boolean).join(' ') || email.split('@')[0];
    localStorage.setItem('taskflow_user_' + credential.user.uid, JSON.stringify({ name, email }));
    // onAuthStateChanged handles redirect
  } catch (err) {
    btn.classList.remove('loading');
    btn.innerHTML = '<span>Create Account</span> <span>🚀</span>';
    if (err.code === 'auth/email-already-in-use') {
      markInput('signup-email', true);
      showErr('signup-exists-err', true);
    } else {
      showToast('Sign up failed. Please try again.', 'error');
    }
  }
}

// ─────────────── FIREBASE AUTH STATE LISTENER ───────────────
// This is the single source of truth for auth state.
// Fires on page load (persisted session) + after every sign-in/sign-out.
onAuthStateChanged(auth, (firebaseUser) => {
  if (firebaseUser) {
    // Signed in — build user object and enter app
    const stored = localStorage.getItem('taskflow_user_' + firebaseUser.uid);
    const profile = stored ? JSON.parse(stored) : null;
    const name = profile?.name
      || firebaseUser.displayName
      || firebaseUser.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    enterApp({
      name,
      email: firebaseUser.email,
      initials: getInitials(name),
      uid: firebaseUser.uid
    });
  } else {
    // Signed out — show auth screen
    showAuthScreen();
  }
});

// ─────────────── LOGOUT ───────────────
async function logout() {
  closeDropdown();
  try {
    await signOut(auth);
    // onAuthStateChanged will call showAuthScreen()
  } catch (err) {
    showToast('Sign out failed. Try again.', 'error');
  }
}
window.logout = logout;

// ─────────────── SCREEN TRANSITIONS ───────────────
function showAuthScreen() {
  currentUser = null;
  const authEl = document.getElementById('auth-screen');
  const appEl = document.getElementById('app-screen');
  authEl.style.display = '';
  appEl.classList.add('hidden');
  setTimeout(() => authEl.classList.remove('hidden'), 50);
  // Reset buttons
  document.getElementById('login-btn').classList.remove('loading');
  document.getElementById('login-btn').innerHTML = '<span>Sign In</span> <span>→</span>';
  document.getElementById('signup-btn').classList.remove('loading');
  document.getElementById('signup-btn').innerHTML = '<span>Create Account</span> <span>🚀</span>';
  document.getElementById('login-email').value = '';
  document.getElementById('login-pw').value = '';
  showToast('You\'ve been signed out.', 'info');
}

// ─────────────── ENTER APP ───────────────
function getInitials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
}

function enterApp(user) {
  currentUser = user;

  // Update UI
  document.getElementById('user-avatar').textContent = user.initials;
  document.getElementById('dropdown-name').textContent = user.name;
  document.getElementById('dropdown-email').textContent = user.email;

  const firstName = user.name.split(' ')[0];
  document.getElementById('welcome-text').textContent = user.isNew
    ? `Welcome to TaskFlow, ${firstName}! 🎉`
    : `Welcome back, ${firstName}!`;

  // Load tasks (keyed by Firebase uid for proper per-user isolation)
  const storageKey = 'taskflow_tasks_' + (user.uid || user.email);
  tasks = JSON.parse(localStorage.getItem(storageKey) || 'null') || getDefaultTasks();
  save();

  // Pending count
  const pending = tasks.filter(t => !t.done).length;
  document.getElementById('welcome-sub').textContent =
    pending > 0 ? `You have ${pending} pending task${pending !== 1 ? 's' : ''} — let's crush it!`
                : "You're all caught up — great work! 🎯";

  // Transition
  const authEl = document.getElementById('auth-screen');
  const appEl = document.getElementById('app-screen');
  authEl.classList.add('hidden');
  appEl.classList.remove('hidden');
  setTimeout(() => { authEl.style.display = 'none'; }, 400);

  showToast(user.isNew ? `Account created! Welcome, ${firstName}!` : `Signed in as ${user.name}`, 'success');
  render();
}

// ─────────────── DROPDOWN ───────────────
function toggleDropdown() {
  document.getElementById('user-dropdown').classList.toggle('open');
}
function closeDropdown() {
  document.getElementById('user-dropdown').classList.remove('open');
}
window.toggleDropdown = toggleDropdown;
window.closeDropdown = closeDropdown;

document.addEventListener('click', e => {
  if (!e.target.closest('.user-menu')) closeDropdown();
});

// ─────────────── TASKS ───────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

function save() {
  if (currentUser) {
    const storageKey = 'taskflow_tasks_' + (currentUser.uid || currentUser.email);
    localStorage.setItem(storageKey, JSON.stringify(tasks));
  }
}

function getDefaultTasks() {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  return [
    { id: uid(), text: 'Review project proposal', priority: 'high', cat: 'Work', date: today, done: false },
    { id: uid(), text: 'Buy groceries', priority: 'medium', cat: 'Home', date: tomorrow, done: false },
    { id: uid(), text: 'Morning run — 5km', priority: 'low', cat: 'Personal', date: today, done: true },
  ];
}

function cardAccent(priority) {
  if (priority === 'high') return 'var(--high)';
  if (priority === 'low') return 'var(--low)';
  return 'var(--med)';
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return '📅 Today';
  if (diff === 1) return '📅 Tomorrow';
  if (diff === -1) return '⚠️ Yesterday';
  if (diff < -1) return `⚠️ ${Math.abs(diff)}d overdue`;
  return `📅 ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
function isOverdue(str) {
  if (!str) return false;
  const d = new Date(str + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return d < today;
}

function filteredTasks() {
  return tasks.filter(t => {
    const catOk = currentCat === 'all' || t.cat === currentCat;
    if (!catOk) return false;
    if (currentFilter === 'all') return true;
    if (currentFilter === 'pending') return !t.done;
    if (currentFilter === 'completed') return t.done;
    return t.priority === currentFilter;
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function render() {
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');
  const label = document.getElementById('section-label');
  const shown = filteredTasks();
  const names = { all:'All Tasks', pending:'Pending', completed:'Completed', high:'High Priority', medium:'Medium Priority', low:'Low Priority' };
  label.textContent = `${names[currentFilter] || 'Tasks'} · ${shown.length}`;
  list.innerHTML = '';
  if (shown.length === 0) {
    empty.classList.add('visible');
    empty.querySelector('.empty-icon').textContent = currentFilter === 'completed' ? '✅' : '🎯';
    empty.querySelector('.empty-title').textContent = currentFilter === 'completed' ? 'No completed tasks yet' : 'Nothing here!';
    empty.querySelector('.empty-sub').textContent = currentFilter === 'all' ? 'Add a task above to get started' : 'Try a different filter';
  } else {
    empty.classList.remove('visible');
  }

  shown.forEach(t => {
    const card = document.createElement('div');
    card.className = `task-card${t.done ? ' completed' : ''}`;
    card.dataset.id = t.id;
    card.style.setProperty('--card-accent', cardAccent(t.priority));
    const dateStr = t.date ? formatDate(t.date) : '';
    const overdue = !t.done && isOverdue(t.date);
    card.innerHTML = `
      <div class="task-check${t.done ? ' checked' : ''}" data-id="${t.id}"></div>
      <div class="task-body">
        <div class="task-top">
          <span class="task-text">${escHtml(t.text)}</span>
          <span class="priority-badge ${t.priority}">${t.priority}</span>
          <span class="cat-badge">${t.cat}</span>
        </div>
        ${dateStr ? `<div class="task-meta"><span class="task-date${overdue ? ' overdue' : ''}">${dateStr}</span></div>` : ''}
      </div>
      <div class="task-actions">
        <button class="action-btn edit" data-id="${t.id}" title="Edit">✏️</button>
        <button class="action-btn delete" data-id="${t.id}" title="Delete">✕</button>
      </div>
    `;
    list.appendChild(card);
  });

  updateStats();
}

function updateStats() {
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('done-count').textContent = done;
  document.getElementById('total-count').textContent = total;
  document.getElementById('pct-text').textContent = pct + '%';
  document.getElementById('progress-fill').style.width = pct + '%';
}

function addTask() {
  const input = document.getElementById('task-input');
  const text = input.value.trim();
  if (!text) { input.focus(); input.style.border='1px solid var(--high)'; setTimeout(() => input.style.border='', 700); return; }
  const priority = document.getElementById('priority-select').value;
  const cat = document.getElementById('category-select').value;
  const date = document.getElementById('date-input').value;
  tasks.unshift({ id: uid(), text, priority, cat, date, done: false });
  save();
  input.value = '';
  render();
  showToast('Task added!', 'success');
}

// Event delegation
document.getElementById('task-list').addEventListener('click', e => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('task-check')) {
    const t = tasks.find(t => t.id === id);
    if (t) { t.done = !t.done; save(); render(); if (t.done) showToast('Task completed! ✅', 'success'); }
    return;
  }
  if (e.target.classList.contains('delete')) {
    const card = e.target.closest('.task-card');
    card.classList.add('removing');
    card.addEventListener('animationend', () => { tasks = tasks.filter(t => t.id !== id); save(); render(); }, { once: true });
    return;
  }
  if (e.target.classList.contains('edit')) {
    const card = e.target.closest('.task-card');
    const taskText = card.querySelector('.task-text');
    const t = tasks.find(t => t.id === id);
    if (!t || card.querySelector('.edit-input')) return;
    const inp = document.createElement('input');
    inp.className = 'edit-input';
    inp.value = t.text;
    taskText.replaceWith(inp);
    inp.focus();
    const done = () => { const v = inp.value.trim(); if (v) t.text = v; save(); render(); };
    inp.addEventListener('blur', done);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = t.text; inp.blur(); } });
    return;
  }
});

// Filter pills
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

// Category chips
document.querySelectorAll('.cat-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentCat = chip.dataset.cat;
    render();
  });
});

document.getElementById('add-btn').addEventListener('click', addTask);
document.getElementById('task-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
document.getElementById('fab-btn').addEventListener('click', () => {
  document.getElementById('task-input').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  isLight = !isLight;
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-toggle').textContent = isLight ? '☀️' : '🌙';
});
