(function () {
  'use strict';

  const ARTICLE_ID = window.ARTICLE_ID;
  const chartLoading = document.getElementById('chart-loading');
  const timeRangeSelect = document.getElementById('time-range');
  const totalViewsStat = document.getElementById('total-views-stat');
  let chart = null;
  let requestId = 0;
  let activeRequest = null;

  function getHoursAgo(range) {
    if (range === '24h') return 24;
    if (range === '7d') return 24 * 7;
    if (range === '30d') return 24 * 30;
    return null; // all
  }

  async function loadAndRender() {
    const id = ++requestId;
    if (activeRequest) activeRequest.abort();
    activeRequest = new AbortController();
    const range = timeRangeSelect.value;
    chartLoading.textContent = 'Loading chart data…';
    chartLoading.classList.remove('hidden');
    try {
      const res = await fetch(`/editor/api/analytics/${ARTICLE_ID}`, { signal: activeRequest.signal });
      if (!res.ok) throw new Error('Failed to load analytics');
      const { stats } = await res.json();

      if (id !== requestId) return;
      const hoursAgo = getHoursAgo(range);
      const cutoff = hoursAgo ? new Date(Date.now() - hoursAgo * 3600 * 1000) : null;

      // Update total views to match chart data (all-time sum from ViewStat records)
      const allTimeTotal = stats.reduce((sum, s) => sum + (s.count || 0), 0);
      if (totalViewsStat) totalViewsStat.textContent = allTimeTotal;

      const filtered = cutoff
        ? stats.filter(s => new Date(s.hour) >= cutoff)
        : stats;

      if (filtered.length === 0) {
        chartLoading.textContent = 'No view data for the selected time range.';
        if (chart) { chart.destroy(); chart = null; }
        return;
      }

      const labels = filtered.map(s => {
        const d = new Date(s.hour);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      });
      const counts = filtered.map(s => s.count);

      // Collect publish event timestamps
      const publishPoints = [];
      filtered.forEach((s, idx) => {
        if (s.publishEvents && s.publishEvents.length > 0) {
          publishPoints.push({ idx, label: labels[idx], events: s.publishEvents });
        }
      });

      if (chart) chart.destroy();

      // Draw publish event lines manually as chartjs plugin
      const publishPlugin = {
        id: 'publishLines',
        afterDraw(chart) {
          const ctx = chart.ctx;
          publishPoints.forEach(p => {
            const x = chart.scales.x.getPixelForValue(p.idx);
            const topY = chart.scales.y.top;
            const bottomY = chart.scales.y.bottom;
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#b45b3d';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.stroke();
            ctx.restore();
          });
        },
      };

      const ctx = document.getElementById('views-chart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        plugins: [publishPlugin],
        data: {
          labels,
          datasets: [{
            label: 'Views per hour',
            data: counts,
            borderColor: '#6535b5',
            backgroundColor: 'rgba(101,53,181,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: counts.map((_, i) => publishPoints.some(p => p.idx === i) ? 6 : 2),
            pointBackgroundColor: counts.map((_, i) =>
              publishPoints.some(p => p.idx === i) ? '#b45b3d' : '#6535b5'
            ),
          }],
        },
        options: {
          animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterBody: (items) => {
                  const idx = items[0].dataIndex;
                  const hit = publishPoints.find(p => p.idx === idx);
                  return hit ? ['', '📢 Article published/updated here'] : [];
                },
              },
            },
          },
          scales: {
            x: {
              ticks: {
                maxTicksLimit: 12,
                font: { size: 11, family: 'Arial' },
                color: '#6B7280',
              },
              grid: { color: 'rgba(0,0,0,0.05)' },
            },
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0,
                font: { size: 11, family: 'Arial' },
                color: '#6B7280',
              },
              grid: { color: 'rgba(0,0,0,0.07)' },
              title: { display: true, text: 'Views', font: { size: 12, family: 'Arial' }, color: '#374151' },
            },
          },
        },
      });

      chartLoading.classList.add('hidden');
    } catch (err) {
      if (id !== requestId || err.name === 'AbortError') return;
      if (chart) { chart.destroy(); chart = null; }
      chartLoading.textContent = 'Failed to load analytics data.';
    }
  }

  timeRangeSelect.addEventListener('change', loadAndRender);
  loadAndRender();
})();
