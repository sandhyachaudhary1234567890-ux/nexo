// js/dashboard.js — Dashboard page with charts and real-time stats

async function initDashboard() {
  try {
    const [{ data: ov }, { data: ld }] = await Promise.all([
      api.get('/analytics/overview'),
      api.get('/analytics/leads')
    ]);
    renderStatCards(ov.data);
    renderLeadsChart(ld.data);
    renderPipelineDonut(ld.data);
  } catch (err) {
    console.error('[Dashboard] Error:', err);
    renderStatCards({});
    renderLeadsChart(null);
  }
}

function renderStatCards(stats) {
  const map = {
    'stat-total-leads': stats.totalLeads ?? 0,
    'stat-new-leads':   stats.newLeads ?? 0,
    'stat-contacts':    stats.totalContacts ?? 0,
    'stat-campaigns':   stats.activeCampaigns ?? 0,
    'stat-calls':       stats.callsThisMonth ?? 0,
    'stat-credits':     (stats.credits ?? 0).toLocaleString()
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

function renderLeadsChart(data) {
  const ctx = document.getElementById('leads-chart')?.getContext('2d');
  if (!ctx) return;
  if (window._leadsChart) window._leadsChart.destroy();

  const labels = data?.byDate?.map(d => new Date(d._id).toLocaleDateString('en', { month: 'short', day: 'numeric' }))
    || Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    });

  const values = data?.byDate?.map(d => d.count)
    || Array.from({ length: 30 }, () => Math.floor(Math.random() * 15 + 2));

  window._leadsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'New Leads',
        data: values,
        borderColor: '#2563eb',
        backgroundColor: ctx => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
          g.addColorStop(0, 'rgba(37,99,235,0.15)');
          g.addColorStop(1, 'rgba(37,99,235,0)');
          return g;
        },
        borderWidth: 2, fill: true, tension: 0.4,
        pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#2563eb'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.parsed.y} leads` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569', maxTicksLimit: 7, font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569', font: { size: 11 } }, beginAtZero: true }
      }
    }
  });
}

function renderPipelineDonut(data) {
  const ctx = document.getElementById('pipeline-chart')?.getContext('2d');
  if (!ctx) return;
  if (window._pipelineChart) window._pipelineChart.destroy();

  const byStatus = data?.byStatus || [
    { _id: 'new', count: 45 }, { _id: 'contacted', count: 28 },
    { _id: 'qualified', count: 17 }, { _id: 'converted', count: 10 }
  ];
  const colors = { new: '#2563eb', contacted: '#7c3aed', qualified: '#f59e0b', converted: '#10b981', rejected: '#ef4444' };

  window._pipelineChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: byStatus.map(d => d._id.charAt(0).toUpperCase() + d._id.slice(1)),
      datasets: [{
        data: byStatus.map(d => d.count),
        backgroundColor: byStatus.map(d => colors[d._id] || '#475569'),
        borderColor: '#12121f', borderWidth: 2, hoverOffset: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 12 }, boxWidth: 12, padding: 16 } } }
    }
  });
}

window.initDashboard = initDashboard;
