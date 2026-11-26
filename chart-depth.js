(() => {
  'use strict';

  const Chart = window.Chart;
  if (!Chart || typeof Chart.register !== 'function') return;

  function face(ctx, points, color, shade) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = shade;
    ctx.fill();
  }

  function bars(ctx, elements) {
    for (const bar of elements) {
      const { x, y, base, width, height, horizontal } = bar;
      const breadth = horizontal ? height : width;
      if (bar.hidden || ![x, y, base, breadth].every(Number.isFinite) ||
          breadth <= 0 || (horizontal ? x : y) === base) continue;

      const depth = Math.min(7, breadth / 4);
      const left = horizontal ? Math.min(x, base) : x - width / 2;
      const right = horizontal ? Math.max(x, base) : x + width / 2;
      const top = horizontal ? y - height / 2 : Math.min(y, base);
      const bottom = horizontal ? y + height / 2 : Math.max(y, base);
      const color = bar.options.backgroundColor;

      face(ctx, [[right, top], [right + depth, top - depth],
        [right + depth, bottom - depth], [right, bottom]], color, 'rgba(0,0,0,.27)');
      face(ctx, [[left, top], [left + depth, top - depth],
        [right + depth, top - depth], [right, top]], color, 'rgba(255,255,255,.25)');
    }
  }

  function rings(ctx, arcs) {
    const visible = arcs.filter(arc => !arc.hidden && arc.circumference > 0 &&
      arc.outerRadius > arc.innerRadius && arc.outerRadius > 0);
    if (!visible.length) return;
    const depth = Math.max(1, Math.min(8, Math.round(visible[0].outerRadius / 10)));

    for (let offset = depth; offset > 0; offset--) {
      for (const arc of visible) {
        const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arc;
        const cy = y + offset;
        ctx.beginPath();
        ctx.arc(x, cy, outerRadius, startAngle, endAngle);
        if (innerRadius > 0) ctx.arc(x, cy, innerRadius, endAngle, startAngle, true);
        else ctx.lineTo(x, cy);
        ctx.closePath();
        ctx.fillStyle = arc.options.backgroundColor;
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.32)';
        ctx.fill();
      }
    }
  }

  function lineShadow(ctx, line) {
    if (!line || !line.options.borderWidth) return;
    ctx.translate(1, 3);
    ctx.beginPath();
    if (line.path(ctx)) ctx.closePath();
    ctx.lineWidth = line.options.borderWidth + 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(line.options.borderDash || []);
    ctx.lineDashOffset = line.options.borderDashOffset || 0;
    ctx.strokeStyle = 'rgba(0,0,0,.16)';
    ctx.stroke();
  }

  // Paint depth under the native elements without changing their hit areas or options.
  Chart.register({
    id: 'chartDepth',
    beforeDatasetsDraw(chart) {
      if (document.documentElement.dataset.ptDepth === 'off') return;
      const { ctx, chartArea } = chart;
      if (!chartArea || chartArea.width <= 0 || chartArea.height <= 0) return;
      const metas = chart.getSortedVisibleDatasetMetas();
      for (let i = metas.length - 1; i >= 0; i--) {
        const { type, data, dataset } = metas[i];
        ctx.save();
        try {
          if (type === 'bar' || type === 'line') {
            ctx.beginPath();
            ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
            ctx.clip();
          }
          if (type === 'bar') bars(ctx, data);
          else if (type === 'doughnut' || type === 'pie') rings(ctx, data);
          else if (type === 'line') lineShadow(ctx, dataset);
        } finally {
          ctx.restore();
        }
      }
    }
  });
})();
