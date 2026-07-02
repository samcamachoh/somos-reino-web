// Serverless function: best-effort detection of whether the channel is
// currently live.
//
// Primary approach: YouTube channels expose a stable "/live" URL
// (youtube.com/channel/<id>/live) that serves the current live broadcast's
// watch page when one is active, or the normal channel page otherwise. This
// is the same trick long relied on by open-source "is this channel live"
// checkers, and — unlike scanning the sermon playlist — it does not depend
// on the broadcast having been added to that playlist, which usually only
// happens after the stream ends.
//
// The channel ID is read from the sermon playlist's RSS feed (no API key
// needed) instead of being hardcoded. If that lookup fails for any reason,
// this falls back to checking the most recent playlist entries directly.
const PLAYLIST_ID = 'PLsHpz1KAchvrgZdyP_RYCzfQDhkvn5Bd7';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;

function extractAll(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

async function fetchFeed() {
  const feedRes = await fetch(FEED_URL);
  if (!feedRes.ok) throw new Error(`YouTube feed returned ${feedRes.status}`);
  return feedRes.text();
}

async function checkChannelLive(channelId) {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) return null;
  const html = await res.text();

  const liveMatch = html.match(/"liveBroadcastDetails":\{"isLiveNow":(true|false)/);
  if (!liveMatch || liveMatch[1] !== 'true') return null;

  const videoIdMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
  return videoIdMatch ? videoIdMatch[1] : null;
}

async function checkVideoLive(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) return false;
  const html = await res.text();
  const match = html.match(/"liveBroadcastDetails":\{"isLiveNow":(true|false)/);
  return !!match && match[1] === 'true';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  try {
    const xml = await fetchFeed();

    const channelIdMatch = xml.match(/<yt:channelId>(.*?)<\/yt:channelId>/);
    if (channelIdMatch) {
      const liveVideoId = await checkChannelLive(channelIdMatch[1]);
      if (liveVideoId) {
        return res.status(200).json({ live: true, url: `https://www.youtube.com/watch?v=${liveVideoId}` });
      }
    }

    // Fallback: the channel's /live redirect can lag or fail to resolve —
    // check the most recent playlist entries directly.
    const videoIds = extractAll(xml, 'entry')
      .slice(0, 5)
      .map(entry => (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1])
      .filter(Boolean);

    for (const videoId of videoIds) {
      if (await checkVideoLive(videoId)) {
        return res.status(200).json({ live: true, url: `https://www.youtube.com/watch?v=${videoId}` });
      }
    }

    return res.status(200).json({ live: false });
  } catch (err) {
    return res.status(200).json({ live: false, error: err.message });
  }
};
