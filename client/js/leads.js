// js/leads.js — Lead management: list, search, filter, import, enrich

let _leadsPage = 1;
let _leadsTotal = 0;
let _leadsFilters = {};
let _leadsLoading = false;
let _searchTimer = null;

async function initLeads() {
  _leadsPage = 1;
  _leadsFilters = {};
  await loadLeads();
  initLeadEvents();
}

async function loadLeads(reset = true) {
  if (_leadsLoading) return;
  if (reset) { _leadsPage = 1; }
  _leadsLoading = true;

  const params = new URLSearchParams({
    page: _leadsPage, limit: 20,
    ..._leadsFilters
  });

  try {
    const { data } = await api.get(`/leads?${params}`);
    _leadsTotal = data.pagination.total;

    const container = document.getElementById('leads-list');
    if (!container) return;

    if (reset) container.innerHTML = '';

    if (!data.data.length && reset) {
      container.innerHTML = `
        <tr><td colspan="7">
          <div class="empty-state">
            <div class="empty-icon"><i class="fas fa-database"></i></div>
            <div class="empty-title">No leads yet</div>
            <div class="empty-desc">Import a CSV or add leads manually to get started.</div>
          </div>
        </td></tr>`;
    } else {
      data.data.forEach(lead => container.insertAdjacentHTML('beforeend', renderLeadRow(lead)));
    }

    const countEl = document.getElementById('leads-count');
    if (countEl) countEl.textContent = `${_leadsTotal} leads`;

    _leadsPage++;
  } catch (err) {
    console.error('[Leads] Load error:', err);
    showToast('Failed to load leads', 'error');
  } finally {
    _leadsLoading = false;
  }
}

function renderLeadRow(lead) {
  const score = lead.score || 0;
  const scoreClass = score >= 70 ? 'score-high' : score >= 40 ? 'score-medium' : 'score-low';
  const statusBadge = {
    new: 'badge-blue', contacted: 'badge-purple', qualified: 'badge-green',
    converted: 'badge-green', rejected: 'badge-red'
  }[lead.status] || 'badge-gray';

  return `
    <tr class="lead-row pointer" data-id="${lead._id}" onclick="showLeadDetail('${lead._id}')">
      <td>
        <div class="flex items-center gap-1">
          <div class="user-avatar" style="background:linear-gradient(135deg,#2563eb,#7c3aed)">
            ${(lead.companyName || '?')[0].toUpperCase()}
          </div>
          <div>
            <div class="font-semibold text-sm" style="color:var(--text)">${escHtml(lead.companyName)}</div>
            <div class="text-xs text-dim">${escHtml(lead.website || '')}</div>
          </div>
        </div>
      </td>
      <td><span class="text-sm">${escHtml(lead.email || '—')}</span></td>
      <td><span class="text-sm">${escHtml(lead.industry || '—')}</span></td>
      <td><span class="badge ${statusBadge}">${lead.status}</span></td>
      <td><span class="badge badge-gray">${lead.source}</span></td>
      <td><div class="score-ring ${scoreClass}">${score}</div></td>
      <td>
        <div class="flex gap-1">
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); enrichLead('${lead._id}')">
            <i class="fas fa-magic"></i> Enrich
          </button>
          <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); deleteLead('${lead._id}', this)">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
}

async function showLeadDetail(id) {
  try {
    const { data } = await api.get(`/leads/${id}`);
    const lead = data.data;
    const panel = document.getElementById('lead-detail-panel');
    if (!panel) return;
    panel.classList.add('open');
    panel.innerHTML = renderLeadDetail(lead);
  } catch (err) {
    showToast('Failed to load lead detail', 'error');
  }
}

function renderLeadDetail(lead) {
  const enriched = lead.enrichmentData;
  return `
    <div style="padding:1.5rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <h3>${escHtml(lead.companyName)}</h3>
      <button class="btn btn-sm btn-ghost" onclick="document.getElementById('lead-detail-panel').classList.remove('open')">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div style="padding:1.5rem;overflow-y:auto;flex:1">
      <div class="grid-2 mb-2">
        <div class="card card-sm">
          <div class="text-xs text-dim mb-1">Score</div>
          <div class="stat-value" style="font-size:1.4rem">${lead.score || 0}</div>
        </div>
        <div class="card card-sm">
          <div class="text-xs text-dim mb-1">Status</div>
          <span class="badge badge-blue">${lead.status}</span>
        </div>
      </div>
      <div class="card card-sm mb-2">
        <table style="width:100%">
          ${[
            ['Email', lead.email],
            ['Phone', lead.phone],
            ['Website', lead.website],
            ['Industry', lead.industry],
            ['Country', lead.country],
            ['Source', lead.source],
            ['Created', new Date(lead.createdAt).toLocaleDateString()]
          ].map(([k,v]) => v ? `<tr><td class="text-dim text-xs" style="padding:0.4rem 0">${k}</td><td class="text-sm">${escHtml(v)}</td></tr>` : '').join('')}
        </table>
      </div>
      ${enriched?.description ? `
        <div class="card card-sm mb-2">
          <div class="card-title mb-1">About</div>
          <p class="text-sm">${escHtml(enriched.description)}</p>
          ${enriched.employees ? `<div class="text-xs text-dim mt-1">${enriched.employees.toLocaleString()} employees</div>` : ''}
        </div>` : ''}
      <div class="flex gap-1">
        <button class="btn btn-primary btn-sm" onclick="enrichLead('${lead._id}')">
          <i class="fas fa-magic"></i> Enrich with AI
        </button>
        <button class="btn btn-secondary btn-sm" onclick="showEmailModal('${lead._id}')">
          <i class="fas fa-envelope"></i> Draft Email
        </button>
      </div>
    </div>`;
}

async function enrichLead(id) {
  try {
    showToast('Enrichment queued...', 'info');
    await api.post(`/leads/${id}/enrich`);
    showToast('Enrichment started — you\'ll be notified when done', 'success');
  } catch { showToast('Enrichment failed', 'error'); }
}

async function deleteLead(id, btn) {
  if (!confirm('Delete this lead?')) return;
  try {
    await api.delete(`/leads/${id}`);
    btn.closest('tr')?.remove();
    showToast('Lead deleted', 'success');
  } catch { showToast('Delete failed', 'error'); }
}

async function importCSV(file) {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await api.post('/leads/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    showToast(`Imported ${data.data.imported} leads`, 'success');
    await loadLeads();
  } catch (err) {
    showToast(err.response?.data?.error || 'Import failed', 'error');
  }
}

function initLeadEvents() {
  const searchInput = document.getElementById('lead-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        if (e.target.value) _leadsFilters.search = e.target.value;
        else delete _leadsFilters.search;
        loadLeads();
      }, 350);
    });
  }

  // Infinite scroll
  const tableWrap = document.getElementById('leads-table-wrap');
  if (tableWrap) {
    const sentinel = document.getElementById('leads-sentinel');
    if (sentinel) {
      new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && _leadsPage * 20 < _leadsTotal) {
          loadLeads(false);
        }
      }, { root: tableWrap, threshold: 0.5 }).observe(sentinel);
    }
  }

  // CSV drop zone
  const dropZone = document.getElementById('csv-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file?.name.endsWith('.csv')) importCSV(file);
      else showToast('Please drop a CSV file', 'error');
    });
  }

  // filter chips
  document.querySelectorAll('[data-lead-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      const { leadFilter: key, leadFilterVal: val } = chip.dataset;
      document.querySelectorAll(`[data-lead-filter="${key}"]`).forEach(c => c.classList.remove('active'));
      if (_leadsFilters[key] === val) { delete _leadsFilters[key]; }
      else { _leadsFilters[key] = val; chip.classList.add('active'); }
      loadLeads();
    });
  });

  // Listen for enrichment events
  window.addEventListener('nexo:lead-enriched', () => loadLeads());
}

window.initLeads = initLeads;
window.enrichLead = enrichLead;
window.deleteLead = deleteLead;
window.showLeadDetail = showLeadDetail;
window.importCSV = importCSV;
