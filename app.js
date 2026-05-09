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

const metricConfigs = [
  { key: 'likes', label: '点赞', series_col: 'avg_likes', digits: 1, description: '点赞：按剧集+观测时间聚合为单集均赞（AVG like_count）', color: '#1364ff' },
  { key: 'comments', label: '评论', series_col: 'avg_comments', digits: 1, description: '评论：按剧集+观测时间聚合为单集均评（AVG comment_count）', color: '#11a7b8' },
  { key: 'heat', label: '热度', series_col: 'series_popularity', digits: 1, description: '热度：按剧集+观测时间取剧级热度（popularity，同剧各集一致）', color: '#ff8f1f' },
  { key: 'favorites', label: '收藏', series_col: 'series_collection', digits: 0, description: '收藏：按剧集+观测时间取剧级收藏（collection_count，同剧各集一致）', color: '#5a57ff' },
];

function buildMetricRanks() {
  const result = {};
  const rankRows = Array.isArray(state.rankBoardData?.rows) ? state.rankBoardData.rows : [];
  const hours = Array.isArray(state.rankBoardData?.hours) ? state.rankBoardData.hours.slice() : [];
  const seriesMeta = {};

  rankRows.forEach((row) => {
    const sid = String(row.series_id);
    if (!seriesMeta[sid]) {
      seriesMeta[sid] = {
        series_id: sid,
        title: row.title || sid,
        launch_date_tag: row.launch_date_tag || '',
        first_discovery_at: row.first_discovery_at || '',
      };
    }
  });

  metricConfigs.forEach((cfg) => {
    const metricMap = state.seriesTrendData?.metrics?.[cfg.key] || {};
    const currentRows = [];
    const lifetimeRows = [];
    const recentRows = [];

    Object.keys(metricMap).forEach((seriesId) => {
      const points = (metricMap[seriesId] || []).slice().sort((a, b) => String(a.x).localeCompare(String(b.x)));
      const meta = seriesMeta[seriesId] || { series_id: seriesId, title: seriesId, launch_date_tag: '', first_discovery_at: '' };
      if (points.length === 0) return;

      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      const prevPoint = points.length >= 2 ? points[points.length - 2] : null;

      currentRows.push({
        series_id: seriesId,
        title: meta.title,
        launch_date_tag: meta.launch_date_tag,
        first_discovery_at: meta.first_discovery_at,
        [cfg.series_col]: lastPoint.y,
      });

      const lifetimeDelta = toNum(lastPoint.y) !== null && toNum(firstPoint.y) !== null ? lastPoint.y - firstPoint.y : null;
      const lifetimeGrowth = lifetimeDelta !== null && toNum(firstPoint.y) !== null && Number(firstPoint.y) !== 0 ? (lifetimeDelta / firstPoint.y) * 100 : null;
      lifetimeRows.push({
        series_id: seriesId,
        title: meta.title,
        launch_date_tag: meta.launch_date_tag,
        first_discovery_at: meta.first_discovery_at,
        metric_before: firstPoint.y,
        metric_after: lastPoint.y,
        delta: lifetimeDelta,
        growth_pct: lifetimeGrowth,
      });

      if (prevPoint) {
        const recentDelta = toNum(lastPoint.y) !== null && toNum(prevPoint.y) !== null ? lastPoint.y - prevPoint.y : null;
        const recentGrowth = recentDelta !== null && toNum(prevPoint.y) !== null && Number(prevPoint.y) !== 0 ? (recentDelta / prevPoint.y) * 100 : null;
        recentRows.push({
          series_id: seriesId,
          title: meta.title,
          launch_date_tag: meta.launch_date_tag,
          first_discovery_at: meta.first_discovery_at,
          metric_before: prevPoint.y,
          metric_after: lastPoint.y,
          delta: recentDelta,
          growth_pct: recentGrowth,
        });
      }
    });

    result[cfg.key] = {
      latest_hour: hours[hours.length - 1] || '-',
      prev_hour: hours.length >= 2 ? hours[hours.length - 2] : null,
      current_df: currentRows.sort((a, b) => (toNum(b[cfg.series_col]) || 0) - (toNum(a[cfg.series_col]) || 0)),
      lifetime_delta: lifetimeRows.slice().sort((a, b) => (toNum(b.delta) || -Infinity) - (toNum(a.delta) || -Infinity)).slice(0, 10),
      lifetime_growth: lifetimeRows.slice().sort((a, b) => (toNum(b.growth_pct) || -Infinity) - (toNum(a.growth_pct) || -Infinity)).slice(0, 10),
      recent_delta: recentRows.length ? recentRows.slice().sort((a, b) => (toNum(b.delta) || -Infinity) - (toNum(a.delta) || -Infinity)).slice(0, 5) : null,
      recent_growth: recentRows.length ? recentRows.slice().sort((a, b) => (toNum(b.growth_pct) || -Infinity) - (toNum(a.growth_pct) || -Infinity)).slice(0, 5) : null,
    };
  });

  return result;
}

function renderRowsHtml(df, valueCol, formatter) {
  if (!df || df.length === 0) return '<tr><td colspan="6" class="empty">暂无数据</td></tr>';
    const values = df.map((row) => toNum(row[valueCol])).filter((value) => value !== null);
    let maxValue = values.length > 0 ? Math.max(...values) : 1;
    if (!Number.isFinite(maxValue) || maxValue === 0) maxValue = 1;
  return df.map((row, index) => {
    const rawValue = row[valueCol];
    const width = !Number.isFinite(rawValue) ? 0 : Math.max(6, intClamp((Number(rawValue) / maxValue) * 100, 6, 100));
    const before = row.metric_before;
    const after = row.metric_after;
    return `<tr data-filter-row data-search="${escapeHtml(`${row.title} ${row.series_id}`)}">
      <td class="rank">${index + 1}</td>
      <td class="title">${escapeHtml(String(row.title || '-'))}</td>
      <td class="series">${escapeHtml(String(row.series_id || '-'))}</td>
      <td class="pair-cell"><div class='pair'><div>前: ${formatValue(before, 1)}</div><div>后: ${formatValue(after, 1)}</div></div></td>
      <td class="value">${formatter(rawValue)}</td>
      <td class="bar-cell"><div class="bar"><div class="bar-fill" style="width:${width}%;"></div></div></td>
    </tr>`;
  }).join('');
}

function intClamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildMetricTabs(metricData) {
  const container = document.getElementById('metricTabs');
  if (!container) return;
  container.innerHTML = metricConfigs.map((cfg, index) => `<button type="button" class="metric-tab${index === 0 ? ' active' : ''}" data-target="${cfg.key}">${cfg.label}</button>`).join('');
}

function buildMetricSection(title, df, valueCol, formatter, valueLabel) {
  return `
    <section class="panel mini-panel">
      <h3>${escapeHtml(title)}</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>剧名</th>
            <th>剧集ID</th>
            <th>前后值</th>
            <th>${escapeHtml(valueLabel)}</th>
            <th>可视化</th>
          </tr>
        </thead>
        <tbody>
          ${renderRowsHtml(df, valueCol, formatter)}
        </tbody>
      </table>
    </section>`;
}

function buildMetricPanel(metricCfg, metricRanks) {
  const formatValueForMetric = (value) => formatValue(value, metricCfg.digits);
  const lifetimeDeltaDf = metricRanks.lifetime_delta || [];
  const lifetimeGrowthDf = metricRanks.lifetime_growth || [];
  const recentDeltaDf = metricRanks.recent_delta || [];
  const recentGrowthDf = metricRanks.recent_growth || [];

  return `
    <section class="metric-panel${metricCfg.key === 'likes' ? ' active' : ''}" data-panel="${metricCfg.key}">
      <div class="metric-head">
        <h3>${metricCfg.label}榜单</h3>
        <p>${escapeHtml(metricCfg.description)}</p>
        <p>口径说明：累计增量 = 末次观测值 - 首次观测值；累计增幅 = (末次 - 首次) / 首次；最近增量 = 最新小时值 - 上一小时值；最近增幅 = (最新 - 上一小时) / 上一小时。分母为 0 或缺失时显示“-”。</p>
      </div>
      ${buildMetricSection(`观测以来${metricCfg.label}增量 Top 10`, lifetimeDeltaDf, 'delta', formatValueForMetric, '累计增量')}
      ${buildMetricSection(`观测以来${metricCfg.label}增幅 Top 10`, lifetimeGrowthDf, 'growth_pct', (value) => (Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : '-'), '累计增幅')}
      ${buildMetricSection(`最近两次观测${metricCfg.label}增量 Top 5`, recentDeltaDf, 'delta', formatValueForMetric, '最近增量')}
      ${buildMetricSection(`最近两次观测${metricCfg.label}增幅 Top 5`, recentGrowthDf, 'growth_pct', (value) => (Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : '-'), '最近增幅')}
    </section>`;
}

function buildMetricPanels(metricData) {
  const container = document.getElementById('metricPanels');
  if (!container) return;
  container.innerHTML = metricConfigs.map((cfg) => buildMetricPanel(cfg, metricData[cfg.key] || {})).join('');
  setupRankTabs();
}

function setupRankTabs() {
  const tabs = Array.from(document.querySelectorAll('.metric-tab'));
  const panels = Array.from(document.querySelectorAll('.metric-panel'));
  const rankFilter = document.getElementById('rankFilter');

  function applyFilter() {
    if (!rankFilter) return;
    const keyword = (rankFilter.value || '').trim().toLowerCase();
    document.querySelectorAll('[data-filter-row]').forEach((row) => {
      const text = (row.dataset.search || row.textContent || '').toLowerCase();
      row.style.display = text.includes(keyword) ? '' : 'none';
    });
  }

  function setActive(key) {
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.target === key));
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === key));
    applyFilter();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => setActive(tab.dataset.target)));
  if (rankFilter) rankFilter.addEventListener('input', applyFilter);
  if (tabs.length > 0) setActive(tabs[0].dataset.target);
}

function buildRankIndex() {
  const index = {};
  const rows = Array.isArray(state.rankBoardData?.rows) ? state.rankBoardData.rows : [];
  rows.forEach((row) => {
    const sid = String(row.series_id);
    const hour = String(row.snapshot_hour);
    if (!index[sid]) index[sid] = { title: row.title, rows: {}, first_discovery_at: row.first_discovery_at || '', launch_date_tag: row.launch_date_tag || '' };
    index[sid].rows[hour] = row;
  });
  return index;
}

const rankMetricConfigs = [
  { key: 'likes', label: '点赞', digits: 1 },
  { key: 'comments', label: '评论', digits: 1 },
  { key: 'heat', label: '热度', digits: 1 },
  { key: 'favorites', label: '收藏', digits: 0 },
];

const rankState = {
  metricKey: 'likes',
  sortField: 'delta',
  preset: '24h',
  startHour: '',
  endHour: '',
  keyword: '',
  status: 'all',
  page: 1,
  pageSize: 20,
};

function buildMetricRanks() {
  const result = {};
  const rankRows = Array.isArray(state.rankBoardData?.rows) ? state.rankBoardData.rows : [];
  const hours = Array.isArray(state.rankBoardData?.hours) ? state.rankBoardData.hours.slice() : [];
  const seriesMeta = {};

  rankRows.forEach((row) => {
    const sid = String(row.series_id);
    if (!seriesMeta[sid]) {
      seriesMeta[sid] = {
        series_id: sid,
        title: row.title || sid,
        launch_date_tag: row.launch_date_tag || '',
        first_discovery_at: row.first_discovery_at || '',
      };
    }
  });

  metricConfigs.forEach((cfg) => {
    const metricMap = state.seriesTrendData?.metrics?.[cfg.key] || {};
    const currentRows = [];
    const lifetimeRows = [];
    const recentRows = [];

    Object.keys(metricMap).forEach((seriesId) => {
      const points = (metricMap[seriesId] || []).slice().sort((a, b) => String(a.x).localeCompare(String(b.x)));
      const meta = seriesMeta[seriesId] || { series_id: seriesId, title: seriesId, launch_date_tag: '', first_discovery_at: '' };
      if (points.length === 0) return;

      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      const prevPoint = points.length >= 2 ? points[points.length - 2] : null;

      currentRows.push({
        series_id: seriesId,
        title: meta.title,
        launch_date_tag: meta.launch_date_tag,
        first_discovery_at: meta.first_discovery_at,
        [cfg.series_col]: lastPoint.y,
      });

      const lifetimeDelta = toNum(lastPoint.y) !== null && toNum(firstPoint.y) !== null ? lastPoint.y - firstPoint.y : null;
      const lifetimeGrowth = lifetimeDelta !== null && toNum(firstPoint.y) !== null && Number(firstPoint.y) !== 0 ? (lifetimeDelta / firstPoint.y) * 100 : null;
      lifetimeRows.push({
        series_id: seriesId,
        title: meta.title,
        launch_date_tag: meta.launch_date_tag,
        first_discovery_at: meta.first_discovery_at,
        metric_before: firstPoint.y,
        metric_after: lastPoint.y,
        delta: lifetimeDelta,
        growth_pct: lifetimeGrowth,
      });

      if (prevPoint) {
        const recentDelta = toNum(lastPoint.y) !== null && toNum(prevPoint.y) !== null ? lastPoint.y - prevPoint.y : null;
        const recentGrowth = recentDelta !== null && toNum(prevPoint.y) !== null && Number(prevPoint.y) !== 0 ? (recentDelta / prevPoint.y) * 100 : null;
        recentRows.push({
          series_id: seriesId,
          title: meta.title,
          launch_date_tag: meta.launch_date_tag,
          first_discovery_at: meta.first_discovery_at,
          metric_before: prevPoint.y,
          metric_after: lastPoint.y,
          delta: recentDelta,
          growth_pct: recentGrowth,
        });
      }
    });

    result[cfg.key] = {
      latest_hour: hours[hours.length - 1] || '-',
      prev_hour: hours.length >= 2 ? hours[hours.length - 2] : null,
      current_df: currentRows.sort((a, b) => (Number.isFinite(b[cfg.series_col]) ? b[cfg.series_col] : -Infinity) - (Number.isFinite(a[cfg.series_col]) ? a[cfg.series_col] : -Infinity)),
      lifetime_delta: lifetimeRows.slice().sort((a, b) => (Number.isFinite(b.delta) ? b.delta : -Infinity) - (Number.isFinite(a.delta) ? a.delta : -Infinity)).slice(0, 10),
      lifetime_growth: lifetimeRows.slice().sort((a, b) => (Number.isFinite(b.growth_pct) ? b.growth_pct : -Infinity) - (Number.isFinite(a.growth_pct) ? a.growth_pct : -Infinity)).slice(0, 10),
      recent_delta: recentRows.length ? recentRows.slice().sort((a, b) => (Number.isFinite(b.delta) ? b.delta : -Infinity) - (Number.isFinite(a.delta) ? a.delta : -Infinity)).slice(0, 5) : null,
      recent_growth: recentRows.length ? recentRows.slice().sort((a, b) => (Number.isFinite(b.growth_pct) ? b.growth_pct : -Infinity) - (Number.isFinite(a.growth_pct) ? a.growth_pct : -Infinity)).slice(0, 5) : null,
    };
  });

  return result;
}

function getRankHours() {
  return Array.isArray(state.rankBoardData?.hours) ? state.rankBoardData.hours.slice() : [];
}

function getRankMetricValue(row, metricKey) {
  return row && Number.isFinite(row[metricKey]) ? row[metricKey] : null;
}

function renderRankMetricButtons() {
  const container = document.getElementById('rankMetricButtons');
  if (!container) return;
  container.innerHTML = rankMetricConfigs.map((metric) => `<button type="button" class="rank-metric-btn" data-metric="${metric.key}">${metric.label}</button>`).join('');
  Array.from(container.querySelectorAll('button')).forEach((button) => {
    button.addEventListener('click', () => {
      rankState.metricKey = button.dataset.metric || 'likes';
      rankState.page = 1;
      renderRankBoardFull();
    });
  });
}

function syncRankHourSelects() {
  const startSelect = document.getElementById('rankStartHour');
  const endSelect = document.getElementById('rankEndHour');
  if (startSelect) startSelect.value = rankState.startHour;
  if (endSelect) endSelect.value = rankState.endHour;
}

function buildRankHourOptions() {
  const hours = getRankHours();
  const html = hours.map((hour) => `<option value="${hour}">${hour}</option>`).join('');
  const startSelect = document.getElementById('rankStartHour');
  const endSelect = document.getElementById('rankEndHour');
  if (startSelect) startSelect.innerHTML = html;
  if (endSelect) endSelect.innerHTML = html;
}

function setRankPreset(preset) {
  const hours = getRankHours();
  if (hours.length === 0) return;
  const endIndex = hours.length - 1;
  let cutoffHours = 24;
  if (preset === '72h') cutoffHours = 72;
  if (preset === '7d') cutoffHours = 168;
  const lastTs = Date.parse(String(hours[endIndex]).replace(' ', 'T') + ':00');
  const cutoffTs = lastTs - cutoffHours * 3600 * 1000;
  let startIndex = hours.findIndex((hour) => Date.parse(String(hour).replace(' ', 'T') + ':00') >= cutoffTs);
  if (startIndex === -1) startIndex = Math.max(0, endIndex - cutoffHours);
  rankState.startHour = hours[startIndex] || hours[0];
  rankState.endHour = hours[endIndex];
  rankState.preset = preset;
  rankState.page = 1;
  syncRankHourSelects();
  renderRankBoardFull();
}

function getRankMetricOrder() {
  const selected = rankState.metricKey;
  return [selected].concat(rankMetricConfigs.map((item) => item.key).filter((key) => key !== selected));
}

function rankStatusForRow(startValue, endValue) {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return { key: 'missing', label: '缺失' };
  return { key: 'normal', label: '正常' };
}

function compareRankRows(a, b) {
  if (rankState.sortField === 'title') return String(a.title).localeCompare(String(b.title), 'zh-CN');
  const aValue = a[rankState.sortField];
  const bValue = b[rankState.sortField];
  if (!Number.isFinite(aValue) && Number.isFinite(bValue)) return 1;
  if (Number.isFinite(aValue) && !Number.isFinite(bValue)) return -1;
  if (aValue === bValue) return String(a.title).localeCompare(String(b.title), 'zh-CN');
  return (aValue > bValue ? -1 : 1);
}

function buildRankRows() {
  const hours = getRankHours();
  const startHour = rankState.startHour || hours[0] || '';
  const endHour = rankState.endHour || hours[hours.length - 1] || '';
  return Object.keys(rankIndex).map((seriesId) => {
    const item = rankIndex[seriesId];
    const startRow = item.rows[startHour];
    const endRow = item.rows[endHour];
    const title = item.title || (endRow ? endRow.title : seriesId);
    const launchTagMap = state.rankBoardData?.launch_tag_by_series || {};
    const launchDateTag = item.launch_date_tag || launchTagMap[String(seriesId)] || '';
    const selectedMetricStart = getRankMetricValue(startRow, rankState.metricKey);
    const selectedMetricEnd = getRankMetricValue(endRow, rankState.metricKey);
    const delta = (Number.isFinite(selectedMetricStart) && Number.isFinite(selectedMetricEnd)) ? (selectedMetricEnd - selectedMetricStart) : null;
    const growth = Number.isFinite(delta) && Number.isFinite(selectedMetricStart) && selectedMetricStart !== 0 ? (delta / selectedMetricStart * 100) : null;
    const status = rankStatusForRow(selectedMetricStart, selectedMetricEnd, growth);
    const metricValues = {};
    rankMetricConfigs.forEach((metric) => {
      metricValues[metric.key] = getRankMetricValue(endRow, metric.key);
    });
    return {
      seriesId,
      title,
      launchDateTag: launchDateTag,
      firstDiscoveryAt: item.first_discovery_at || '',
      startHour,
      endHour,
      startValue: selectedMetricStart,
      endValue: selectedMetricEnd,
      delta,
      growth,
      metricValues,
      statusKey: status.key,
      statusLabel: status.label,
      searchText: String(title).toLowerCase() + ' ' + String(seriesId).toLowerCase() + ' ' + String(launchDateTag || '').toLowerCase(),
    };
  }).sort(compareRankRows);
}

function applyRankFilters(rows) {
  const keyword = (rankState.keyword || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (rankState.status !== 'all' && row.statusKey !== rankState.status) return false;
    if (keyword && !row.searchText.includes(keyword)) return false;
    return true;
  });
}

function buildRankHeader() {
  const head = document.getElementById('rankTableHead');
  if (!head) return;
  const metricOrder = getRankMetricOrder();
  const metricHeaderHtml = metricOrder.map((metricKey, index) => {
    const metric = rankMetricConfigs.find((item) => item.key === metricKey);
    const classes = ['metric-header'];
    if (index === 0) classes.push('active');
    if (metricKey === rankState.metricKey) classes.push('source');
    return `<th class="${classes.join(' ')}">${metric.label}</th>`;
  }).join('');
  head.innerHTML = '<tr>' +
    '<th>排名</th>' +
    '<th>剧目</th>' +
    '<th>剧集ID</th>' +
    '<th>上线日期</th>' +
    '<th>起始值</th>' +
    '<th>结束值</th>' +
    '<th>差值</th>' +
    '<th>增幅</th>' +
    metricHeaderHtml +
    '<th>状态</th>' +
  '</tr>';
}

function rankColumnClass(metricKey) {
  const classes = ['metric-cell'];
  if (metricKey === rankState.metricKey) classes.push('active');
  return classes.join(' ');
}

function formatRankMetric(metricKey, value) {
  const metric = rankMetricConfigs.find((item) => item.key === metricKey);
  return formatValue(value, metric ? metric.digits : 1);
}

function formatLaunchTag(value) {
  const text = String(value || '').trim();
  if (!text || text === 'None' || text === 'null' || text === 'undefined') return '-';
  return text;
}

function renderRankTableFull() {
  const body = document.getElementById('rankTableBody');
  const meta = document.getElementById('rankPageMeta');
  if (!body) return;

  rankRowsCache = buildRankRows();
  rankFilteredRows = applyRankFilters(rankRowsCache);
  const total = rankFilteredRows.length;
  const pageSize = Math.max(1, Number(rankState.pageSize) || 20);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  rankState.page = Math.min(Math.max(1, rankState.page), totalPages);
  const startIndex = (rankState.page - 1) * pageSize;
  const pageRows = rankFilteredRows.slice(startIndex, startIndex + pageSize);
  const metricOrder = getRankMetricOrder();

  body.innerHTML = pageRows.length === 0 ? '<tr><td colspan="13" class="empty">暂无符合条件的数据</td></tr>' : pageRows.map((row, index) => {
    const rowIndex = startIndex + index + 1;
    const classes = ['is-' + row.statusKey];
    if (index === 0) classes.push('is-highlight');
    const metricCells = metricOrder.map((metricKey) => '<td class="' + rankColumnClass(metricKey) + '">' + formatRankMetric(metricKey, row.metricValues[metricKey]) + '</td>').join('');
    return '<tr class="' + classes.join(' ') + '">' +
      '<td class="rank">' + rowIndex + '</td>' +
      '<td class="title">' + escapeHtml(row.title) + '</td>' +
      '<td class="series">' + escapeHtml(row.seriesId) + '</td>' +
      '<td>' + formatLaunchTag(row.launchDateTag) + '</td>' +
      '<td>' + formatRankMetric(rankState.metricKey, row.startValue) + '</td>' +
      '<td>' + formatRankMetric(rankState.metricKey, row.endValue) + '</td>' +
      '<td class="delta">' + formatRankMetric(rankState.metricKey, row.delta) + '</td>' +
      '<td class="growth">' + (Number.isFinite(row.growth) ? (row.growth >= 0 ? '+' : '') + row.growth.toFixed(1) + '%' : '-') + '</td>' +
      metricCells +
      '<td><span class="badge ' + row.statusKey + '">' + row.statusLabel + '</span></td>' +
    '</tr>';
  }).join('');

  const summaryCount = document.getElementById('rankSummaryCount');
  if (summaryCount) summaryCount.textContent = total + ' 条 / 第 ' + rankState.page + ' 页';
  if (meta) meta.textContent = total === 0 ? '无可展示结果' : ('第 ' + (startIndex + 1) + ' - ' + Math.min(startIndex + pageSize, total) + ' 条 / 共 ' + total + ' 条');
  const prevBtn = document.getElementById('rankPrevPage');
  const nextBtn = document.getElementById('rankNextPage');
  if (prevBtn) prevBtn.disabled = rankState.page <= 1;
  if (nextBtn) nextBtn.disabled = rankState.page >= totalPages;
  const summaryMetric = document.getElementById('rankSummaryMetric');
  if (summaryMetric) summaryMetric.textContent = rankMetricConfigs.find((item) => item.key === rankState.metricKey)?.label || '点赞';
}

function renderRankToolbarState() {
  const summaryStart = document.getElementById('rankSummaryStart');
  const summaryEnd = document.getElementById('rankSummaryEnd');
  if (summaryStart) summaryStart.textContent = rankState.startHour || '-';
  if (summaryEnd) summaryEnd.textContent = rankState.endHour || '-';

  document.querySelectorAll('.rank-preset button').forEach((button) => button.classList.toggle('active', button.dataset.preset === rankState.preset));
  document.querySelectorAll('.rank-metric-btn').forEach((button) => button.classList.toggle('active', button.dataset.metric === rankState.metricKey));
}

function renderRankBoardFull() {
  const hours = getRankHours();
  if (hours.length === 0) return;
  if (!rankState.startHour) rankState.startHour = hours[Math.max(0, hours.length - 25)] || hours[0];
  if (!rankState.endHour) rankState.endHour = hours[hours.length - 1];
  syncRankHourSelects();
  buildRankHeader();
  renderRankTableFull();
  renderRankToolbarState();
}

function setupRankBoardFull() {
  buildRankHourOptions();
  renderRankMetricButtons();
  const hours = getRankHours();
  if (hours.length > 0) {
    rankState.endHour = hours[hours.length - 1];
    rankState.startHour = hours[Math.max(0, hours.length - 25)] || hours[0];
  }
  syncRankHourSelects();
  setRankPreset('24h');

  document.querySelectorAll('.rank-preset button').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.preset === 'custom') {
      rankState.preset = 'custom';
      renderRankToolbarState();
      return;
    }
    setRankPreset(button.dataset.preset || '24h');
  }));

  const startSelect = document.getElementById('rankStartHour');
  const endSelect = document.getElementById('rankEndHour');
  const searchInput = document.getElementById('rankSearch');
  const statusSelect = document.getElementById('rankStatus');
  const sortFieldSelect = document.getElementById('rankSortField');
  const pageSizeSelect = document.getElementById('rankPageSize');
  const prevBtn = document.getElementById('rankPrevPage');
  const nextBtn = document.getElementById('rankNextPage');

  if (startSelect) startSelect.addEventListener('change', () => {
    rankState.startHour = startSelect.value;
    rankState.preset = 'custom';
    rankState.page = 1;
    renderRankBoardFull();
  });
  if (endSelect) endSelect.addEventListener('change', () => {
    rankState.endHour = endSelect.value;
    rankState.preset = 'custom';
    rankState.page = 1;
    renderRankBoardFull();
  });
  if (searchInput) searchInput.addEventListener('input', () => {
    rankState.keyword = searchInput.value || '';
    rankState.page = 1;
    renderRankTableFull();
  });
  if (statusSelect) statusSelect.addEventListener('change', () => {
    rankState.status = statusSelect.value;
    rankState.page = 1;
    renderRankTableFull();
  });
  if (sortFieldSelect) sortFieldSelect.addEventListener('change', () => {
    rankState.sortField = sortFieldSelect.value || 'delta';
    rankState.page = 1;
    renderRankTableFull();
  });
  if (pageSizeSelect) pageSizeSelect.addEventListener('change', () => {
    rankState.pageSize = Number(pageSizeSelect.value) || 20;
    rankState.page = 1;
    renderRankTableFull();
  });
  if (prevBtn) prevBtn.addEventListener('click', () => {
    rankState.page = Math.max(1, rankState.page - 1);
    renderRankTableFull();
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    rankState.page += 1;
    renderRankTableFull();
  });

  renderRankBoardFull();
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

    rankIndex = buildRankIndex();
    const metricData = buildMetricRanks();

    refreshTrendSeriesOptions();
    refreshSeriesOptions();
    renderAllTrends(0);
    renderEpisodeCharts();
    buildScopeCards();
    buildMetricTabs(metricData);
    buildMetricPanels(metricData);
    setupRankBoardFull();
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

// 对外暴露一个刷新入口，页面上的按钮或调试时可以调用
window.refreshData = async function() {
  try {
    setStatus('手动刷新：正在加载远端 JSON...', 'info');
    await init();
    setStatus('手动刷新完成', 'ok');
  } catch (err) {
    setStatus('手动刷新失败', 'error');
    console.error('refreshData error', err);
  }
}

init();

// 绑定刷新按钮（如果存在）
document.getElementById('refreshDataBtn')?.addEventListener('click', () => {
  window.refreshData();
});
