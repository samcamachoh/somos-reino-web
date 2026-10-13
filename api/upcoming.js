// Serverless function: best-effort detection of an upcoming (scheduled but
// not yet started) live stream.
//
// Primary approach: the channel's stable "/live" URL (see api/live.js for
// details) also serves the "waiting room" watch page for a scheduled stream
// before it starts, carrying an `isLiveNow:false` + future `startTimestamp`
// in its `liveBroadcastDetails`. Checking that page doesn't depend on the
// stream having been added to the sermon playlist ahead of time.
//
// The channel ID is read from the sermon playlist's RSS feed (no API key
// needed). If that lookup fails, this falls back to checking the most
// recent playlist entries directly. This is still best-effort, not a
// guaranteed signal — it may break if YouTube changes its page structure.
//
// Field parsing is scoped to the `liveBroadcastDetails` JSON object first,
// then reads its fields independent of key order, since anchoring to an
// exact key order is fragile against YouTube's page-structure changes.
const PLAYLIST_ID = 'PLsHpz1KAchvrgZdyP_RYCzfQDhkvn5Bd7';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;
const FETCH_MS = 8000;

function extractAll(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function extractChannelId(xml) {
  const tagMatch = xml.match(/<yt:channelId>(.*?)<\/yt:channelId>/);
  if (tagMatch) return tagMatch[1];
  const uriMatch = xml.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  return uriMatch ? uriMatch[1] : null;
}

function decodeEntities(str) {
  try {
    return str
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  } catch (e) {
    return str;
  }
}

async function fetchFeed() {
  const feedRes = await fetch(FEED_URL, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!feedRes.ok) throw new Error(`YouTube feed returned ${feedRes.status}`);
  return feedRes.text();
}

function extractLiveBroadcastInner(html) {
  const start = html.indexOf('"liveBroadcastDetails":{');
  if (start < 0) return null;
  let i = start + '"liveBroadcastDetails":'.length;
  if (html[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < html.length && j < i + 4000; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return html.slice(i + 1, j);
    }
  }
  return null;
}

function parseUpcomingFromHtml(html, fallbackVideoId) {
  const inner = extractLiveBroadcastInner(html);
  if (!inner) return null;

  const isLiveNow = /"isLiveNow":true/.test(inner);
  if (isLiveNow) return null;

  const startMatch = inner.match(/"startTimestamp":"([^"]+)"/);
  if (!startMatch) return null;

  const scheduledStartTime = new Date(startMatch[1]);
  if (isNaN(scheduledStartTime.getTime()) || scheduledStartTime.getTime() < Date.now()) return null;

  const videoIdMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
  const videoId = videoIdMatch ? videoIdMatch[1] : fallbackVideoId;
  if (!videoId) return null;

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch
    ? decodeEntities(titleMatch[1]).replace(/\s*-\s*YouTube$/, '')
    : 'Próxima transmisión en vivo';

  return {
    videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    scheduledStartTime: scheduledStartTime.toISOString(),
  };
}

async function checkChannelUpcoming(channelId) {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return null;
  const html = await res.text();
  return parseUpcomingFromHtml(html, null);
}

async function checkVideoUpcoming(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return null;
  const html = await res.text();
  return parseUpcomingFromHtml(html, videoId);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Keep TTL in line with /api/live so a go-live doesn't leave a stale
  // "upcoming" badge for up to 10 minutes.
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const xml = await fetchFeed();

    const channelId = extractChannelId(xml);
    if (channelId) {
      const upcoming = await checkChannelUpcoming(channelId);
      if (upcoming) return res.status(200).json({ upcoming });
    }

    // Fallback: the channel's /live redirect can lag or fail to resolve —
    // check the most recent playlist entries directly.
    const videoIds = extractAll(xml, 'entry')
      .slice(0, 5)
      .map(entry => (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1])
      .filter(Boolean);

    for (const videoId of videoIds) {
      const upcoming = await checkVideoUpcoming(videoId);
      if (upcoming) return res.status(200).json({ upcoming });
    }

    return res.status(200).json({ upcoming: null });
  } catch (err) {
    return res.status(200).json({ upcoming: null, error: 'Upstream unavailable' });
  }
};
