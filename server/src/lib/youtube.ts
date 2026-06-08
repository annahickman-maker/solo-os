/**
 * YouTube Data API client - ports the API calls from the old backend so the
 * new (file-based) server can fetch channel data without going through D1.
 */

type ChannelResponse = {
  items?: Array<{
    id: string;
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
    statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
  }>;
};

type PlaylistResponse = {
  items?: Array<{
    contentDetails?: { videoId?: string; videoPublishedAt?: string };
    snippet?: { title?: string; description?: string; resourceId?: { videoId?: string }; publishedAt?: string };
  }>;
  nextPageToken?: string;
};

type StatsResponse = {
  items?: Array<{
    id: string;
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails?: { duration?: string };
  }>;
};

export type ChannelInfo = {
  channelId: string;
  uploadsPlaylistId: string;
  subscriberCount: number;
  totalViews: number;
};

export type Upload = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: number; // unix seconds
  views?: number;
  likes?: number;
  comments?: number;
  duration_sec?: number;
};

function parseIsoDuration(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (
    parseInt(m[1] ?? '0', 10) * 3600 +
    parseInt(m[2] ?? '0', 10) * 60 +
    parseInt(m[3] ?? '0', 10)
  );
}

export async function resolveChannel(apiKey: string, handle: string): Promise<ChannelInfo> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'id,contentDetails,statistics');
  url.searchParams.set('forHandle', handle.startsWith('@') ? handle : `@${handle}`);
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`channels lookup failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as ChannelResponse;
  const item = data.items?.[0];
  if (!item || !item.contentDetails?.relatedPlaylists?.uploads) {
    throw new Error('channel uploads playlist not found');
  }
  return {
    channelId: item.id,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    subscriberCount: parseInt(item.statistics?.subscriberCount ?? '0', 10),
    totalViews: parseInt(item.statistics?.viewCount ?? '0', 10),
  };
}

export async function fetchAllUploads(apiKey: string, playlistId: string): Promise<Upload[]> {
  const all: Upload[] = [];
  let pageToken: string | undefined;
  let safety = 0;
  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`playlistItems failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as PlaylistResponse;
    for (const it of data.items ?? []) {
      const vid = it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId;
      const title = it.snippet?.title ?? '';
      const description = it.snippet?.description ?? '';
      const ts = it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt;
      if (!vid || !ts) continue;
      all.push({ videoId: vid, title, description, publishedAt: Math.floor(new Date(ts).getTime() / 1000) });
    }
    pageToken = data.nextPageToken;
    safety++;
  } while (pageToken && safety < 20);
  return all;
}

export async function fetchStatistics(
  apiKey: string,
  videoIds: string[]
): Promise<Map<string, { views: number; likes: number; comments: number; duration_sec: number }>> {
  const map = new Map<string, { views: number; likes: number; comments: number; duration_sec: number }>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'statistics,contentDetails');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) continue;
    const data = (await res.json()) as StatsResponse;
    for (const it of data.items ?? []) {
      map.set(it.id, {
        views: parseInt(it.statistics?.viewCount ?? '0', 10),
        likes: parseInt(it.statistics?.likeCount ?? '0', 10),
        comments: parseInt(it.statistics?.commentCount ?? '0', 10),
        duration_sec: it.contentDetails?.duration ? parseIsoDuration(it.contentDetails.duration) : 0,
      });
    }
  }
  return map;
}
