// Serverless function: best-effort detection of an upcoming (scheduled but
// not yet started) live stream.
//
// YouTube's public RSS feed does NOT expose broadcast status (live /
// upcoming / none) — it only lists published entries, so there is no
// reliable RSS-only signal for "this is scheduled to go live later."
// Detecting that properly requires the YouTube Data API (search.list with
// eventType=upcoming) and an API key, which this project doesn't have.
//
// As a best-effort fallback with no API key, this checks the watch pages of
// the most recent playlist entries for the `liveBroadcastDetails` block
// YouTube embeds in every stream's page data (the same field long relied on
// by open-source YouTube tooling). If a video's `isLiveNow` is false but it
// carries a future `startTimestamp`, it's treated as upcoming. This can
// miss streams (e.g. ones not yet in the playlist) and may break if
// YouTube changes its page structure — it is not a guaranteed signal.
const PLAYLIST_ID = 'PLsHpz1KAchvrgZdyP_RYCzfQDhkvn5Bd7';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;

function extractAll(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
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

async function checkUpcoming(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) return null;
  const html = await res.text();

  const match = html.match(/"liveBroadcastDetails":\{"isLiveNow":(true|false)(?:,"startTimestamp":"([^"]+)")?/);
  if (!match) return null;

  const isLiveNow = match[1] === 'true';
  const startTimestamp = match[2];
  if (isLiveNow || !startTimestamp) return null;

  const scheduledStartTime = new Date(startTimestamp);
  if (isNaN(scheduledStartTime.getTime()) || scheduledStartTime.getTime() < Date.now()) return null;

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  try {
    const feedRes = await fetch(FEED_URL);
    if (!feedRes.ok) throw new Error(`YouTube feed returned ${feedRes.status}`);
    const xml = await feedRes.text();

    const videoIds = extractAll(xml, 'entry')
      .slice(0, 5)
      .map(entry => (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1])
      .filter(Boolean);

    for (const videoId of videoIds) {
      const upcoming = await checkUpcoming(videoId);
      if (upcoming) return res.status(200).json({ upcoming });
    }

    return res.status(200).json({ upcoming: null });
  } catch (err) {
    return res.status(200).json({ upcoming: null, error: err.message });
  }
};
