(function () {
  'use strict';

  const ARTICLE_ID = window.ARTICLE_ID;
  const chartLoading = document.getElementById('chart-loading');
  const timeRangeSelect = document.getElementById('time-range');
  let chart = null;

  function getHoursAgo(range) {
    if (range === '24h') return 24;
    if (range === '7d') return 24 * 7;
    if (range === '30d') return 24 * 30;
    return null; // all
  }

  async function loadAndRender() {
    chartLoading.classList.remove('hidden');
    try {
      const res = await fetch(`/editor/api/analytics/${ARTICLE_ID}`);
      if (!res.ok) throw new Error('Failed to load analytics');
      const { stats } = await res.json();

      const range = timeRangeSelect.value;
      const hoursAgo = getHoursAgo(range);
      const cutoff = hoursAgo ? new Date(Date.now() - hoursAgo * 3600 * 1000) : null;

      const filtered = cutoff
        ? stats.filter(s => new Date(s.hour) >= cutoff)
        : stats;

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

      // Build vertical-line annotations for publish events
      const annotations = {};
      publishPoints.forEach((p, i) => {
        annotations[`pub_${i}`] = {
          type: 'line',
          xMin: p.idx,
          xMax: p.idx,
          borderColor: '#E74C3C',
          borderWidth: 2,
          borderDash: [4, 4],
          label: {
            content: '📢 Published',
            enabled: true,
            position: 'start',
            backgroundColor: '#E74C3C',
            color: '#fff',
            font: { size: 11, family: 'Arial' },
          },
        };
      });

      if (chart) chart.destroy();

      const ctx = document.getElementById('views-chart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Views per hour',
            data: counts,
            borderColor: '#4A90D9',
            backgroundColor: 'rgba(74,144,217,0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: counts.map((_, i) => publishPoints.some(p => p.idx === i) ? 6 : 2),
            pointBackgroundColor: counts.map((_, i) =>
              publishPoints.some(p => p.idx === i) ? '#E74C3C' : '#4A90D9'
            ),
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
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
            ctx.strokeStyle = '#E74C3C';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.stroke();
            ctx.restore();
          });
        },
      };
      Chart.register(publishPlugin);

      chartLoading.classList.add('hidden');
    } catch (err) {
      chartLoading.textContent = 'Failed to load analytics data.';
    }
  }

  timeRangeSelect.addEventListener('change', loadAndRender);
  loadAndRender();
})();
