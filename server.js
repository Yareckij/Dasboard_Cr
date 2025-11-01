const express = require('express');
const path = require('path');
const googleTrends = require('google-trends-api');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const cache = new Map();
function getCached(key, ttl = 60) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.t > ttl * 1000) { cache.delete(key); return null; }
  return v.data;
}
function setCached(key, data) { cache.set(key, { t: Date.now(), data }); }

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/trends', async (req, res) => {
  try {
    const q = req.query.q || 'bitcoin';
    const days = parseInt(req.query.days || '90', 10);
    const cacheKey = `trends:${q}:${days}`;
    const cached = getCached(cacheKey, 60 * 60);
    if (cached) return res.json(cached);

    const endTime = new Date();
    const startTime = new Date(Date.now() - days * 24 * 3600 * 1000);
    const raw = await googleTrends.interestOverTime({ keyword: q, startTime, endTime, geo: '' });
    const parsed = JSON.parse(raw);
    const timeline = (parsed.default && parsed.default.timelineData) ? parsed.default.timelineData.map(item => ({
      date: parseInt(item.time, 10),
      value: item.value[0],
      formatted: item.formattedTime
    })) : [];
    setCached(cacheKey, timeline);
    res.json(timeline);
  } catch (err) {
    console.error('trends error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/reddit', async (req, res) => {
  try {
    const q = req.query.q || 'bitcoin';
    const days = parseInt(req.query.days || '90', 10);
    const cacheKey = `reddit:${q}:${days}`;
    const cached = getCached(cacheKey, 60 * 30);
    if (cached) return res.json(cached);

    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - days * 24 * 3600;
    const url = `https://api.pushshift.io/reddit/search/comment/?q=${encodeURIComponent(q)}&after=${startTime}&before=${endTime}&size=0&aggs=created_utc&frequency=day`;
    const r = await fetch(url);
    const json = await r.json();
    const agg = json.aggs && json.aggs.created_utc ? json.aggs.created_utc : [];
    const result = agg.map(item => ({ date: item.key, count: item.doc_count }));
    setCached(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('reddit error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
