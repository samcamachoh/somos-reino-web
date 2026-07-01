// Serverless function: returns the 6 latest sermon videos from the church's
// YouTube playlist, read from YouTube's public RSS feed (no API key needed).
// The feed is already ordered newest-first by YouTube.
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

function parseEntry(entry) {
  const videoId = (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
  if (!videoId) return null;

  const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  const published = (entry.match(/<published>(.*?)<\/published>/) || [])[1];
  const thumbnail = (entry.match(/<media:thumbnail url="(.*?)"/) || [])[1];
  const publishedDate = published ? new Date(published) : null;

  return {
    videoId,
    title: title ? decodeEntities(title) : 'Sermón',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    date: publishedDate
      ? publishedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '',
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  try {
    const feedRes = await fetch(FEED_URL);
    if (!feedRes.ok) throw new Error(`YouTube feed returned ${feedRes.status}`);
    const xml = await feedRes.text();

    const videos = extractAll(xml, 'entry')
      .slice(0, 6)
      .map(parseEntry)
      .filter(Boolean);

    return res.status(200).json({ videos });
  } catch (err) {
    return res.status(500).json({ videos: [], error: err.message });
  }
};
