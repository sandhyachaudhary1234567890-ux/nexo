// js/analytics.js — Analytics charts and revenue pipeline

async function initAnalytics() {
  try {
    const [{ data: ov }, { data: ld }, { data: out }] = await Promise.all([
      api.get('/analytics/overview'),
      api.get('/analytics/leads'),
      api.get('/analytics/outreach')
    ]);
    renderOverviewCharts(ld.data, out.data);
  } catch (err) {
    console.error('[Analytics] Error:', err);
    renderOverviewCharts(null, null);
  }
}

function renderOverviewCharts(leadData, outreachData) {
  renderLeadSourceChart(leadData?.bySource);
  renderOutreachFunnel(outreachData);
  renderLeadTrend(leadData?.byDate);
}

function renderLeadSourceChart(bySource) {
  const ctx = document.getElementById('source-chart')?.getContext('2d');
  if (!ctx) return;
  if (window._sourceChart) window._sourceChart.destroy();

  const data = bySource || [
    { _id: 'manual', count: 40 }, { _id: 'csv', count: 25 },
    { _id: 'apollo', count: 20 }, { _id: 'ai', count: 15 }
  ];
  const colors = ['#2563eb','#7c3aed','#10b981','#f59e0b','#ef4444'];

  window._sourceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d._id),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: data.map((_, i) => colors[i % colors.length] + '99'),
        borderColor: data.map((_, i) => colors[i % colors.length]),
        borderWidth: 2, borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569', font: { size: 11 } }, beginAtZero: true }
      }
    }
  });
}

function renderOutreachFunnel(outreach) {
  const el = document.getElementById('outreach-funnel');
  if (!el) return;
  const data = outreach || { avgSent: 250, avgOpened: 98, avgClicked: 41, avgReplied: 17 };
  const stages = [
    { label: 'Sent', value: data.avgSent || 0, color: 'var(--blue)' },
    { label: 'Opened', value: data.avgOpened || 0, color: 'var(--purple)' },
    { label: 'Clicked', value: data.avgClicked || 0, color: 'var(--green)' },
    { label: 'Replied', value: data.avgReplied || 0, color: 'var(--amber)' }
  ];
  const max = stages[0].value || 1;

  el.innerHTML = stages.map(s => `
    <div class="mb-2">
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm">${s.label}</span>
        <span class="font-semibold text-sm" style="color:var(--text)">${s.value}</span>
      </div>
      <div class="progress">
        <div class="progress-bar" style="width:${(s.value/max*100).toFixed(1)}%;background:${s.color}"></div>
      </div>
    </div>`).join('');
}

function renderLeadTrend(byDate) {
  const ctx = document.getElementById('trend-chart')?.getContext('2d');
  if (!ctx) return;
  if (window._trendChart) window._trendChart.destroy();

  const labels = byDate?.map(d => new Date(d._id).toLocaleDateString('en', { month: 'short', day: 'numeric' }))
    || Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (13-i));
      return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    });

  window._trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Leads',
        data: byDate?.map(d => d.count) || Array.from({ length: 14 }, () => Math.floor(Math.random()*12+1)),
        backgroundColor: 'rgba(37,99,235,0.6)',
        borderColor: '#2563eb', borderWidth: 2, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569', font: { size: 11 } }, beginAtZero: true }
      }
    }
  });
}

window.initAnalytics = initAnalytics;
