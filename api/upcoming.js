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
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchFeed() {
  const feedRes = await fetch(FEED_URL);
  if (!feedRes.ok) throw new Error(`YouTube feed returned ${feedRes.status}`);
  return feedRes.text();
}

function parseUpcomingFromHtml(html, fallbackVideoId) {
  const objMatch = html.match(/"liveBroadcastDetails":\{([^}]*)\}/);
  if (!objMatch) return null;
  const inner = objMatch[1];

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
  });
  if (!res.ok) return null;
  const html = await res.text();
  return parseUpcomingFromHtml(html, null);
}

async function checkVideoUpcoming(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  return parseUpcomingFromHtml(html, videoId);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

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
    return res.status(200).json({ upcoming: null, error: err.message });
  }
};
