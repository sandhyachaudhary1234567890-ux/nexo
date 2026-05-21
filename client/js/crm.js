// js/crm.js — CRM Kanban + Contacts + Deals

let _currentPipeline = null;

async function initCRM() {
  try {
    const [{ data: pipes }, { data: contacts }] = await Promise.all([
      api.get('/crm/pipelines'),
      api.get('/crm/contacts?limit=50')
    ]);

    if (pipes.data.length) {
      _currentPipeline = pipes.data[0];
      const deals = (await api.get(`/crm/deals?pipeline=${_currentPipeline._id}`)).data.data;
      renderKanban(_currentPipeline, deals);
    } else {
      document.getElementById('kanban-board').innerHTML =
        `<div class="empty-state"><div class="empty-icon"><i class="fas fa-columns"></i></div>
         <div class="empty-title">No pipeline yet</div>
         <button class="btn btn-primary mt-2" onclick="createDefaultPipeline()">Create Pipeline</button></div>`;
    }

    renderContacts(contacts.data);
  } catch (err) {
    console.error('[CRM] Error:', err);
    showToast('Failed to load CRM data', 'error');
  }
}

function renderKanban(pipeline, deals) {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  const stages = pipeline.stages.sort((a, b) => a.order - b.order);
  const byStage = {};
  stages.forEach(s => { byStage[s.name] = []; });
  deals.forEach(d => { if (byStage[d.stage]) byStage[d.stage].push(d); });

  board.innerHTML = stages.map(stage => `
    <div class="kanban-col" data-stage="${escHtml(stage.name)}"
         ondragover="event.preventDefault(); this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="dropDeal(event, '${escHtml(stage.name)}')">
      <div class="kanban-col-header">
        <div class="flex items-center gap-1">
          <div style="width:10px;height:10px;border-radius:50%;background:${stage.color || '#6366f1'}"></div>
          <span class="card-title">${escHtml(stage.name)}</span>
          <span class="badge badge-gray">${byStage[stage.name].length}</span>
        </div>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="openDealModal('${stage.name}')">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      <div class="kanban-col-body" id="stage-${escHtml(stage.name)}">
        ${byStage[stage.name].map(deal => renderDealCard(deal)).join('')}
      </div>
    </div>`).join('');
}

function renderDealCard(deal) {
  return `
    <div class="kanban-card" draggable="true" data-id="${deal._id}"
         ondragstart="dragDeal(event, '${deal._id}')">
      <div class="font-semibold text-sm mb-1">${escHtml(deal.title)}</div>
      <div class="flex items-center justify-between">
        <span class="text-xs text-dim">${deal.contact?.name || '—'}</span>
        <span class="badge badge-green" style="font-size:0.7rem">$${(deal.value || 0).toLocaleString()}</span>
      </div>
      <div class="progress mt-1" style="height:3px">
        <div class="progress-bar" style="width:${deal.probability || 0}%"></div>
      </div>
    </div>`;
}

let _draggingDealId = null;
function dragDeal(e, id) {
  _draggingDealId = id;
  e.currentTarget.classList.add('dragging');
}

async function dropDeal(e, newStage) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!_draggingDealId) return;
  try {
    await api.patch(`/crm/deals/${_draggingDealId}`, { stage: newStage });
    await initCRM();
  } catch { showToast('Failed to move deal', 'error'); }
  _draggingDealId = null;
}

async function createDefaultPipeline() {
  try {
    await api.post('/crm/pipelines', { name: 'Sales Pipeline' });
    await initCRM();
  } catch { showToast('Failed to create pipeline', 'error'); }
}

function renderContacts(contacts) {
  const el = document.getElementById('contacts-list');
  if (!el) return;
  if (!contacts.length) {
    el.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon"><i class="fas fa-user-friends"></i></div><div class="empty-title">No contacts yet</div></div></td></tr>`;
    return;
  }
  el.innerHTML = contacts.map(c => `
    <tr>
      <td>
        <div class="flex items-center gap-1">
          <div class="user-avatar" style="width:28px;height:28px;font-size:0.65rem">${(c.name||'?')[0].toUpperCase()}</div>
          <div>
            <div class="font-semibold text-sm">${escHtml(c.name)}</div>
            <div class="text-xs text-dim">${escHtml(c.position || '')}</div>
          </div>
        </div>
      </td>
      <td class="text-sm">${escHtml(c.company || '—')}</td>
      <td class="text-sm">${escHtml(c.email || '—')}</td>
      <td><span class="badge badge-blue">${c.dealStage || 'lead'}</span></td>
      <td><span class="badge badge-green">$${(c.dealValue || 0).toLocaleString()}</span></td>
    </tr>`).join('');
}

async function createDeal(data) {
  try {
    await api.post('/crm/deals', data);
    await initCRM();
    showToast('Deal created', 'success');
  } catch (err) {
    showToast(err.response?.data?.error || 'Failed to create deal', 'error');
  }
}

function openDealModal(stage = '') {
  const modal = document.getElementById('deal-modal');
  if (modal) {
    document.getElementById('deal-stage-input').value = stage;
    modal.classList.add('open');
  }
}

window.initCRM = initCRM;
window.dropDeal = dropDeal;
window.dragDeal = dragDeal;
window.createDeal = createDeal;
window.openDealModal = openDealModal;
window.createDefaultPipeline = createDefaultPipeline;
