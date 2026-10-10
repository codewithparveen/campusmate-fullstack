const me = requireLogin('student');
if (me) {
  $('hi').textContent = me.name.split(' ')[0];
  renderAppNav(me);

  let rows = [];
  async function loadStats() {
    const s = await api('/dashboard/student');
    $('tTotal').textContent = s.total; $('tOpen').textContent = s.open; $('tDone').textContent = s.resolved; $('tParcel').textContent = s.parcelsWaiting;
  }
  async function loadComplaints() {
    const p = new URLSearchParams();
    if ($('q').value) p.set('q', $('q').value); if ($('fStatus').value) p.set('status', $('fStatus').value); if ($('fModule').value) p.set('module', $('fModule').value);
    rows = (await api('/complaints?' + p)).items;
    $('rows').innerHTML = rows.length ? rows.map(c => `<tr class="click" data-id="${c._id}"><td><b>${esc(c.category)}</b><br><span class="muted">${esc(c.module)}${c.reportCount > 1 ? ' · 👥 ' + c.reportCount + ' reports' : ''}</span></td><td>${esc(c.area)}<br><span class="muted">${esc(c.location)}</span></td><td>${pill(c.priority, 'p')}</td><td>${pill(c.status, 's')}</td><td>${fmtDate(c.createdAt)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">No complaints found. Use “Report an Issue” to add one.</td></tr>';
  }
  async function loadParcels() {
    const { items } = await api('/parcels');
    $('parcelList').innerHTML = items.length ? items.map(p => `<div class="card" style="margin-bottom:12px"><b>📦 ${esc(p.parcelName)}</b> ${pill(p.status, 's')}<br><span class="muted">${esc(p.courierName)}${p.trackingNumber ? ' · ' + esc(p.trackingNumber) : ''} · arrived ${fmtDate(p.receivedDate)}</span>
      ${p.status === 'Ready for Pickup' ? `<p>Your pickup OTP:<br><span class="otp">${esc(p.otp)}</span></p>` : `<p class="muted">Collected on ${fmtDate(p.collectedDate)}</p>`}</div>`).join('')
      : '<p class="muted">No parcels yet.</p>';
  }
  const refresh = () => Promise.all([loadStats(), loadComplaints(), loadParcels()]).catch(e => toast(e.message));

  $('rows').onclick = async e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const c = await api('/complaints/' + tr.dataset.id);
    const canWithdraw = c.status === 'Reported';
    $('detailBody').innerHTML = complaintDetailHtml(c) + (canWithdraw ? `<button class="danger" id="withdraw">Withdraw complaint</button>` : '');
    $('detail').classList.add('on');
    if (canWithdraw) $('withdraw').onclick = async () => { if (!confirm('Withdraw this complaint?')) return; await api('/complaints/' + c._id, { method: 'DELETE' }); $('detail').classList.remove('on'); toast('Complaint withdrawn'); refresh(); };
  };
  $('detail').onclick = e => { if (e.target === $('detail')) $('detail').classList.remove('on'); };
  let t; ['q', 'fStatus', 'fModule'].forEach(id => $(id).oninput = () => { clearTimeout(t); t = setTimeout(() => loadComplaints().catch(e => toast(e.message)), 300); });

  // live "AI preview" while the student types
  let pt;
  const preview = () => { clearTimeout(pt); pt = setTimeout(async () => {
    const box = $('aiPreview');
    if ($('desc').value.trim().length < 8) { box.className = 'aibox empty'; return; }
    try { const a = await api('/complaints/analyze', { method: 'POST', body: { description: $('desc').value, area: $('area').value } });
      box.className = 'aibox'; box.innerHTML = `🤖 <b>AI preview:</b> ${esc(a.module === 'FIXORA' ? 'Maintenance' : 'Cleanliness')} → <b>${esc(a.category)}</b> · Priority <b>${esc(a.priority)}</b><br><span class="muted">${esc(a.reason)}</span>`; } catch {} }, 500); };
  $('desc').oninput = preview; $('area').onchange = preview;

  $('reportForm').onsubmit = async e => {
    e.preventDefault(); const msg = $('msg'); msg.className = 'msg'; msg.textContent = ''; $('submitBtn').disabled = true;
    const f = new FormData(); f.append('area', $('area').value); f.append('location', $('loc').value); f.append('description', $('desc').value);
    if ($('img').files[0]) f.append('image', $('img').files[0]);
    try {
      const c = await api('/complaints', { method: 'POST', form: f });
      msg.className = 'msg good';
      msg.textContent = c.duplicateOfSummary ? `✓ Submitted. Someone already reported this problem — your report was linked to it and raised its priority (now ${c.priority}).` : `✓ Submitted as ${c.category} · Priority ${c.priority}`;
      e.target.reset(); $('aiPreview').className = 'aibox empty'; refresh();
    } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
    $('submitBtn').disabled = false;
  };

  initTabs(); refresh();
  connectLive({ 'complaint:updated': () => refresh(), 'parcel:updated': () => refresh() });
}
