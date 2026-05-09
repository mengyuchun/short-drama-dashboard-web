// Lightweight client: fetch JSON payloads and render summaries + simple charts
const BASE = 'https://raw.githubusercontent.com/mengyuchun/short-drama-dashboard-data/main';

async function fetchJson(name) {
  const t = Date.now();
  const url = `${BASE}/${name}.json?t=${t}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${name} failed: ${res.status}`);
  return res.json();
}

function safeGet(obj, path, fallback) {
  try { return path.split('.').reduce((a,b)=>a&&a[b], obj) ?? fallback; } catch(e){ return fallback; }
}

function toNum(v){ return typeof v==='number' && Number.isFinite(v) ? v : null; }
function formatValue(value, digits){ if(!Number.isFinite(value)) return '-'; return value.toLocaleString('zh-CN',{minimumFractionDigits:digits, maximumFractionDigits:digits}); }

function setDebug(obj){ document.getElementById('debug').textContent = JSON.stringify(obj,null,2); }

// drawLineChart (minimal port of analyzer.js version)
function drawLineChart(svgId, points, color, metaLeftId, metaRightId, tooltipBuilder, compareSpec){
  const svg = document.getElementById(svgId);
  if(!svg) return;
  const shell = svg.parentElement;
  const tooltip = shell ? shell.querySelector('.chart-tooltip') : null;
  const width = svg.clientWidth || 520;
  const height = svg.clientHeight || 220;
  const pad = 26;
  const filtered = (points||[]).filter(p=> toNum(p.y)!==null);
  if(filtered.length===0){ svg.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#7a8cae" font-size="12">暂无数据</text>'; return; }
  const ys = filtered.map(p=>p.y);
  if(compareSpec && Array.isArray(compareSpec.points)) compareSpec.points.forEach(p=>{ const v=toNum(p.y); if(v!==null) ys.push(v); });
  const minY = Math.min(...ys); const maxY = Math.max(...ys); const ySpan = maxY - minY || 1; const xSpan = Math.max(filtered.length-1,1);
  const renderedPoints = filtered.map((p,idx)=>{ const x = pad + (idx/xSpan)*(width - pad*2); const y = height - pad - ((p.y - minY)/ySpan)*(height - pad*2); return {point:p, x, y}; });
  const pathParts = renderedPoints.map((it,idx)=> (idx===0?'M':'L') + ' ' + it.x.toFixed(2) + ' ' + it.y.toFixed(2));
  const circles = renderedPoints.map(it=> '<circle cx="'+it.x.toFixed(2)+'" cy="'+it.y.toFixed(2)+'" r="3" fill="'+color+'" />').join('');
  let comparePath = '';
  if(compareSpec && Array.isArray(compareSpec.points) && compareSpec.points.length>0){
    const xSpanCompare = Math.max(compareSpec.points.length-1,1);
    const comparePoints = compareSpec.points.map((p,idx)=>{ const val = toNum(p.y); if(val===null) return null; const x = pad + (idx/xSpanCompare)*(width-pad*2); const y = height - pad - ((val-minY)/ySpan)*(height-pad*2); return {x,y}; }).filter(Boolean);
    if(comparePoints.length>0){ const path = comparePoints.map((it,idx)=> (idx===0?'M':'L') + ' ' + it.x.toFixed(2) + ' ' + it.y.toFixed(2)).join(' '); comparePath = '<path d="'+path+'" fill="none" stroke="'+(compareSpec.color||'#ff6b35')+'" stroke-width="2" stroke-dasharray="5 4" />'; }
  }
  svg.setAttribute('viewBox','0 0 '+width+' '+height);
  svg.innerHTML = '<line x1="'+pad+'" y1="'+(height-pad)+'" x2="'+(width-pad)+'" y2="'+(height-pad)+'" stroke="#dbe4f3"/>' + '<line x1="'+pad+'" y1="'+pad+'" x2="'+pad+'" y2="'+(height-pad)+'" stroke="#dbe4f3"/>' + '<path d="'+pathParts.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2.2" />' + circles + comparePath;
  const leftMeta = document.getElementById(metaLeftId); const rightMeta = document.getElementById(metaRightId);
  if(leftMeta) leftMeta.textContent = filtered[0].x + ' · ' + (filtered[0].y!=null?filtered[0].y.toFixed(1):'-');
  if(rightMeta) rightMeta.textContent = filtered[filtered.length-1].x + ' · ' + (filtered[filtered.length-1].y!=null?filtered[filtered.length-1].y.toFixed(1):'-');
}

// cutByHours using timestamp on x like 'YYYY-MM-DD HH:00'
function cutByHours(points, hours){ if(!hours || Number(hours)<=0) return points; if(!points||points.length===0) return points; try{ const last = points[points.length-1]; const lastTs = Date.parse(String(last.x).replace(' ', 'T') + ':00'); if(isNaN(lastTs)) return points; const cutoffTs = lastTs - Number(hours)*3600*1000; return points.filter(p=>{ const t = Date.parse(String(p.x).replace(' ', 'T') + ':00'); return !isNaN(t) && t>=cutoffTs; }); }catch(e){ if(points.length<=hours) return points; return points.slice(points.length-hours); } }

let trendData, seriesTrendData, episodeData, rankBoardData;
let currentTrendHours = 0;

function buildTrendComparisonPoints(metricKey, basePoints, seriesId){ const metricMap = (seriesTrendData.metrics && seriesTrendData.metrics[metricKey])? seriesTrendData.metrics[metricKey] : {}; const raw = metricMap[String(seriesId)] || []; const byHour = {}; raw.forEach(item=>{ byHour[String(item.x)] = item; }); return basePoints.map(item=>{ const matched = byHour[String(item.x)]; return { x: item.x, y: matched ? matched.y : null }; }); }

function resolveTrendSeriesTitle(seriesId){ const source = Array.isArray(seriesTrendData.series)? seriesTrendData.series: []; const match = source.find(item=>String(item.series_id) === String(seriesId)); return match ? String(match.title) : String(seriesId); }

function renderAllTrends(hours){ currentTrendHours = hours; const selectedSeriesId = document.getElementById('trendSeriesSelect').value || ''; Object.keys(trendData).forEach(metricKey=>{ const spec = trendData[metricKey]; const points = cutByHours(spec.points, hours); let compareSpec = null; if(selectedSeriesId){ const comparePoints = buildTrendComparisonPoints(metricKey, points, selectedSeriesId); const hasValue = comparePoints.some(p=> toNum(p.y)!==null); if(hasValue){ compareSpec = { label: '单剧对照', color: '#ff6b35', points: comparePoints }; } } drawLineChart('chart-'+metricKey, points, spec.color, 'meta-'+metricKey+'-left', 'meta-'+metricKey+'-right', null, compareSpec); }); }

function refreshTrendSeriesOptions(){ const select = document.getElementById('trendSeriesSelect'); const search = document.getElementById('trendSeriesSearch'); const keyword = (search && search.value)? search.value.trim().toLowerCase() : ''; const source = Array.isArray(seriesTrendData.series)? seriesTrendData.series : []; const options = source.filter(item => String(item.title||'').toLowerCase().includes(keyword) || String(item.series_id||'').includes(keyword)); select.innerHTML = '<option value="">仅总体</option>' + options.map(item=> '<option value="'+item.series_id+'">'+item.title+' ('+item.series_id+')</option>').join(''); }

function refreshSeriesOptions(){ const select = document.getElementById('seriesSelect'); const search = document.getElementById('seriesSearch'); const keyword = (search && search.value)? search.value.trim().toLowerCase() : ''; const source = Array.isArray(episodeData.series)? episodeData.series : []; const options = source.filter(item => String(item.title||'').toLowerCase().includes(keyword) || String(item.series_id||'').includes(keyword)); select.innerHTML = options.map(item=> '<option value="'+item.series_id+'">'+item.title+' ('+item.series_id+')</option>').join(''); if(options.length>0) select.value = String(options[0].series_id); refreshHourOptions(); }

function refreshHourOptions(){ const sid = document.getElementById('seriesSelect').value; const hours = [...new Set((episodeData.rows||[]).filter(r=>String(r.series_id)===String(sid)).map(r=>r.snapshot_hour))].sort(); const hourSelect = document.getElementById('hourSelect'); hourSelect.innerHTML = hours.map(h=> '<option value="'+h+'">'+h+'</option>').join(''); if(hours.length>0) hourSelect.value = hours[hours.length-1]; renderEpisodeCharts(); }

function renderEpisodeCharts(){ const sid = document.getElementById('seriesSelect').value; const hour = document.getElementById('hourSelect').value; const rows = (episodeData.rows||[]).filter(r=>String(r.series_id)===String(sid) && r.snapshot_hour===hour).sort((a,b)=>a.episode_no - b.episode_no); const collectionVal = rows.find(r=> toNum(r.collection_count)!==null ); document.getElementById('episode-stat-collection').textContent = collectionVal? formatValue(collectionVal.collection_count,0) : '-'; document.getElementById('episode-stat-heat').textContent = collectionVal? formatValue(collectionVal.popularity,1) : '-'; const likePoints = rows.map(r=> ({ x: '第'+r.episode_no+'集', y: r.like_count })); const commentPoints = rows.map(r=> ({ x: '第'+r.episode_no+'集', y: r.comment_count })); drawLineChart('chart-episode-likes', likePoints, '#1364ff', 'meta-ep-likes-left', 'meta-ep-likes-right'); drawLineChart('chart-episode-comments', commentPoints, '#11a7b8', 'meta-ep-comments-left', 'meta-ep-comments-right'); }

function renderRankTable(){ const head = document.getElementById('rankTableHead'); const body = document.getElementById('rankTableBody'); head.innerHTML = '<tr><th>排名</th><th>剧名</th><th>剧集ID</th><th>上线日期</th><th>结束值</th><th>差值</th><th>增幅</th></tr>'; const rows = rankBoardData.rows || []; body.innerHTML = rows.slice(0,50).map((r,i)=> '<tr><td>'+(i+1)+'</td><td>'+r.title+'</td><td>'+r.series_id+'</td><td>'+(r.launch_date_tag||'-')+'</td><td>'+ (r.likes!=null? r.likes.toFixed(1):'-') +'</td><td>-</td><td>-</td></tr>').join(''); }

function buildScopeCards(){ const el = document.getElementById('scopeCards'); const meta = rankBoardData; const launch_tags = (rankBoardData.launch_tags||[]).slice(0,3).join(' / ')||'-'; el.innerHTML = `<div class="cards"><div class="card"><div class="label">统计起始（小时）</div><div class="value">${safeGet(meta,'start_hour','-')}</div></div><div class="card"><div class="label">最新观测（小时）</div><div class="value" id="meta-latest-val">${safeGet(meta,'latest_hour','-')}</div></div><div class="card"><div class="label">上线日期</div><div class="value">${launch_tags}</div></div></div>`; }

async function init(){
  try{
    const [meta, trend, series, episode, rank] = await Promise.all([
      fetchJson('meta'), fetchJson('trend'), fetchJson('series_trend'), fetchJson('episode'), fetchJson('rank_board')
    ]);
    trendData = trend; seriesTrendData = series; episodeData = episode; rankBoardData = rank;
    document.getElementById('meta-latest').textContent = meta.latest_hour || '-';
    document.getElementById('tinyDefs').textContent = '四指标：点赞 / 评论 / 热度 / 收藏';
    setDebug({ meta, sampleTrendKeys: Object.keys(trend||{}), firstSeries: (series.series||[])[0]||null });

    // populate select options
    refreshTrendSeriesOptions();
    refreshSeriesOptions();

    // render charts and table
    renderAllTrends(0);
    renderEpisodeCharts();
    renderRankTable();

    // wire UI
    document.getElementById('trendSeriesSearch').addEventListener('input', refreshTrendSeriesOptions);
    document.getElementById('trendSeriesSelect').addEventListener('change', ()=> renderAllTrends(currentTrendHours));
    document.getElementById('seriesSearch').addEventListener('input', refreshSeriesOptions);
    document.getElementById('seriesSelect').addEventListener('change', refreshHourOptions);
    document.getElementById('hourSelect').addEventListener('change', renderEpisodeCharts);

    // range buttons
    Array.from(document.querySelectorAll('#rangeButtons button')).forEach(btn=> btn.addEventListener('click', ()=>{ Array.from(document.querySelectorAll('#rangeButtons button')).forEach(b=>b.classList.remove('active')); btn.classList.add('active'); const hours = Number(btn.dataset.range||'0'); renderAllTrends(hours); }));

  }catch(err){ setDebug({error: String(err)}); }
}

init();
const BASE = "https://raw.githubusercontent.com/mengyuchun/short-drama-dashboard-data/main";

async function loadData() {
  const t = Date.now(); // 防缓存
  const urls = {
    meta: `${BASE}/meta.json?t=${t}`,
    trend: `${BASE}/trend.json?t=${t}`,
    series: `${BASE}/series_trend.json?t=${t}`,
    episode: `${BASE}/episode.json?t=${t}`,
    rank: `${BASE}/rank_board.json?t=${t}`,
  };

  const [meta, trend, seriesTrend, episode, rankBoard] = await Promise.all([
    fetch(urls.meta).then(r => r.json()),
    fetch(urls.trend).then(r => r.json()),
    fetch(urls.series).then(r => r.json()),
    fetch(urls.episode).then(r => r.json()),
    fetch(urls.rank).then(r => r.json()),
  ]);

  document.getElementById("generatedAt").textContent = meta.generated_at || "-";
  document.getElementById("latestHour").textContent = meta.latest_hour || "-";
  document.getElementById("trendCount").textContent = Object.keys(trend || {}).length;
  document.getElementById("seriesCount").textContent = (seriesTrend.series || []).length;
  document.getElementById("episodeRows").textContent = (episode.rows || []).length;
  document.getElementById("rankRows").textContent = (rankBoard.rows || []).length;

  document.getElementById("debug").textContent = JSON.stringify({
    meta,
    sampleTrendKeys: Object.keys(trend || {}),
    firstSeries: (seriesTrend.series || [])[0] || null
  }, null, 2);
}

loadData().catch(err => {
  document.getElementById("debug").textContent = "加载失败: " + String(err);
});

// 可选：每60秒自动刷新
setInterval(() => {
  loadData().catch(() => {});
}, 60 * 1000);