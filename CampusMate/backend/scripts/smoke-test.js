/**
 * End-to-end smoke test. Start the server first (npm start), then run: npm test
 * It uses a throw-away student account and checks every major feature through the real HTTP API.
 * Needs the admin from `npm run seed` (ADMIN_EMAIL / ADMIN_PASSWORD in .env).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { io } = require('socket.io-client');

const BASE = process.env.TEST_URL || `http://localhost:${process.env.PORT || 5000}`;
const api = async (method, url, { token, body, form } = {}) => {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + '/api' + url, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
};
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${cond ? '' : '  -> ' + extra}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const stamp = Date.now();
  console.log('Health'); check('GET /health', (await api('GET', '/health')).status === 200);

  console.log('Auth');
  const reg = await api('POST', '/auth/register', { body: { name: 'Test Student', email: `t${stamp}@test.edu`, password: 'secret123', studentId: `T${stamp}`, role: 'admin' } });
  check('register works', reg.status === 201, JSON.stringify(reg.data));
  check('cannot self-register as admin', reg.data?.user?.role === 'student');
  check('duplicate email rejected', (await api('POST', '/auth/register', { body: { name: 'x', email: `t${stamp}@test.edu`, password: 'secret123' } })).status === 409);
  check('short password rejected', (await api('POST', '/auth/register', { body: { name: 'x', email: `z${stamp}@test.edu`, password: '123' } })).status === 400);
  check('wrong password rejected', (await api('POST', '/auth/login', { body: { email: `t${stamp}@test.edu`, password: 'nope' } })).status === 401);
  const st = (await api('POST', '/auth/login', { body: { email: `t${stamp}@test.edu`, password: 'secret123' } })).data;
  check('login returns token', !!st?.token);
  check('password never returned', !JSON.stringify(st).includes('password'));
  const ad = (await api('POST', '/auth/login', { body: { email: process.env.ADMIN_EMAIL || 'admin@campus.edu', password: process.env.ADMIN_PASSWORD || 'Admin@12345' } })).data;
  check('admin login (run npm run seed first)', ad?.user?.role === 'admin', JSON.stringify(ad));
  check('profile needs token', (await api('GET', '/auth/profile')).status === 401);

  console.log('Realtime');
  const events = [];
  const sock = io(BASE, { auth: { token: st.token } });
  const asock = io(BASE, { auth: { token: ad.token } });
  sock.on('notification', n => events.push('student:' + n.title)); sock.on('complaint:updated', () => events.push('student:updated'));
  asock.on('complaint:new', () => events.push('admin:new'));
  await wait(600);
  check('socket without token refused', await new Promise(r => { const s = io(BASE, { auth: {}, reconnection: false }); s.on('connect_error', () => { s.close(); r(true); }); s.on('connect', () => { s.close(); r(false); }); }));

  console.log('Complaints + AI');
  const analyze = await api('POST', '/complaints/analyze', { token: st.token, body: { description: 'sparks coming from the switch board', area: 'Classroom' } });
  check('AI preview: Electrical / Critical', analyze.data?.category === 'Electrical' && analyze.data?.priority === 'Critical', JSON.stringify(analyze.data));
  const f1 = new FormData(); f1.append('area', 'Hostel'); f1.append('location', `Test Block ${stamp}`); f1.append('description', 'Water leaking from the bathroom tap, floor is slippery');
  f1.append('image', new Blob([png], { type: 'image/png' }), 'x.png');
  const c1 = await api('POST', '/complaints', { token: st.token, form: f1 });
  check('create complaint with photo', c1.status === 201 && c1.data.image.startsWith('/uploads/'), JSON.stringify(c1.data));
  check('AI category = Plumbing', c1.data?.category === 'Plumbing', c1.data?.category);
  check('AI gave priority + reason', !!c1.data?.priority && /score/.test(c1.data?.aiReason || ''));
  const img = await fetch(BASE + c1.data.image); check('uploaded image is served', img.status === 200 && (img.headers.get('content-type') || '').includes('image/png'));
  const bad = new FormData(); bad.append('location', 'x'); bad.append('description', 'virus file here'); bad.append('image', new Blob(['<?php ?>'], { type: 'text/php' }), 'a.php');
  check('non-image upload rejected', (await api('POST', '/complaints', { token: st.token, form: bad })).status === 400);
  check('missing fields rejected', (await api('POST', '/complaints', { token: st.token, form: (() => { const f = new FormData(); f.append('description', 'abc'); return f; })() })).status === 400);

  const f2 = new FormData(); f2.append('area', 'Hostel'); f2.append('location', `test block ${stamp}`); f2.append('description', 'Tap leakage in bathroom, water leaking everywhere');
  const reg2 = await api('POST', '/auth/register', { body: { name: 'Second', email: `s${stamp}@test.edu`, password: 'secret123' } });
  const c2 = await api('POST', '/complaints', { token: reg2.data.token, form: f2 });
  check('duplicate detected + linked to first complaint', String(c2.data?.duplicateOf) === String(c1.data?._id), JSON.stringify({ d: c2.data?.duplicateOf, sim: c2.data?.similarity }));
  const c1b = await api('GET', `/complaints/${c1.data._id}`, { token: st.token });
  check('original complaint reportCount = 2', c1b.data?.reportCount === 2, c1b.data?.reportCount);

  const f3 = new FormData(); f3.append('area', 'Canteen'); f3.append('location', `Test Canteen ${stamp}`); f3.append('description', 'Dustbin overflowing and bad smell');
  const c3 = await api('POST', '/complaints', { token: st.token, form: f3 });
  check('unrelated complaint is not a duplicate & is CLEANWISE', !c3.data?.duplicateOf && c3.data?.module === 'CLEANWISE', JSON.stringify(c3.data));

  const mine = await api('GET', '/complaints', { token: st.token });
  check('student lists only own complaints', mine.data.items.length === 2 && mine.data.items.every(c => c.userId._id === st.user.id), mine.data.total);
  check('student cannot read others complaint', (await api('GET', `/complaints/${c2.data._id}`, { token: st.token })).status === 403);
  const all = await api('GET', '/complaints?q=canteen', { token: ad.token });
  check('admin search finds canteen complaint', all.data.items.some(c => c._id === c3.data._id));
  check('filter by module', (await api('GET', '/complaints?module=FIXORA', { token: ad.token })).data.items.every(c => c.module === 'FIXORA'));

  console.log('Admin workflow');
  check('student cannot update status', (await api('PUT', `/complaints/${c1.data._id}`, { token: st.token, body: { status: 'Resolved' } })).status === 403);
  const up = await api('PUT', `/complaints/${c1.data._id}`, { token: ad.token, body: { status: 'In Progress', assignedTo: 'Plumber Team', adminNote: 'Plumber on the way' } });
  check('admin updates status', up.data?.status === 'In Progress' && up.data?.assignedTo === 'Plumber Team', JSON.stringify(up.data));
  check('invalid status rejected', (await api('PUT', `/complaints/${c1.data._id}`, { token: ad.token, body: { status: 'Banana' } })).status === 400);
  await api('PUT', `/complaints/${c1.data._id}`, { token: ad.token, body: { status: 'Resolved' } });
  const dupAfter = await api('GET', `/complaints/${c2.data._id}`, { token: reg2.data.token });
  check('duplicate reporter gets resolved status too', dupAfter.data?.status === 'Resolved', dupAfter.data?.status);
  const n = await api('GET', '/notifications', { token: st.token });
  check('student got status notifications', n.data.unread >= 2, n.data.unread);
  await api('PUT', '/notifications/read-all', { token: st.token });
  check('mark all read', (await api('GET', '/notifications', { token: st.token })).data.unread === 0);
  check('student cannot delete resolved complaint', (await api('DELETE', `/complaints/${c1.data._id}`, { token: st.token })).status === 400);
  check('student can withdraw a "Reported" complaint', (await api('DELETE', `/complaints/${c3.data._id}`, { token: st.token })).status === 200);

  console.log('Parcels / OTP');
  check('student cannot add parcel', (await api('POST', '/parcels', { token: st.token, body: { student: st.user.studentId, parcelName: 'x', courierName: 'y' } })).status === 403);
  const p = await api('POST', '/parcels', { token: ad.token, body: { student: st.user.studentId, parcelName: 'Laptop bag', courierName: 'Flipkart', trackingNumber: 'FK1' } });
  check('admin registers parcel by roll number', p.status === 201, JSON.stringify(p.data));
  check('OTP not leaked to admin', !('otp' in p.data) && !JSON.stringify((await api('GET', '/parcels', { token: ad.token })).data).includes('"otp"'));
  check('unknown student rejected', (await api('POST', '/parcels', { token: ad.token, body: { student: 'NOPE', parcelName: 'x', courierName: 'y' } })).status === 404);
  const sp = await api('GET', '/parcels', { token: st.token });
  const otp = sp.data.items[0]?.otp;
  check('student sees own OTP (6 digits)', /^\d{6}$/.test(otp || ''), otp);
  check('wrong OTP rejected', (await api('PUT', `/parcels/${p.data._id}/verify-otp`, { token: ad.token, body: { otp: '000000' === otp ? '111111' : '000000' } })).status === 400);
  check('student cannot verify OTP', (await api('PUT', `/parcels/${p.data._id}/verify-otp`, { token: st.token, body: { otp } })).status === 403);
  const ok = await api('PUT', `/parcels/${p.data._id}/verify-otp`, { token: ad.token, body: { otp } });
  check('correct OTP marks Collected', ok.data?.status === 'Collected', JSON.stringify(ok.data));
  check('OTP cannot be reused', (await api('PUT', `/parcels/${p.data._id}/verify-otp`, { token: ad.token, body: { otp } })).status === 400);
  const p2 = await api('POST', '/parcels', { token: ad.token, body: { student: st.user.email, parcelName: 'Books', courierName: 'DTDC' } });
  let last; for (let i = 0; i < 6; i++) last = await api('PUT', `/parcels/${p2.data._id}/verify-otp`, { token: ad.token, body: { otp: '12345' + i } });
  check('OTP brute force locked after 5 tries', last.status === 429, last.status);

  console.log('Dashboards');
  const pub = await api('GET', '/dashboard/public'); check('public stats', pub.status === 200 && typeof pub.data.insight === 'string');
  const sd = await api('GET', '/dashboard/student', { token: st.token }); check('student dashboard', sd.data?.total >= 1, JSON.stringify(sd.data));
  const adm = await api('GET', '/dashboard/admin', { token: ad.token }); check('admin analytics', adm.data?.totals?.complaints >= 2 && adm.data.trend.length === 7, JSON.stringify(adm.data?.totals));
  check('student blocked from admin analytics', (await api('GET', '/dashboard/admin', { token: st.token })).status === 403);
  const stu = await api('GET', `/users/students?q=${st.user.studentId}`, { token: ad.token }); check('admin student search', stu.data.items.length === 1);

  await wait(500);
  check('realtime: admin got complaint:new', events.includes('admin:new'), events.join());
  check('realtime: student got live notification + update', events.some(e => e.startsWith('student:Complaint')) && events.includes('student:updated'), events.join());
  sock.close(); asock.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
