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
//
// Field parsing is scoped to the `liveBroadcastDetails` JSON object first,
// then reads its fields independent of key order — YouTube's exact key
// ordering isn't a stable contract, so anchoring to it is fragile.
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

function readLiveBroadcastDetails(html) {
  const objMatch = html.match(/"liveBroadcastDetails":\{([^}]*)\}/);
  if (!objMatch) return { found: false, isLiveNow: false };
  const inner = objMatch[1];
  return { found: true, isLiveNow: /"isLiveNow":true/.test(inner) };
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
  const html = res.ok ? await res.text() : '';
  return { status: res.status, ok: res.ok, html };
}

async function fetchFeed() {
  const feedRes = await fetch(FEED_URL);
  if (!feedRes.ok) throw new Error(`YouTube feed returned ${feedRes.status}`);
  return feedRes.text();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  const debug = req.query && (req.query.debug === '1' || req.query.debug === 'true');
  const trace = { channelId: null, channelCheck: null, fallbackChecks: [] };

  try {
    const xml = await fetchFeed();
    const channelId = extractChannelId(xml);
    trace.channelId = channelId;

    if (channelId) {
      const page = await fetchPage(`https://www.youtube.com/channel/${channelId}/live`);
      const liveInfo = page.ok ? readLiveBroadcastDetails(page.html) : { found: false, isLiveNow: false };
      trace.channelCheck = {
        status: page.status,
        htmlLength: page.html.length,
        hasLiveBroadcastDetailsKey: page.html.includes('liveBroadcastDetails'),
        parsedIsLiveNow: liveInfo.isLiveNow,
      };

      if (liveInfo.isLiveNow) {
        const videoIdMatch = page.html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
        trace.channelCheck.canonicalVideoId = videoIdMatch ? videoIdMatch[1] : null;
        if (videoIdMatch) {
          const payload = { live: true, url: `https://www.youtube.com/watch?v=${videoIdMatch[1]}` };
          return res.status(200).json(debug ? { ...payload, debug: trace } : payload);
        }
      }
    }

    // Fallback: the channel's /live redirect can lag or fail to resolve —
    // check the most recent playlist entries directly.
    const videoIds = extractAll(xml, 'entry')
      .slice(0, 5)
      .map(entry => (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1])
      .filter(Boolean);

    for (const videoId of videoIds) {
      const page = await fetchPage(`https://www.youtube.com/watch?v=${videoId}`);
      const liveInfo = page.ok ? readLiveBroadcastDetails(page.html) : { found: false, isLiveNow: false };
      trace.fallbackChecks.push({
        videoId,
        status: page.status,
        hasLiveBroadcastDetailsKey: page.html.includes('liveBroadcastDetails'),
        parsedIsLiveNow: liveInfo.isLiveNow,
      });

      if (liveInfo.isLiveNow) {
        const payload = { live: true, url: `https://www.youtube.com/watch?v=${videoId}` };
        return res.status(200).json(debug ? { ...payload, debug: trace } : payload);
      }
    }

    const payload = { live: false };
    return res.status(200).json(debug ? { ...payload, debug: trace } : payload);
  } catch (err) {
    const payload = { live: false, error: err.message };
    return res.status(200).json(debug ? { ...payload, debug: trace } : payload);
  }
};
