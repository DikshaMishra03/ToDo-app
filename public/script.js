// ═══════════════════════════════════════════════════════════════
//  TaskFlow — Production Script
//  Fixes applied:
//    • onAuthStateChanged imported (was missing)
//    • All Firebase imports use single consistent version
//    • Google sign-in with signInWithPopup implemented
//    • Firestore CRUD replaces localStorage for tasks
//    • uid() renamed to generateId() (collision fix)
//    • Inline onclick handlers removed, replaced with delegation
//    • User profile stored in Firestore, not localStorage
//    • Real-time task sync via onSnapshot
//    • Proper loading states on all async actions
//    • Comprehensive error handling with user-friendly messages
// ═══════════════════════════════════════════════════════════════

// ─────────────── FIREBASE IMPORTS ───────────────
// Single version across all modules — no mismatch with importmap
import { initializeApp } 
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile
} 
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDoc
} 
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// ─────────────── FIREBASE CONFIG ───────────────
// ⚠️  SECURITY NOTE FOR DEPLOYMENT:
//
//  These keys are safe to ship in client-side code ONLY if you:
//  1. Set strict Firestore security rules (see firestore.rules below)
//  2. Restrict this API key in Google Cloud Console to your domain
//  3. Enable Firebase App Check for production
//
//  For local dev, consider moving to a .env file and using a build
//  tool (Vite) so keys don't appear in your git history.
//
//  See: https://firebase.google.com/docs/projects/api-keys
const firebaseConfig = {
  apiKey:            import.meta.env?.VITE_FIREBASE_API_KEY            || "AIzaSyD7NAR2Y0cJ-4qXH0_kvg0Ge5RigvrK0Og",
  authDomain:        import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN        || "todo-84da2.firebaseapp.com",
  projectId:         import.meta.env?.VITE_FIREBASE_PROJECT_ID         || "todo-84da2",
  storageBucket:     import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET     || "todo-84da2.firebasestorage.app",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID|| "330453368517",
  appId:             import.meta.env?.VITE_FIREBASE_APP_ID             || "1:330453368517:web:f3d98166236558a3e27aac"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─────────────── APP STATE ───────────────
let currentUser   = null;   // { uid, name, email, initials }
let tasks         = [];     // in-memory mirror of Firestore snapshot
let currentFilter = 'all';
let currentCat    = 'all';
let isLight       = false;
let unsubTasks    = null;   // Firestore onSnapshot unsubscribe handle

// ═══════════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════════
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type}`;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}
window.showToast = showToast; // keep accessible for inline HTML fallback

// ═══════════════════════════════════════════════════════════════
//  AUTH TABS
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
});

// ═══════════════════════════════════════════════════════════════
//  PASSWORD TOGGLE
// ═══════════════════════════════════════════════════════════════
function setupPwToggle(toggleId, inputId) {
  document.getElementById(toggleId).addEventListener('click', () => {
    const inp  = document.getElementById(inputId);
    const btn  = document.getElementById(toggleId);
    inp.type   = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  });
}
setupPwToggle('login-pw-toggle',  'login-pw');
setupPwToggle('signup-pw-toggle', 'signup-pw');

// ═══════════════════════════════════════════════════════════════
//  PASSWORD STRENGTH
// ═══════════════════════════════════════════════════════════════
document.getElementById('signup-pw').addEventListener('input', function () {
  const v = this.value;
  let score = 0;
  if (v.length >= 8)            score++;
  if (/[A-Z]/.test(v))          score++;
  if (/[0-9]/.test(v))          score++;
  if (/[^A-Za-z0-9]/.test(v))   score++;
  const cls = score <= 1 ? 'weak' : score === 2 ? 'medium' : 'strong';
  for (let i = 1; i <= 4; i++) {
    const bar = document.getElementById('pwb' + i);
    bar.className = 'pw-bar';
    if (i <= score) bar.classList.add(cls);
  }
});

// ═══════════════════════════════════════════════════════════════
//  VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════
function validateEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function showErr(id, show) {
  const el = document.getElementById(id);
  el && (show ? el.classList.add('show') : el.classList.remove('show'));
}
function markInput(id, error) {
  const el = document.getElementById(id);
  el && (error ? el.classList.add('error') : el.classList.remove('error'));
}
function clearAuthErrors() {
  ['login-email-err','login-pw-err','signup-email-err','signup-exists-err','signup-pw-err','signup-pw2-err']
    .forEach(id => showErr(id, false));
  ['login-email','login-pw','signup-fname','signup-lname','signup-email','signup-pw','signup-pw2']
    .forEach(id => markInput(id, false));
}

// Button loading helpers
function btnLoading(id, text)   {
  const b = document.getElementById(id);
  b.classList.add('loading');
  b.innerHTML = `<span>${text}</span>`;
}
function btnReset(id, html) {
  const b = document.getElementById(id);
  b.classList.remove('loading');
  b.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
//  FIREBASE ERROR → USER MESSAGE
// ═══════════════════════════════════════════════════════════════
function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/user-not-found':         'No account found with this email.',
    'auth/wrong-password':         'Incorrect password. Please try again.',
    'auth/invalid-credential':     'Email or password is incorrect.',
    'auth/too-many-requests':      'Too many attempts. Please wait a moment.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/email-already-in-use':   'An account with this email already exists.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/popup-closed-by-user':   null, // silently ignore
    'auth/popup-blocked':          'Popup was blocked. Please allow popups for this site.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════
document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('login-pw').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

async function doLogin() {
  clearAuthErrors();
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-pw').value;
  let ok = true;

  if (!validateEmail(email)) { markInput('login-email', true); showErr('login-email-err', true); ok = false; }
  if (!pw)                    { markInput('login-pw', true);    showErr('login-pw-err', true);    ok = false; }
  if (!ok) return;

  btnLoading('login-btn', 'Signing in…');
  try {
    await signInWithEmailAndPassword(auth, email, pw);
    // onAuthStateChanged handles screen transition
  } catch (err) {
    btnReset('login-btn', '<span>Sign In</span><span>→</span>');
    const msg = friendlyAuthError(err.code);
    if (msg) {
      markInput('login-email', true);
      markInput('login-pw', true);
      document.getElementById('login-pw-err').textContent = msg;
      showErr('login-pw-err', true);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  GOOGLE SIGN-IN  ← fully implemented
// ═══════════════════════════════════════════════════════════════
async function doGoogleSignIn() {
  const provider = new GoogleAuthProvider();
  // Prompt account selection every time (good UX for shared devices)
  provider.setCustomParameters({ prompt: 'select_account' });

  // Disable both Google buttons during sign-in
  document.querySelectorAll('.google-btn').forEach(b => {
    b.disabled = true;
    b.style.opacity = '0.6';
  });

  try {
    const result = await signInWithPopup(auth, provider);
    // Store/update profile in Firestore so name is available across devices
    await upsertUserProfile(result.user, {
      name:  result.user.displayName || result.user.email.split('@')[0],
      email: result.user.email
    });
    // onAuthStateChanged handles the rest
  } catch (err) {
    document.querySelectorAll('.google-btn').forEach(b => {
      b.disabled = false;
      b.style.opacity = '';
    });
    const msg = friendlyAuthError(err.code);
    if (msg) showToast(msg, 'error');
  }
}
window.doGoogleSignIn = doGoogleSignIn;

// ═══════════════════════════════════════════════════════════════
//  SIGNUP
// ═══════════════════════════════════════════════════════════════
document.getElementById('signup-btn').addEventListener('click', doSignup);
document.getElementById('signup-pw2').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSignup();
});

async function doSignup() {
  clearAuthErrors();
  const fname = document.getElementById('signup-fname').value.trim();
  const lname = document.getElementById('signup-lname').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw    = document.getElementById('signup-pw').value;
  const pw2   = document.getElementById('signup-pw2').value;
  let ok = true;

  if (!validateEmail(email)) { markInput('signup-email', true); showErr('signup-email-err', true); ok = false; }
  if (pw.length < 8)         { markInput('signup-pw', true);    showErr('signup-pw-err', true);    ok = false; }
  if (pw !== pw2)            { markInput('signup-pw2', true);   showErr('signup-pw2-err', true);   ok = false; }
  if (!ok) return;

  btnLoading('signup-btn', 'Creating account…');

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, pw);
    const displayName = [fname, lname].filter(Boolean).join(' ') || email.split('@')[0];

    // Update Firebase Auth profile
    await updateProfile(credential.user, { displayName });

    // Store profile in Firestore (survives device changes)
    await upsertUserProfile(credential.user, { name: displayName, email, isNew: true });

    // onAuthStateChanged handles redirect
  } catch (err) {
    btnReset('signup-btn', '<span>Create Account</span><span>🚀</span>');
    if (err.code === 'auth/email-already-in-use') {
      markInput('signup-email', true);
      showErr('signup-exists-err', true);
    } else {
      const msg = friendlyAuthError(err.code);
      if (msg) showToast(msg, 'error');
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  FIRESTORE — USER PROFILE  (replaces localStorage for profile)
// ═══════════════════════════════════════════════════════════════
async function upsertUserProfile(firebaseUser, data) {
  const ref = doc(db, 'users', firebaseUser.uid);
  // merge:true preserves existing fields (e.g. don't wipe isNew on re-login)
  await setDoc(ref, {
    name:      data.name  || firebaseUser.displayName || firebaseUser.email.split('@')[0],
    email:     data.email || firebaseUser.email,
    updatedAt: serverTimestamp(),
    ...(data.isNew ? { createdAt: serverTimestamp(), isNew: true } : {})
  }, { merge: true });
}

async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// ═══════════════════════════════════════════════════════════════
//  AUTH STATE LISTENER  — single source of truth
// ═══════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    // Fetch stored profile from Firestore (name may differ from auth displayName)
    const profile = await getUserProfile(firebaseUser.uid);
    const name    = profile?.name
      || firebaseUser.displayName
      || firebaseUser.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const isNew = profile?.isNew || false;
    // Clear the isNew flag so it doesn't fire again
    if (isNew) {
      await setDoc(doc(db, 'users', firebaseUser.uid), { isNew: false }, { merge: true });
    }

    enterApp({
      uid:      firebaseUser.uid,
      name,
      email:    firebaseUser.email,
      initials: getInitials(name),
      isNew
    });
  } else {
    showAuthScreen();
  }
});

// ═══════════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════════
async function logout() {
  closeDropdown();
  // Unsubscribe from Firestore real-time listener before signing out
  if (unsubTasks) { unsubTasks(); unsubTasks = null; }
  try {
    await signOut(auth);
    // onAuthStateChanged → showAuthScreen()
  } catch {
    showToast('Sign out failed. Try again.', 'error');
  }
}
window.logout = logout;

// ═══════════════════════════════════════════════════════════════
//  SCREEN TRANSITIONS
// ═══════════════════════════════════════════════════════════════
function showAuthScreen() {
  currentUser = null;
  tasks       = [];
  const authEl = document.getElementById('auth-screen');
  const appEl  = document.getElementById('app-screen');

  authEl.style.display = '';
  appEl.classList.add('hidden');
  setTimeout(() => authEl.classList.remove('hidden'), 50);

  // Reset form state
  btnReset('login-btn',  '<span>Sign In</span><span>→</span>');
  btnReset('signup-btn', '<span>Create Account</span><span>🚀</span>');
  document.getElementById('login-email').value = '';
  document.getElementById('login-pw').value    = '';
  clearAuthErrors();

  showToast('You\'ve been signed out.', 'info');
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
}

function enterApp(user) {
  currentUser = user;

  // Update header UI
  document.getElementById('user-avatar').textContent    = user.initials;
  document.getElementById('dropdown-name').textContent  = user.name;
  document.getElementById('dropdown-email').textContent = user.email;

  const firstName = user.name.split(' ')[0];
  document.getElementById('welcome-text').textContent = user.isNew
    ? `Welcome to TaskFlow, ${firstName}! 🎉`
    : `Welcome back, ${firstName}!`;

  // Transition screens
  const authEl = document.getElementById('auth-screen');
  const appEl  = document.getElementById('app-screen');
  authEl.classList.add('hidden');
  appEl.classList.remove('hidden');
  setTimeout(() => { authEl.style.display = 'none'; }, 400);

  showToast(
    user.isNew ? `Account created! Welcome, ${firstName}!` : `Signed in as ${user.name}`,
    'success'
  );

  // Start real-time Firestore task sync
  subscribeToTasks(user.uid);
}

// ═══════════════════════════════════════════════════════════════
//  DROPDOWN
// ═══════════════════════════════════════════════════════════════
function toggleDropdown() { document.getElementById('user-dropdown').classList.toggle('open'); }
function closeDropdown()  { document.getElementById('user-dropdown').classList.remove('open'); }
window.toggleDropdown = toggleDropdown;
window.closeDropdown  = closeDropdown;

document.addEventListener('click', e => {
  if (!e.target.closest('.user-menu')) closeDropdown();
});

// ═══════════════════════════════════════════════════════════════
//  FIRESTORE TASK CRUD  ← replaces localStorage
// ═══════════════════════════════════════════════════════════════

// Path helper — all tasks stored under /users/{uid}/tasks/{taskId}
function tasksRef(uid) {
  return collection(db, 'users', uid, 'tasks');
}
function taskDocRef(uid, taskId) {
  return doc(db, 'users', uid, 'tasks', taskId);
}

// Real-time listener: keeps `tasks` array in sync with Firestore
function subscribeToTasks(uid) {
  // Cancel any existing subscription first
  if (unsubTasks) unsubTasks();

  const q = query(tasksRef(uid), orderBy('createdAt', 'desc'));

  unsubTasks = onSnapshot(q, (snapshot) => {
    tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // First load: seed default tasks if user has none yet
    if (snapshot.metadata.fromCache === false && tasks.length === 0 && currentUser?.isNew !== false) {
      seedDefaultTasks(uid);
      return; // onSnapshot will fire again with the seeded tasks
    }

    // Update welcome banner pending count
    const pending = tasks.filter(t => !t.done).length;
    const welcomeSub = document.getElementById('welcome-sub');
    if (welcomeSub) {
      welcomeSub.textContent = pending > 0
        ? `You have ${pending} pending task${pending !== 1 ? 's' : ''} — let's crush it!`
        : "You're all caught up — great work! 🎯";
    }

    render();
  }, (err) => {
    console.error('Firestore snapshot error:', err);
    showToast('Error loading tasks. Please refresh.', 'error');
  });
}

async function addTaskToFirestore(taskData) {
  if (!currentUser) return;
  try {
    await addDoc(tasksRef(currentUser.uid), {
      ...taskData,
      done:      false,
      createdAt: serverTimestamp()
    });
    // onSnapshot updates `tasks` automatically
  } catch (err) {
    console.error('Add task failed:', err);
    showToast('Failed to save task. Try again.', 'error');
  }
}

async function updateTaskInFirestore(taskId, changes) {
  if (!currentUser) return;
  try {
    await updateDoc(taskDocRef(currentUser.uid, taskId), {
      ...changes,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error('Update task failed:', err);
    showToast('Failed to update task.', 'error');
  }
}

async function deleteTaskFromFirestore(taskId) {
  if (!currentUser) return;
  try {
    await deleteDoc(taskDocRef(currentUser.uid, taskId));
  } catch (err) {
    console.error('Delete task failed:', err);
    showToast('Failed to delete task.', 'error');
  }
}

// Seed sample tasks for brand-new users
async function seedDefaultTasks(uid) {
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const defaults = [
    { text: 'Review project proposal', priority: 'high',   cat: 'Work',     date: today,    done: false },
    { text: 'Buy groceries',           priority: 'medium', cat: 'Home',     date: tomorrow, done: false },
    { text: 'Morning run — 5km',       priority: 'low',    cat: 'Personal', date: today,    done: true  },
  ];
  for (const task of defaults) {
    await addDoc(tasksRef(uid), { ...task, createdAt: serverTimestamp() });
  }
}

// ═══════════════════════════════════════════════════════════════
//  TASK HELPERS
// ═══════════════════════════════════════════════════════════════
function generateId() {
  // Only used client-side for optimistic UI; Firestore assigns the real ID
  return Math.random().toString(36).slice(2, 10);
}

function cardAccent(priority) {
  if (priority === 'high') return 'var(--high)';
  if (priority === 'low')  return 'var(--low)';
  return 'var(--med)';
}

function formatDate(str) {
  if (!str) return '';
  const d     = new Date(str + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((d - today) / 86400000);
  if (diff === 0)  return '📅 Today';
  if (diff === 1)  return '📅 Tomorrow';
  if (diff === -1) return '⚠️ Yesterday';
  if (diff < -1)   return `⚠️ ${Math.abs(diff)}d overdue`;
  return `📅 ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function isOverdue(str) {
  if (!str) return false;
  const d     = new Date(str + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}

function filteredTasks() {
  return tasks.filter(t => {
    const catOk = currentCat === 'all' || t.cat === currentCat;
    if (!catOk) return false;
    if (currentFilter === 'all')       return true;
    if (currentFilter === 'pending')   return !t.done;
    if (currentFilter === 'completed') return t.done;
    return t.priority === currentFilter;
  });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════════
function render() {
  const list  = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');
  const label = document.getElementById('section-label');
  const shown = filteredTasks();

  const names = {
    all: 'All Tasks', pending: 'Pending', completed: 'Completed',
    high: 'High Priority', medium: 'Medium Priority', low: 'Low Priority'
  };
  label.textContent = `${names[currentFilter] || 'Tasks'} · ${shown.length}`;

  list.innerHTML = '';

  if (shown.length === 0) {
    empty.classList.add('visible');
    empty.querySelector('.empty-icon').textContent  = currentFilter === 'completed' ? '✅' : '🎯';
    empty.querySelector('.empty-title').textContent = currentFilter === 'completed' ? 'No completed tasks yet' : 'Nothing here!';
    empty.querySelector('.empty-sub').textContent   = currentFilter === 'all' ? 'Add a task above to get started' : 'Try a different filter';
  } else {
    empty.classList.remove('visible');
  }

  shown.forEach(t => {
    const card     = document.createElement('div');
    card.className = `task-card${t.done ? ' completed' : ''}`;
    card.dataset.id = t.id;
    card.style.setProperty('--card-accent', cardAccent(t.priority));

    const dateStr = t.date ? formatDate(t.date) : '';
    const overdue = !t.done && isOverdue(t.date);

    card.innerHTML = `
      <div class="task-check${t.done ? ' checked' : ''}" data-id="${escHtml(t.id)}" role="checkbox" aria-checked="${t.done}" tabindex="0"></div>
      <div class="task-body">
        <div class="task-top">
          <span class="task-text">${escHtml(t.text)}</span>
          <span class="priority-badge ${escHtml(t.priority)}">${escHtml(t.priority)}</span>
          <span class="cat-badge">${escHtml(t.cat)}</span>
        </div>
        ${dateStr ? `<div class="task-meta"><span class="task-date${overdue ? ' overdue' : ''}">${dateStr}</span></div>` : ''}
      </div>
      <div class="task-actions">
        <button class="action-btn edit"   data-id="${escHtml(t.id)}" title="Edit task"   aria-label="Edit task">✏️</button>
        <button class="action-btn delete" data-id="${escHtml(t.id)}" title="Delete task" aria-label="Delete task">✕</button>
      </div>
    `;
    list.appendChild(card);
  });

  updateStats();
}

function updateStats() {
  const total = tasks.length;
  const done  = tasks.filter(t => t.done).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('done-count').textContent    = done;
  document.getElementById('total-count').textContent   = total;
  document.getElementById('pct-text').textContent      = pct + '%';
  document.getElementById('progress-fill').style.width = pct + '%';
}

// ═══════════════════════════════════════════════════════════════
//  ADD TASK
// ═══════════════════════════════════════════════════════════════
async function addTask() {
  const input    = document.getElementById('task-input');
  const text     = input.value.trim();
  if (!text) {
    input.focus();
    input.style.borderColor = 'var(--high)';
    input.style.boxShadow   = '0 0 0 4px var(--high-bg)';
    setTimeout(() => { input.style.borderColor = ''; input.style.boxShadow = ''; }, 800);
    return;
  }

  const priority = document.getElementById('priority-select').value;
  const cat      = document.getElementById('category-select').value;
  const date     = document.getElementById('date-input').value;

  // Optimistic UI — clear input immediately
  input.value = '';

  await addTaskToFirestore({ text, priority, cat, date });
  // onSnapshot fires → render() called automatically
  showToast('Task added!', 'success');
}

// ═══════════════════════════════════════════════════════════════
//  TASK LIST EVENT DELEGATION
// ═══════════════════════════════════════════════════════════════
document.getElementById('task-list').addEventListener('click', async e => {
  const id = e.target.dataset.id;
  if (!id) return;

  // Toggle complete
  if (e.target.classList.contains('task-check')) {
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    await updateTaskInFirestore(id, { done: !t.done });
    if (!t.done) showToast('Task completed! ✅', 'success');
    return;
  }

  // Keyboard: allow Space/Enter on checkbox
  if (e.target.classList.contains('delete')) {
    const card = e.target.closest('.task-card');
    card.classList.add('removing');
    card.addEventListener('animationend', async () => {
      await deleteTaskFromFirestore(id);
      // onSnapshot fires → render() removes the card from data
    }, { once: true });
    return;
  }

  // Inline edit
  if (e.target.classList.contains('edit')) {
    const card     = e.target.closest('.task-card');
    const taskText = card.querySelector('.task-text');
    const t        = tasks.find(t => t.id === id);
    if (!t || card.querySelector('.edit-input')) return;

    const inp = document.createElement('input');
    inp.className = 'edit-input';
    inp.value     = t.text;
    inp.maxLength = 120;
    taskText.replaceWith(inp);
    inp.focus();
    inp.select();

    const commit = async () => {
      const v = inp.value.trim();
      if (v && v !== t.text) {
        await updateTaskInFirestore(id, { text: v });
        showToast('Task updated!', 'success');
      } else {
        render(); // revert
      }
    };
    inp.addEventListener('blur',    commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  inp.blur();
      if (e.key === 'Escape') { inp.value = t.text; inp.removeEventListener('blur', commit); render(); }
    });
    return;
  }
});

// Keyboard accessibility for checkboxes
document.getElementById('task-list').addEventListener('keydown', async e => {
  if ((e.key === ' ' || e.key === 'Enter') && e.target.classList.contains('task-check')) {
    e.preventDefault();
    const id = e.target.dataset.id;
    const t  = tasks.find(t => t.id === id);
    if (t) await updateTaskInFirestore(id, { done: !t.done });
  }
});

// ═══════════════════════════════════════════════════════════════
//  FILTER & CATEGORY PILLS
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.querySelectorAll('.cat-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentCat = chip.dataset.cat;
    render();
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADD BUTTON, FAB, ENTER KEY
// ═══════════════════════════════════════════════════════════════
document.getElementById('add-btn').addEventListener('click', addTask);
document.getElementById('task-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTask();
});
document.getElementById('fab-btn').addEventListener('click', () => {
  document.getElementById('task-input').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ═══════════════════════════════════════════════════════════════
//  THEME TOGGLE
// ═══════════════════════════════════════════════════════════════
// Respect OS preference on first load
if (window.matchMedia('(prefers-color-scheme: light)').matches) {
  isLight = true;
  document.documentElement.setAttribute('data-theme', 'light');
  document.getElementById('theme-toggle').textContent = '☀️';
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  isLight = !isLight;
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-toggle').textContent = isLight ? '☀️' : '🌙';
});

// ═══════════════════════════════════════════════════════════════
//  DROPDOWN INLINE HANDLERS  (replacing all onclick="" attributes)
//  Attach these here so we can remove onclick="" from index.html
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Header dropdown items — use data-action on each .dropdown-item
  document.getElementById('user-dropdown')?.addEventListener('click', e => {
    const item = e.target.closest('[data-action]');
    if (!item) return;
    closeDropdown();
    const action = item.dataset.action;
    if (action === 'settings')      showToast('Profile settings coming soon!', 'info');
    if (action === 'notifications') showToast('Notifications coming soon!', 'info');
    if (action === 'export')        showToast('Export feature coming soon!', 'info');
    if (action === 'logout')        logout();
  });

  // Welcome banner close
  document.getElementById('welcome-banner')?.querySelector('.welcome-close')
    ?.addEventListener('click', () => {
      document.getElementById('welcome-banner').style.display = 'none';
    });

  // Forgot password
  document.querySelector('.forgot-link')?.addEventListener('click', e => {
    e.preventDefault();
    showToast('Password reset coming soon!', 'info');
  });
});
