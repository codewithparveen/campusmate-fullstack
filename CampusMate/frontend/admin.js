const me = requireLogin('admin');
if (me) {
  renderAppNav(me);
  const charts = {};
  const COLORS = ['#1769e0', '#23a26d', '#f2a93b', '#d93636', '#7a5af8', '#0ea5b7', '#8896a8'];
  function draw(id, type, labels, data, label) {
    if (charts[id]) charts[id].destroy();
    const pie = type === 'doughnut';
    charts[id] = new Chart($(id), { type, data: { labels, datasets: [{ label, data, backgroundColor: pie ? COLORS : '#1769e0', borderColor: '#1769e0', tension: .3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: pie } }, scales: pie ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  }
  async function loadAnalytics() {
    const d = await api('/dashboard/admin'), t = d.totals;
    $('tiles').innerHTML = [['Total complaints', t.complaints, ''], ['Open', t.open, ''], ['Critical (open)', t.critical, 'warn'], ['Resolved', t.resolved, 'good'], ['Avg. resolution (hrs)', t.avgResolutionHours, ''],
      ['Parcels waiting', t.pendingParcels, ''], ['Parcels collected', t.collectedParcels, 'good'], ['Students', t.students, '']].map(([l, v, c]) => `<div class="tile ${c}"><strong>${v}</strong><span>${l}</span></div>`).join('');
    draw('cStatus', 'doughnut', Object.keys(d.byStatus), Object.values(d.byStatus));
    draw('cTrend', 'line', d.trend.map(x => x.date.slice(5)), d.trend.map(x => x.reported), 'Reported');
    charts.cTrend.data.datasets.push({ label: 'Resolved', data: d.trend.map(x => x.resolved), borderColor: '#23a26d', backgroundColor: '#23a26d', tension: .3 });
    charts.cTrend.options.plugins.legend.display = true; charts.cTrend.update();
    draw('cArea', 'bar', Object.keys(d.byArea), Object.values(d.byArea), 'Complaints');
    draw('cCat', 'bar', Object.keys(d.byCategory), Object.values(d.byCategory), 'Complaints');
    $('hot').innerHTML = d.hotspots.length ? d.hotspots.map(h => `<li><b>${esc(h.place)}</b> — ${h.count} open</li>`).join('') : '<li class="muted">No open issues 🎉</li>';
    $('rep').innerHTML = d.repeated.length ? d.repeated.map(r => `<li><b>${esc(r.category)}</b> at ${esc(r.location)} — ${r.reports} reports ${pill(r.priority, 'p')}</li>`).join('') : '<li class="muted">No repeated problems</li>';
  }

  let rows = [], current = null;
  async function loadComplaints() {
    const p = new URLSearchParams();
    [['q', 'q'], ['fStatus', 'status'], ['fPriority', 'priority'], ['fModule', 'module'], ['fArea', 'area']].forEach(([id, k]) => $(id).value && p.set(k, $(id).value));
    rows = (await api('/complaints?' + p + '&limit=100')).items;
    $('rows').innerHTML = rows.length ? rows.map(c => `<tr class="click" data-id="${c._id}"><td><b>${esc(c.category)}</b><br><span class="muted">${esc(c.module)}${c.reportCount > 1 ? ' · 👥 ' + c.reportCount : ''}</span></td><td>${esc(c.area)}<br><span class="muted">${esc(c.location)}</span></td><td>${esc(c.userId?.name || '-')}<br><span class="muted">${esc(c.userId?.studentId || '')}</span></td><td>${pill(c.priority, 'p')}</td><td>${pill(c.status, 's')}</td><td>${fmtDate(c.createdAt)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">No complaints match.</td></tr>';
  }
  $('rows').onclick = async e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    current = await api('/complaints/' + tr.dataset.id);
    $('detailBody').innerHTML = complaintDetailHtml(current) + `<p class="muted">Reported by ${esc(current.userId?.name)} (${esc(current.userId?.studentId || current.userId?.email)})</p>`;
    $('uStatus').value = current.status; $('uPriority').value = current.priority; $('uAssigned').value = current.assignedTo || ''; $('uNote').value = '';
    $('detail').classList.add('on');
  };
  $('detail').onclick = e => { if (e.target === $('detail')) $('detail').classList.remove('on'); };
  $('updForm').onsubmit = async e => {
    e.preventDefault();
    try { await api('/complaints/' + current._id, { method: 'PUT', body: { status: $('uStatus').value, priority: $('uPriority').value, assignedTo: $('uAssigned').value, adminNote: $('uNote').value } });
      $('detail').classList.remove('on'); toast('Updated — student notified'); loadComplaints(); loadAnalytics(); } catch (err) { toast(err.message); }
  };
  $('delBtn').onclick = async () => { if (!confirm('Delete this complaint permanently?')) return; await api('/complaints/' + current._id, { method: 'DELETE' }); $('detail').classList.remove('on'); loadComplaints(); loadAnalytics(); };
  let t; ['q', 'fStatus', 'fPriority', 'fModule', 'fArea'].forEach(id => $(id).oninput = () => { clearTimeout(t); t = setTimeout(() => loadComplaints().catch(e => toast(e.message)), 300); });

  /* ----- parcels ----- */
  async function loadParcels() {
    const p = new URLSearchParams(); if ($('pq').value) p.set('q', $('pq').value); if ($('pStatus').value) p.set('status', $('pStatus').value);
    const { items } = await api('/parcels?' + p);
    $('pRows').innerHTML = items.length ? items.map(x => `<tr><td><b>${esc(x.parcelName)}</b><br><span class="muted">${esc(x.courierName)}${x.trackingNumber ? ' · ' + esc(x.trackingNumber) : ''}</span></td>
      <td>${esc(x.studentId?.name || '-')}<br><span class="muted">${esc(x.studentId?.studentId || '')} ${esc(x.studentId?.hostelBlock || '')} ${esc(x.studentId?.roomNo || '')}</span></td><td>${pill(x.status, 's')}</td>
      <td>${x.status === 'Ready for Pickup' ? `<div style="display:flex;gap:6px"><input style="width:110px;padding:8px;border:1px solid #d6e0ed;border-radius:8px" maxlength="6" inputmode="numeric" placeholder="6-digit OTP" id="otp-${x._id}"><button class="sm ok" data-verify="${x._id}">Verify</button></div>` : `<span class="muted">Collected ${fmtDate(x.collectedDate)}</span>`}</td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">No parcels yet.</td></tr>';
  }
  $('pRows').onclick = async e => {
    const id = e.target.dataset.verify; if (!id) return;
    try { await api(`/parcels/${id}/verify-otp`, { method: 'PUT', body: { otp: $('otp-' + id).value } }); toast('✅ OTP correct — parcel handed over'); loadParcels(); loadAnalytics(); } catch (err) { toast('❌ ' + err.message); }
  };
  let st; $('pStudent').oninput = () => { clearTimeout(st); st = setTimeout(async () => {
    if ($('pStudent').value.length < 2) return;
    const { items } = await api('/users/students?q=' + encodeURIComponent($('pStudent').value)).catch(() => ({ items: [] }));
    $('studentList').innerHTML = items.map(s => `<option value="${esc(s.studentId || s.email)}">${esc(s.name)} · ${esc(s.hostelBlock || '')} ${esc(s.roomNo || '')}</option>`).join(''); }, 250); };
  $('parcelForm').onsubmit = async e => {
    e.preventDefault(); const m = $('pMsg'); m.className = 'msg';
    try { const p = await api('/parcels', { method: 'POST', body: { student: $('pStudent').value, parcelName: $('pName').value, courierName: $('pCourier').value, trackingNumber: $('pTrack').value } });
      m.className = 'msg good'; m.textContent = `✓ Registered for ${p.studentId.name}. The student can see the OTP in their dashboard.`; e.target.reset(); loadParcels(); loadAnalytics();
    } catch (err) { m.className = 'msg err'; m.textContent = err.message; }
  };
  let pt; ['pq', 'pStatus'].forEach(id => $(id).oninput = () => { clearTimeout(pt); pt = setTimeout(() => loadParcels().catch(e => toast(e.message)), 300); });

  const refreshAll = () => Promise.all([loadAnalytics(), loadComplaints(), loadParcels()]).catch(e => toast(e.message));
  initTabs(); refreshAll();
  connectLive({ 'complaint:new': () => { toast('🆕 New complaint received'); refreshAll(); }, 'complaint:updated': refreshAll, 'complaint:deleted': refreshAll });
}
