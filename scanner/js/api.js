/* ================================================================
   api.js — YouTube Data API v3 래퍼 (+ 데모 모드 폴백)
================================================================ */
window.API = (function () {

  const BASE = 'https://www.googleapis.com/youtube/v3';

  /* ── 저수준 요청 ── */
  async function call(endpoint, params) {
    const key = Store.get('apiKey');
    if (!key) throw new Error('API 키가 설정되어 있지 않습니다.');

    const qs = new URLSearchParams({ ...params, key });
    const res = await fetch(`${BASE}/${endpoint}?${qs}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const reason = json?.error?.errors?.[0]?.reason || '';
      const msg = json?.error?.message || res.statusText;
      if (reason === 'quotaExceeded')
        throw new Error('API 일일 할당량을 모두 사용했습니다. 내일 다시 시도하거나 데모 모드를 사용하세요.');
      if (reason === 'keyInvalid' || res.status === 400)
        throw new Error('API 키가 올바르지 않습니다. 설정에서 다시 확인해 주세요. (' + msg + ')');
      if (res.status === 403)
        throw new Error('API 접근이 거부되었습니다. YouTube Data API v3 활성화 여부와 키 제한을 확인하세요.');
      throw new Error('API 오류: ' + msg);
    }
    return json;
  }

  /* ── 입력 문자열 해석 ── */
  function parseInput(raw) {
    let s = String(raw || '').trim();
    if (!s) return null;
    /* 한글 핸들이 퍼센트 인코딩된 URL(@%EC%9D%B4...)도 인식하도록 디코딩 */
    try { if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s); } catch (_) { /* 원본 유지 */ }

    let m = s.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i);
    if (m) return { type: 'id', value: m[1] };

    m = s.match(/youtube\.com\/@([\w.\-가-힣]+)/i);
    if (m) return { type: 'handle', value: m[1] };

    m = s.match(/youtube\.com\/(?:c|user)\/([\w.\-가-힣]+)/i);
    if (m) return { type: 'username', value: m[1] };

    if (/^UC[\w-]{20,}$/.test(s)) return { type: 'id', value: s };
    if (/^@/.test(s))             return { type: 'handle', value: s.slice(1) };
    return { type: 'query', value: s };
  }

  /* ── 응답 정규화 ── */
  function normalizeChannel(item) {
    const sn = item.snippet || {}, st = item.statistics || {};
    return {
      id: item.id,
      title: sn.title || '(제목 없음)',
      handle: sn.customUrl || '',
      thumb: sn.thumbnails?.default?.url || Mock.placeholder(String(sn.title || '?').slice(0, 2), 88, 88, 1),
      subs: Number(st.subscriberCount || 0),
      views: Number(st.viewCount || 0),
      videoCount: Number(st.videoCount || 0),
      publishedAt: sn.publishedAt || new Date().toISOString(),
      uploadsPlaylist: item.contentDetails?.relatedPlaylists?.uploads || ('UU' + String(item.id).slice(2)),
      country: sn.country || '',
      demo: false
    };
  }

  function normalizeVideo(item, channel) {
    const sn = item.snippet || {}, st = item.statistics || {}, cd = item.contentDetails || {};
    return {
      id: item.id,
      channelId: sn.channelId || channel?.id || '',
      channelTitle: sn.channelTitle || channel?.title || '',
      title: sn.title || '(제목 없음)',
      description: sn.description || '',
      tags: sn.tags || [],
      publishedAt: sn.publishedAt,
      duration: U.durationToSec(cd.duration),
      views: Number(st.viewCount || 0),
      likes: Number(st.likeCount || 0),
      comments: Number(st.commentCount || 0),
      thumb: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '',
      caption: '',
      demo: false
    };
  }

  /* ── 채널 조회 ── */
  async function resolveChannel(raw, knownTitle) {
    const parsed = parseInput(raw);
    if (!parsed) throw new Error('채널 주소를 입력해 주세요.');

    if (Store.isDemo()) {
      const preset = Mock.channels().find(c =>
        c.handle.toLowerCase().includes(String(parsed.value).toLowerCase()) ||
        c.id === parsed.value || c.title === parsed.value);
      return preset || Mock.customChannel(raw, knownTitle, '@' + parsed.value);
    }

    const part = 'snippet,statistics,contentDetails';
    let res = null;

    if (parsed.type === 'id')            res = await call('channels', { part, id: parsed.value });
    else if (parsed.type === 'handle')   res = await call('channels', { part, forHandle: '@' + parsed.value });
    else if (parsed.type === 'username') res = await call('channels', { part, forUsername: parsed.value });

    if (!res?.items?.length) {
      // 마지막 수단: 검색 (할당량 100 소모)
      const found = await call('search', {
        part: 'snippet', type: 'channel', maxResults: 1, q: parsed.value
      });
      const chId = found.items?.[0]?.snippet?.channelId || found.items?.[0]?.id?.channelId;
      if (!chId) throw new Error(`"${raw}" 채널을 찾지 못했습니다.`);
      res = await call('channels', { part, id: chId });
    }
    if (!res.items?.length) throw new Error(`"${raw}" 채널을 찾지 못했습니다.`);
    return normalizeChannel(res.items[0]);
  }

  /** 여러 채널의 최신 통계 갱신 */
  async function refreshChannels(ids) {
    if (Store.isDemo() || !ids.length) return [];
    const out = [];
    for (const group of U.chunk(ids, 50)) {
      const res = await call('channels', {
        part: 'snippet,statistics,contentDetails', id: group.join(',')
      });
      (res.items || []).forEach(i => out.push(normalizeChannel(i)));
    }
    return out;
  }

  /* ── 영상 수집 ── */
  async function fetchChannelVideos(channel, depth, onProgress) {
    if (Store.isDemo() || channel.demo) {
      await new Promise(r => setTimeout(r, 220));         // 로딩 감각 유지
      onProgress?.(1);
      return Mock.videosFor(channel, depth);
    }

    /* 1) 업로드 재생목록에서 영상 ID 수집 */
    const ids = [];
    let pageToken = '';
    while (ids.length < depth) {
      const res = await call('playlistItems', {
        part: 'contentDetails',
        playlistId: channel.uploadsPlaylist,
        maxResults: String(Math.min(50, depth - ids.length)),
        ...(pageToken ? { pageToken } : {})
      });
      (res.items || []).forEach(i => {
        const vid = i.contentDetails?.videoId;
        if (vid) ids.push(vid);
      });
      onProgress?.(Math.min(ids.length / depth, 0.5));
      pageToken = res.nextPageToken || '';
      if (!pageToken) break;
    }

    /* 2) 영상 상세 + 통계 */
    const videos = [];
    const groups = U.chunk(ids, 50);
    for (let i = 0; i < groups.length; i++) {
      const res = await call('videos', {
        part: 'snippet,statistics,contentDetails',
        id: groups[i].join(',')
      });
      (res.items || []).forEach(item => videos.push(normalizeVideo(item, channel)));
      onProgress?.(0.5 + ((i + 1) / groups.length) * 0.5);
    }
    return videos;
  }

  /* ── 자막 ── */
  const CAPTION_LANGS = ['ko', 'en'];

  /**
   * 자막 원문 수집.
   * youtube.com/api/timedtext 는 CORS 를 허용하지 않으므로
   * 설정에 프록시가 지정된 경우에만 시도한다.
   */
  async function fetchCaption(video) {
    if (video.demo && video.caption) return video.caption;

    const proxy = (Store.get('proxy') || '').trim();
    if (!proxy) {
      throw new Error('자막 자동 수집에는 프록시가 필요합니다. 설정에서 프록시 URL을 지정하거나 대본을 직접 붙여넣어 주세요.');
    }

    for (const lang of CAPTION_LANGS) {
      const target = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(video.id)}&lang=${lang}&fmt=json3`;
      try {
        const res = await fetch(proxy + encodeURIComponent(target));
        if (!res.ok) continue;
        const text = await res.text();
        const parsed = parseCaption(text);
        if (parsed) return parsed;
      } catch (_) { /* 다음 언어 시도 */ }
    }
    throw new Error('자막을 찾지 못했습니다. 자막이 없는 영상이거나 프록시가 응답하지 않았습니다.');
  }

  function parseCaption(text) {
    if (!text) return '';
    /* json3 형식 */
    try {
      const j = JSON.parse(text);
      if (j.events) {
        const out = j.events
          .flatMap(e => (e.segs || []).map(s => s.utf8))
          .join('')
          .replace(/\n+/g, ' ')
          .trim();
        if (out) return out;
      }
    } catch (_) { /* XML 형식으로 재시도 */ }

    if (text.includes('<text')) {
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const out = Array.from(doc.getElementsByTagName('text'))
        .map(n => n.textContent).join(' ')
        .replace(/\s+/g, ' ').trim();
      if (out) return out;
    }
    return '';
  }

  return { call, parseInput, resolveChannel, refreshChannels, fetchChannelVideos, fetchCaption };
})();
