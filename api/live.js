// Serverless function: best-effort detection of whether the channel is
// currently live, by checking the most recent entries in the sermon
// playlist for YouTube's `liveBroadcastDetails.isLiveNow` flag (the same
// field long relied on by open-source YouTube tooling).
//
// This exists as a self-hosted fallback so live detection doesn't depend
// entirely on an external service's uptime. It's still best-effort, not a
// guaranteed signal: YouTube's public RSS feed carries no live-status
// metadata at all, this assumes the live stream is already part of the
// playlist, and it may break if YouTube changes its page structure.
const PLAYLIST_ID = 'PLsHpz1KAchvrgZdyP_RYCzfQDhkvn5Bd7';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;

function extractAll(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

async function checkLive(videoId) {
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
    const feedRes = await fetch(FEED_URL);
    if (!feedRes.ok) throw new Error(`YouTube feed returned ${feedRes.status}`);
    const xml = await feedRes.text();

    const videoIds = extractAll(xml, 'entry')
      .slice(0, 5)
      .map(entry => (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1])
      .filter(Boolean);

    for (const videoId of videoIds) {
      if (await checkLive(videoId)) {
        return res.status(200).json({ live: true, url: `https://www.youtube.com/watch?v=${videoId}` });
      }
    }

    return res.status(200).json({ live: false });
  } catch (err) {
    return res.status(200).json({ live: false, error: err.message });
  }
};
