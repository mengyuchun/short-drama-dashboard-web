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