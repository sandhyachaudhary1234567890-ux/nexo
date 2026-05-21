// js/automations.js — Automation rules management

async function initAutomations() {
  try {
    const { data } = await api.get('/automations?limit=50');
    renderAutomations(data.data);
  } catch (err) {
    console.error('[Automations] Error:', err);
    showToast('Failed to load automations', 'error');
  }
}

function renderAutomations(automations) {
  const el = document.getElementById('automations-list');
  if (!el) return;

  if (!automations.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><i class="fas fa-robot"></i></div>
      <div class="empty-title">No automations yet</div>
      <div class="empty-desc">Create rules to automatically send emails, update leads, and more when events happen.</div>
      <button class="btn btn-primary mt-2" onclick="openAutomationModal()"><i class="fas fa-plus"></i> Create Automation</button>
    </div>`;
    return;
  }

  el.innerHTML = automations.map(a => `
    <div class="card mb-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="stat-icon ${a.isActive ? 'green' : 'gray'}" style="margin:0;width:36px;height:36px">
            <i class="fas fa-bolt"></i>
          </div>
          <div>
            <div class="font-semibold">${escHtml(a.name)}</div>
            <div class="text-xs text-dim">
              Trigger: <strong>${a.trigger.replace(/_/g,' ')}</strong> ·
              ${a.actions.length} action${a.actions.length !== 1 ? 's' : ''} ·
              Ran ${a.runCount || 0} times
              ${a.lastRun ? ' · Last: ' + new Date(a.lastRun).toLocaleDateString() : ''}
            </div>
          </div>
        </div>
        <div class="flex gap-1 items-center">
          <label class="flex items-center gap-1" style="cursor:pointer;font-size:0.8rem;color:var(--text2)">
            <input type="checkbox" id="auto-toggle-${a._id}" ${a.isActive ? 'checked' : ''}
              onchange="toggleAutomation('${a._id}', this.checked)"
              style="width:16px;height:16px;cursor:pointer"> Active
          </label>
          <button class="btn btn-sm btn-secondary" onclick="triggerAutomation('${a._id}')">
            <i class="fas fa-play"></i> Run
          </button>
          <button class="btn btn-sm btn-ghost" onclick="deleteAutomation('${a._id}', this)">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      ${a.conditions?.length ? `
        <div class="mt-2 flex gap-1 flex-wrap">
          ${a.conditions.map(c => `
            <span class="chip">${escHtml(c.field)} ${c.operator} <strong>${escHtml(String(c.value))}</strong></span>`).join('')}
        </div>` : ''}
    </div>`).join('');
}

async function toggleAutomation(id, active) {
  try {
    await api.patch(`/automations/${id}/toggle`);
    showToast(active ? 'Automation activated' : 'Automation deactivated', 'info');
  } catch {
    showToast('Failed to toggle', 'error');
    document.getElementById(`auto-toggle-${id}`).checked = !active;
  }
}

async function triggerAutomation(id) {
  try {
    await api.post(`/automations/${id}/trigger`, {});
    showToast('Automation queued for execution', 'success');
  } catch { showToast('Failed to trigger', 'error'); }
}

async function deleteAutomation(id, btn) {
  if (!confirm('Delete this automation?')) return;
  try {
    await api.delete(`/automations/${id}`);
    btn.closest('.card')?.remove();
    showToast('Automation deleted', 'success');
  } catch { showToast('Delete failed', 'error'); }
}

async function createAutomation(data) {
  try {
    await api.post('/automations', data);
    showToast('Automation created', 'success');
    document.getElementById('automation-modal')?.classList.remove('open');
    await initAutomations();
  } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
}

function openAutomationModal() {
  document.getElementById('automation-modal')?.classList.add('open');
}

window.initAutomations = initAutomations;
window.toggleAutomation = toggleAutomation;
window.triggerAutomation = triggerAutomation;
window.deleteAutomation = deleteAutomation;
window.createAutomation = createAutomation;
window.openAutomationModal = openAutomationModal;
