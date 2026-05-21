// js/outreach.js — Campaign & Template management

async function initOutreach() {
  try {
    const [{ data: camps }, { data: templates }] = await Promise.all([
      api.get('/campaigns?limit=20'),
      api.get('/templates?limit=20')
    ]);
    renderCampaigns(camps.data);
    renderTemplates(templates.data);
  } catch (err) {
    console.error('[Outreach] Error:', err);
    showToast('Failed to load outreach data', 'error');
  }
}

function renderCampaigns(campaigns) {
  const el = document.getElementById('campaigns-list');
  if (!el) return;
  if (!campaigns.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-paper-plane"></i></div>
      <div class="empty-title">No campaigns yet</div>
      <button class="btn btn-primary mt-2" onclick="openCampaignModal()"><i class="fas fa-plus"></i> New Campaign</button></div>`;
    return;
  }
  el.innerHTML = campaigns.map(c => `
    <div class="card mb-2" id="campaign-${c._id}">
      <div class="flex items-center justify-between mb-2">
        <div>
          <div class="font-semibold">${escHtml(c.name)}</div>
          <div class="text-xs text-dim">${c.leads?.length || 0} leads · ${c.type}</div>
        </div>
        <div class="flex gap-1">
          ${statusBadgeHTML(c.status)}
          ${c.status === 'draft' || c.status === 'paused' ? `
            <button class="btn btn-sm btn-primary" onclick="sendCampaign('${c._id}')">
              <i class="fas fa-paper-plane"></i> Send
            </button>` : ''}
          ${c.status === 'running' ? `
            <button class="btn btn-sm btn-secondary" onclick="pauseCampaign('${c._id}')">
              <i class="fas fa-pause"></i> Pause
            </button>` : ''}
        </div>
      </div>
      <div class="grid-4" style="gap:0.5rem">
        ${[['Sent', c.stats?.sent || 0, 'blue'], ['Opened', c.stats?.opened || 0, 'purple'],
           ['Clicked', c.stats?.clicked || 0, 'green'], ['Failed', c.stats?.failed || 0, 'red']]
          .map(([l,v,t]) => `
            <div class="card card-sm" style="text-align:center;padding:0.75rem">
              <div class="stat-value" style="font-size:1.2rem;color:var(--${t === 'blue' ? 'blue-light' : t})">${v}</div>
              <div class="text-xs text-dim">${l}</div>
            </div>`).join('')}
      </div>
    </div>`).join('');
}

function statusBadgeHTML(status) {
  const map = { draft:'badge-gray', running:'badge-green', paused:'badge-amber', completed:'badge-blue', scheduled:'badge-purple' };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}

function renderTemplates(templates) {
  const el = document.getElementById('templates-list');
  if (!el) return;
  if (!templates.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-file-alt"></i></div>
      <div class="empty-title">No templates yet</div>
      <button class="btn btn-primary mt-2" onclick="openTemplateModal()"><i class="fas fa-plus"></i> New Template</button></div>`;
    return;
  }
  el.innerHTML = templates.map(t => `
    <div class="card card-sm mb-2 flex items-center justify-between">
      <div>
        <div class="font-semibold text-sm">${escHtml(t.name)}</div>
        <div class="text-xs text-dim">${escHtml(t.subject)} · ${t.category}</div>
      </div>
      <div class="flex gap-1">
        ${t.isPublic ? '<span class="badge badge-green">Public</span>' : ''}
        <button class="btn btn-sm btn-ghost" onclick="editTemplate('${t._id}')"><i class="fas fa-pen"></i></button>
        <button class="btn btn-sm btn-ghost" onclick="deleteTemplate('${t._id}', this)"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}

async function sendCampaign(id) {
  try {
    await api.post(`/campaigns/${id}/send`);
    showToast('Campaign started!', 'success');
    await initOutreach();
  } catch (err) { showToast(err.response?.data?.error || 'Failed to send', 'error'); }
}

async function pauseCampaign(id) {
  try {
    await api.post(`/campaigns/${id}/pause`);
    showToast('Campaign paused', 'info');
    await initOutreach();
  } catch { showToast('Failed to pause', 'error'); }
}

async function createCampaign(data) {
  try {
    await api.post('/campaigns', data);
    showToast('Campaign created', 'success');
    document.getElementById('campaign-modal')?.classList.remove('open');
    await initOutreach();
  } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
}

async function createTemplate(data) {
  try {
    await api.post('/templates', data);
    showToast('Template saved', 'success');
    document.getElementById('template-modal')?.classList.remove('open');
    await initOutreach();
  } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
}

async function deleteTemplate(id, btn) {
  if (!confirm('Delete template?')) return;
  try {
    await api.delete(`/templates/${id}`);
    btn.closest('.card')?.remove();
    showToast('Deleted', 'success');
  } catch { showToast('Delete failed', 'error'); }
}

function openCampaignModal() {
  document.getElementById('campaign-modal')?.classList.add('open');
}

function openTemplateModal() {
  document.getElementById('template-modal')?.classList.add('open');
}

// Real-time campaign stats update
window.addEventListener('nexo:campaign-update', ({ detail }) => {
  const card = document.getElementById(`campaign-${detail.campaignId}`);
  if (!card) return;
  const stats = card.querySelectorAll('.stat-value');
  if (stats[0]) stats[0].textContent = detail.sent;
  if (stats[3]) stats[3].textContent = detail.failed;
});

window.initOutreach = initOutreach;
window.sendCampaign = sendCampaign;
window.pauseCampaign = pauseCampaign;
window.createCampaign = createCampaign;
window.createTemplate = createTemplate;
window.deleteTemplate = deleteTemplate;
window.openCampaignModal = openCampaignModal;
window.openTemplateModal = openTemplateModal;
