/* CampusMate shared helpers: API calls, login session, toast, live notifications */
const API_BASE = (location.port === '5000' || location.protocol === 'https:') ? '' : 'http://localhost:5000';
const API = API_BASE + '/api';

const Session = {
  get token() { try { return localStorage.getItem('cm_token'); } catch { return null; } },
  get user() { try { return JSON.parse(localStorage.getItem('cm_user') || 'null'); } catch { return null; } },
  set(token, user) { try { localStorage.setItem('cm_token', token); localStorage.setItem('cm_user', JSON.stringify(user)); } catch {} },
  clear() { try { localStorage.removeItem('cm_token'); localStorage.removeItem('cm_user'); } catch {} }
};

/** fetch wrapper: adds token, parses JSON, throws Error(message) on failure */
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (Session.token) headers.Authorization = 'Bearer ' + Session.token;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try { res = await fetch(API + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) }); }
  catch { throw new Error('Cannot reach the server. Is the backend running?'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && Session.token) { Session.clear(); location.href = 'auth.html'; }
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
const pill = (text, kind) => `<span class="pill ${kind}-${esc(String(text).replace(/\s+/g, '-'))}">${esc(text)}</span>`;
const $ = id => document.getElementById(id);

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/** Redirect to login unless a user with the right role is logged in. Returns the user. */
function requireLogin(role) {
  const u = Session.user;
  if (!Session.token || !u) { location.href = 'auth.html'; return null; }
  if (role && u.role !== role) { location.href = u.role === 'admin' ? 'admin.html' : 'student.html'; return null; }
  return u;
}
function logout() { Session.clear(); location.href = 'index.html'; }

/** Tabs: buttons with data-tab, panes with id="pane-<name>" */
function initTabs(onShow) {
  const show = name => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + name));
    if (onShow) onShow(name);
  };
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.tab); show(b.dataset.tab); });
  const fromHash = () => { const h = location.hash.slice(1); return document.getElementById('pane-' + h) ? h : document.querySelector('.tabs button').dataset.tab; };
  window.addEventListener('hashchange', () => show(fromHash()));   // e.g. clicking a notification link
  show(fromHash());
}

/* ---------- notifications bell + realtime ---------- */
async function loadNotifications() {
  try {
    const { items, unread } = await api('/notifications');
    const c = $('bellCount'); c.textContent = unread; c.style.display = unread ? 'block' : 'none';
    $('notifList').innerHTML = items.length ? items.map(n => `<div class="n ${n.read ? '' : 'unread'}" data-id="${n._id}" data-link="${esc(n.link)}"><b>${esc(n.title)}</b><small>${esc(n.message)}</small><small>${fmtDate(n.createdAt)}</small></div>`).join('') : '<p class="muted" style="padding:12px">No notifications yet.</p>';
  } catch {}
}
function initBell() {
  $('bell').onclick = e => { e.stopPropagation(); const p = $('notifPanel'); p.style.display = p.style.display === 'block' ? 'none' : 'block'; };
  document.addEventListener('click', e => { if (!$('notifPanel').contains(e.target)) $('notifPanel').style.display = 'none'; });
  $('markAll').onclick = async () => { await api('/notifications/read-all', { method: 'PUT' }); loadNotifications(); };
  $('notifList').onclick = async e => {
    const n = e.target.closest('.n'); if (!n) return;
    await api(`/notifications/${n.dataset.id}/read`, { method: 'PUT' }).catch(() => {});
    if (n.dataset.link) location.href = n.dataset.link;
    loadNotifications();
  };
  loadNotifications();
}

/** Connect Socket.IO. handlers = { 'complaint:new': fn, ... } */
function connectLive(handlers = {}) {
  const s = document.createElement('script');
  s.src = API_BASE + '/socket.io/socket.io.js';
  s.onload = () => {
    const socket = io(API_BASE || undefined, { auth: { token: Session.token } });
    socket.on('notification', n => { toast('🔔 ' + n.title); loadNotifications(); });
    Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));
  };
  document.head.appendChild(s);
}

/** Header used by student + admin pages */
function renderAppNav(user) {
  document.querySelector('header').innerHTML = `<nav><b class="logo">Campus<span>Mate</span></b>
    <div class="nav-r"><span class="muted hide-sm">${esc(user.name)} · ${esc(user.role)}</span>
    <button class="bell" id="bell" title="Notifications">🔔<b id="bellCount"></b></button>
    <button class="ghost" onclick="logout()">Logout</button></div></nav>
    <div id="notifPanel"><div style="display:flex;justify-content:space-between;padding:6px 10px"><b>Notifications</b><button class="sm ghost" id="markAll">Mark all read</button></div><div id="notifList"></div></div>`;
  initBell();
}

/** Complaint detail popup, shared by student + admin. extraHtml is added at the bottom. */
function complaintDetailHtml(c) {
  const dup = c.duplicateOf ? `<p class="muted">🔁 Linked to an earlier report of the same problem (${Math.round(c.similarity * 100)}% similar).</p>` : '';
  return `<h2 style="margin-top:0">${esc(c.category)}</h2>
    <p>${pill(c.priority, 'p')} ${pill(c.status, 's')} <span class="pill">${esc(c.module)}</span> <span class="pill">${esc(c.area)}</span></p>
    <p><b>📍 ${esc(c.location)}</b><br>${esc(c.description)}</p>
    ${c.image ? `<img class="proof" src="${API_BASE}${esc(c.image)}" alt="photo of the issue">` : ''}
    <div class="aibox">🤖 <b>AI analysis:</b> ${esc(c.aiReason)}<br>${c.reportCount > 1 ? `👥 Reported by <b>${c.reportCount}</b> students.<br>` : ''}</div>${dup}
    ${c.assignedTo ? `<p><b>Assigned to:</b> ${esc(c.assignedTo)}</p>` : ''}${c.adminNote ? `<p><b>Admin note:</b> ${esc(c.adminNote)}</p>` : ''}
    <b>Progress</b><ul class="timeline">${(c.statusHistory || []).map(h => `<li><b>${esc(h.status)}</b> · ${fmtDate(h.at)}${h.note ? `<br><span class="muted">${esc(h.note)}</span>` : ''}</li>`).join('')}</ul>`;
}
