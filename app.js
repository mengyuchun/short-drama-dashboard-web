const BASE = 'https://raw.githubusercontent.com/mengyuchun/short-drama-dashboard-data/main';

const state = {
  trendData: null,
  seriesTrendData: null,
  episodeData: null,
  rankBoardData: null,
  currentTrendHours: 0,
};

async function fetchJson(name) {
  const t = Date.now();
  const res = await fetch(`${BASE}/${name}.json?t=${t}`);
  if (!res.ok) throw new Error(`fetch ${name} failed: ${res.status}`);
  return res.json();
}

function toNum(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatValue(value, digits) {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setDebug(obj) {
  setText('debug', JSON.stringify(obj, null, 2));
}

function setStatus(text, kind = 'info') {
  const el = document.getElementById('statusLine');
  if (!el) return;
  el.textContent = text;
  el.className = `status ${kind}`;
}

function cutByHours(points, hours) {
  if (!hours || Number(hours) <= 0) return points;
  if (!points || points.length === 0) return points;
  try {
    const last = points[points.length - 1];
    const lastTs = Date.parse(String(last.x).replace(' ', 'T') + ':00');
    if (isNaN(lastTs)) return points;
    const cutoffTs = lastTs - Number(hours) * 3600 * 1000;
    return points.filter((point) => {
      const time = Date.parse(String(point.x).replace(' ', 'T') + ':00');
      return !isNaN(time) && time >= cutoffTs;
    });
  } catch (error) {
    if (points.length <= hours) return points;
    return points.slice(points.length - hours);
  }
}

function drawLineChart(svgId, points, color, metaLeftId, metaRightId, compareSpec = null) {
  const svg = document.getElementById(svgId);
  if (!svg) return;

  const shell = svg.parentElement;
  const width = svg.clientWidth || 520;
  const height = svg.clientHeight || 220;
  const pad = 26;
  const filtered = (points || []).filter((point) => toNum(point.y) !== null);

  if (filtered.length === 0) {
    svg.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#7a8cae" font-size="12">暂无数据</text>';
    setText(metaLeftId, '暂无数据');
    setText(metaRightId, '暂无数据');
    return;
  }

  const ys = filtered.map((point) => point.y);
  if (compareSpec && Array.isArray(compareSpec.points)) {
    compareSpec.points.forEach((point) => {
      const value = toNum(point.y);
      if (value !== null) ys.push(value);
    });
  }

  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const ySpan = maxY - minY || 1;
  const xSpan = Math.max(filtered.length - 1, 1);

  const renderedPoints = filtered.map((point, index) => {
    const x = pad + (index / xSpan) * (width - pad * 2);
    const y = height - pad - ((point.y - minY) / ySpan) * (height - pad * 2);
    return { point, x, y };
  });

  const pathParts = renderedPoints.map((item, index) => `${index === 0 ? 'M' : 'L'} ${item.x.toFixed(2)} ${item.y.toFixed(2)}`);
  const circles = renderedPoints
    .map((item) => `<circle cx="${item.x.toFixed(2)}" cy="${item.y.toFixed(2)}" r="3" fill="${color}" />`)
    .join('');

  let comparePath = '';
  if (compareSpec && Array.isArray(compareSpec.points) && compareSpec.points.length > 0) {
    const xSpanCompare = Math.max(compareSpec.points.length - 1, 1);
    const comparePoints = compareSpec.points
      .map((point, index) => {
        const value = toNum(point.y);
        if (value === null) return null;
        const x = pad + (index / xSpanCompare) * (width - pad * 2);
        const y = height - pad - ((value - minY) / ySpan) * (height - pad * 2);
        return { x, y };
      })
      .filter(Boolean);

    if (comparePoints.length > 0) {
      const path = comparePoints.map((item, index) => `${index === 0 ? 'M' : 'L'} ${item.x.toFixed(2)} ${item.y.toFixed(2)}`).join(' ');
      comparePath = `<path d="${path}" fill="none" stroke="${compareSpec.color || '#ff6b35'}" stroke-width="2" stroke-dasharray="5 4" />`;
    }
  }

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML =
    `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#dbe4f3"/>` +
    `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#dbe4f3"/>` +
    `<path d="${pathParts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.2" />` +
    circles +
    comparePath;

  setText(metaLeftId, `${filtered[0].x} · ${filtered[0].y != null ? filtered[0].y.toFixed(1) : '-'}`);
  setText(metaRightId, `${filtered[filtered.length - 1].x} · ${filtered[filtered.length - 1].y != null ? filtered[filtered.length - 1].y.toFixed(1) : '-'}`);
}

function buildTrendComparisonPoints(metricKey, basePoints, seriesId) {
  const metricMap = state.seriesTrendData?.metrics?.[metricKey] || {};
  const raw = metricMap[String(seriesId)] || [];
  const byHour = {};
  raw.forEach((item) => {
    byHour[String(item.x)] = item;
  });
  return basePoints.map((item) => ({ x: item.x, y: byHour[String(item.x)] ? byHour[String(item.x)].y : null }));
}

function renderAllTrends(hours) {
  state.currentTrendHours = hours;
  const selectedSeriesId = document.getElementById('trendSeriesSelect')?.value || '';
  Object.keys(state.trendData || {}).forEach((metricKey) => {
    const spec = state.trendData[metricKey];
    const points = cutByHours(spec.points || [], hours);
    let compareSpec = null;
    if (selectedSeriesId) {
      const comparePoints = buildTrendComparisonPoints(metricKey, points, selectedSeriesId);
      if (comparePoints.some((point) => toNum(point.y) !== null)) {
        compareSpec = {
          label: '单剧对照',
          color: '#ff6b35',
          points: comparePoints,
        };
      }
    }
    drawLineChart(`chart-${metricKey}`, points, spec.color, `meta-${metricKey}-left`, `meta-${metricKey}-right`, compareSpec);
  });
}

function refreshTrendSeriesOptions() {
  const select = document.getElementById('trendSeriesSelect');
  const search = document.getElementById('trendSeriesSearch');
  if (!select) return;
  const keyword = (search?.value || '').trim().toLowerCase();
  const source = Array.isArray(state.seriesTrendData?.series) ? state.seriesTrendData.series : [];
  const options = source.filter((item) => String(item.title || '').toLowerCase().includes(keyword) || String(item.series_id || '').includes(keyword));
  const oldValue = select.value;
  select.innerHTML = '<option value="">仅总体</option>' + options.map((item) => `<option value="${item.series_id}">${item.title} (${item.series_id})</option>`).join('');
  if (options.some((item) => String(item.series_id) === oldValue)) {
    select.value = oldValue;
  }
}

function refreshSeriesOptions() {
  const select = document.getElementById('seriesSelect');
  const search = document.getElementById('seriesSearch');
  if (!select) return;
  const keyword = (search?.value || '').trim().toLowerCase();
  const source = Array.isArray(state.episodeData?.series) ? state.episodeData.series : [];
  const options = source.filter((item) => String(item.title || '').toLowerCase().includes(keyword) || String(item.series_id || '').includes(keyword));
  const oldValue = select.value;
  select.innerHTML = options.map((item) => `<option value="${item.series_id}">${item.title} (${item.series_id})</option>`).join('');
  if (options.some((item) => String(item.series_id) === oldValue)) {
    select.value = oldValue;
  } else if (options.length > 0) {
    select.value = String(options[0].series_id);
  }
  refreshHourOptions();
}

function refreshHourOptions() {
  const seriesSelect = document.getElementById('seriesSelect');
  const hourSelect = document.getElementById('hourSelect');
  if (!seriesSelect || !hourSelect) return;
  const sid = seriesSelect.value;
  const hours = [...new Set((state.episodeData?.rows || []).filter((row) => String(row.series_id) === String(sid)).map((row) => row.snapshot_hour))].sort();
  hourSelect.innerHTML = hours.map((hour) => `<option value="${hour}">${hour}</option>`).join('');
  if (hours.length > 0) hourSelect.value = hours[hours.length - 1];
  renderEpisodeCharts();
}

function renderEpisodeCharts() {
  const seriesSelect = document.getElementById('seriesSelect');
  const hourSelect = document.getElementById('hourSelect');
  if (!seriesSelect || !hourSelect) return;
  const sid = seriesSelect.value;
  const hour = hourSelect.value;
  const rows = (state.episodeData?.rows || [])
    .filter((row) => String(row.series_id) === String(sid) && row.snapshot_hour === hour)
    .sort((a, b) => a.episode_no - b.episode_no);

  const metricRow = rows.find((row) => toNum(row.collection_count) !== null || toNum(row.popularity) !== null);
  setText('episode-stat-collection', metricRow ? formatValue(metricRow.collection_count, 0) : '-');
  setText('episode-stat-heat', metricRow ? formatValue(metricRow.popularity, 1) : '-');

  const likePoints = rows.map((row) => ({ x: `第${row.episode_no}集`, y: row.like_count }));
  const commentPoints = rows.map((row) => ({ x: `第${row.episode_no}集`, y: row.comment_count }));

  drawLineChart('chart-episode-likes', likePoints, '#1364ff', 'meta-ep-likes-left', 'meta-ep-likes-right');
  drawLineChart('chart-episode-comments', commentPoints, '#11a7b8', 'meta-ep-comments-left', 'meta-ep-comments-right');
}

function renderRankTable() {
  const head = document.getElementById('rankTableHead');
  const body = document.getElementById('rankTableBody');
  if (!head || !body) return;

  head.innerHTML = '<tr><th>排名</th><th>剧名</th><th>剧集ID</th><th>上线日期</th><th>点赞</th><th>评论</th><th>热度</th><th>收藏</th></tr>';
  const rows = state.rankBoardData?.rows || [];
  body.innerHTML = rows.slice(0, 50).map((row, index) => (
    `<tr><td>${index + 1}</td><td>${row.title || '-'}</td><td>${row.series_id || '-'}</td><td>${row.launch_date_tag || '-'}</td>` +
    `<td>${row.likes != null ? row.likes.toFixed(1) : '-'}</td>` +
    `<td>${row.comments != null ? row.comments.toFixed(1) : '-'}</td>` +
    `<td>${row.heat != null ? row.heat.toFixed(1) : '-'}</td>` +
    `<td>${row.favorites != null ? row.favorites.toFixed(0) : '-'}</td></tr>`
  )).join('');
}

function buildScopeCards() {
  const el = document.getElementById('scopeCards');
  if (!el || !state.rankBoardData) return;
  const launchTags = (state.rankBoardData.launch_tags || []).slice(0, 3).join(' / ') || '-';
  const startHour = state.rankBoardData.start_hour || '-';
  const latestHour = state.rankBoardData.latest_hour || '-';
  const seriesCount = Array.isArray(state.rankBoardData.series) ? state.rankBoardData.series.length : 0;
  const rowsCount = Array.isArray(state.rankBoardData.rows) ? state.rankBoardData.rows.length : 0;
  el.innerHTML = `
    <div class="cards">
      <div class="card"><div class="label">统计起始（小时）</div><div class="value">${startHour}</div></div>
      <div class="card"><div class="label">最新观测（小时）</div><div class="value">${latestHour}</div></div>
      <div class="card"><div class="label">统计剧数</div><div class="value">${seriesCount}</div></div>
      <div class="card"><div class="label">榜单行数</div><div class="value">${rowsCount}</div></div>
      <div class="card"><div class="label">上线日期</div><div class="value">${launchTags}</div></div>
    </div>`;
}

function wireEvents() {
  document.getElementById('trendSeriesSearch')?.addEventListener('input', () => {
    refreshTrendSeriesOptions();
    renderAllTrends(state.currentTrendHours);
  });
  document.getElementById('trendSeriesSelect')?.addEventListener('change', () => renderAllTrends(state.currentTrendHours));
  document.getElementById('seriesSearch')?.addEventListener('input', refreshSeriesOptions);
  document.getElementById('seriesSelect')?.addEventListener('change', refreshHourOptions);
  document.getElementById('hourSelect')?.addEventListener('change', renderEpisodeCharts);

  Array.from(document.querySelectorAll('#rangeButtons button')).forEach((button) => {
    button.addEventListener('click', () => {
      Array.from(document.querySelectorAll('#rangeButtons button')).forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      renderAllTrends(Number(button.dataset.range || '0'));
    });
  });
}

async function init() {
  try {
    setStatus('正在加载远端 JSON...', 'info');
    const [meta, trend, series, episode, rank] = await Promise.all([
      fetchJson('meta'),
      fetchJson('trend'),
      fetchJson('series_trend'),
      fetchJson('episode'),
      fetchJson('rank_board'),
    ]);

    state.trendData = trend;
    state.seriesTrendData = series;
    state.episodeData = episode;
    state.rankBoardData = rank;

    setText('meta-latest', meta.latest_hour || '-');
    setText('tinyDefs', '四指标：点赞 / 评论 / 热度 / 收藏');
    setStatus(`已加载：${meta.generated_at || '-'} · ${meta.latest_hour || '-'}`, 'ok');

    refreshTrendSeriesOptions();
    refreshSeriesOptions();
    renderAllTrends(0);
    renderEpisodeCharts();
    buildScopeCards();
    renderRankTable();
    wireEvents();

    setDebug({
      meta,
      sampleTrendKeys: Object.keys(trend || {}),
      firstSeries: (series.series || [])[0] || null,
    });
  } catch (error) {
    setStatus(`加载失败：${String(error)}`, 'error');
    setDebug({ error: String(error) });
  }
}

init();
