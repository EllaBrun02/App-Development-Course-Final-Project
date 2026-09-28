(function () {
  'use strict';

  const ARTICLE_ID = window.ARTICLE_ID;
  const chartLoading = document.getElementById('chart-loading');
  const timeRangeSelect = document.getElementById('time-range');
  let chart = null;

  const HOUR_MS = 3600 * 1000;

  function getHoursAgo(range) {
    if (range === '24h') return 24;
    if (range === '7d') return 24 * 7;
    if (range === '30d') return 24 * 30;
    return null; // all
  }

  function truncToHour(date) {
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d;
  }

  // Audit #22: the x axis must represent real time. We build a continuous
  // hourly series (missing hours filled with 0 views) so equal distances on
  // the axis always mean equal time, and quiet hours show as zero.
  function buildHourlySeries(stats, cutoff) {
    const byHour = new Map();
    stats.forEach(s => {
      byHour.set(truncToHour(s.hour).getTime(), s);
    });

    const times = [...byHour.keys()].sort((a, b) => a - b);
    if (times.length === 0) return [];

    const start = cutoff ? Math.max(times[0], truncToHour(cutoff).getTime()) : times[0];
    const end = truncToHour(new Date()).getTime();

    const series = [];
    for (let t = start; t <= end; t += HOUR_MS) {
      const s = byHour.get(t);
      series.push({
        time: t,
        count: s ? s.count : 0,
        publishEvents: s && s.publishEvents ? s.publishEvents : [],
      });
    }
    return series;
  }

  function formatHour(t) {
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function loadAndRender() {
    chartLoading.classList.remove('hidden');
    chartLoading.textContent = 'Loading chart data...';
    try {
      const range = timeRangeSelect.value;
      const hoursAgo = getHoursAgo(range);

      // Audit #28: ask the server only for the selected range
      const url = `/editor/api/analytics/${ARTICLE_ID}` + (hoursAgo ? `?hours=${hoursAgo}` : '');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load analytics');
      const { stats } = await res.json();

      const cutoff = hoursAgo ? new Date(Date.now() - hoursAgo * HOUR_MS) : null;
      const series = buildHourlySeries(stats, cutoff);

      const labels = series.map(s => formatHour(s.time));
      const counts = series.map(s => s.count);

      // Publish/update markers. Audit #22: several events in the same hour
      // are kept distinct — the marker label carries the count and the
      // tooltip lists every event time.
      const publishPoints = [];
      series.forEach((s, idx) => {
        if (s.publishEvents.length > 0) {
          publishPoints.push({ idx, events: s.publishEvents });
        }
      });

      if (chart) chart.destroy();

      // Audit #21: the marker plugin is passed per chart instance (never
      // registered globally), and reads its points from the chart's own
      // config — so switching the time range can never leave lines drawn
      // at positions belonging to the previous range.
      const publishPlugin = {
        id: 'publishLines',
        afterDraw(c) {
          const points = c.config.options.publishPoints || [];
          const ctx = c.ctx;
          points.forEach(p => {
            const x = c.scales.x.getPixelForValue(p.idx);
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#E74C3C';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, c.scales.y.top);
            ctx.lineTo(x, c.scales.y.bottom);
            ctx.stroke();
            if (p.events.length > 1) {
              ctx.fillStyle = '#E74C3C';
              ctx.font = '11px Arial';
              ctx.fillText(`×${p.events.length}`, x + 4, c.scales.y.top + 12);
            }
            ctx.restore();
          });
        },
      };

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
          publishPoints,
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterBody: (items) => {
                  const idx = items[0].dataIndex;
                  const hit = publishPoints.find(p => p.idx === idx);
                  if (!hit) return [];
                  return ['', '📢 Published/updated here:'].concat(
                    hit.events.map(e => '  ' + new Date(e).toLocaleString())
                  );
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
        plugins: [publishPlugin],
      });

      chartLoading.classList.add('hidden');
    } catch (err) {
      chartLoading.textContent = 'Failed to load analytics data.';
    }
  }

  timeRangeSelect.addEventListener('change', loadAndRender);
  loadAndRender();
})();
