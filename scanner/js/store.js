/* ================================================================
   store.js — localStorage 기반 상태 저장소
================================================================ */
window.Store = (function () {

  const KEY = 'ycs.state.v1';

  const DEFAULTS = {
    apiKey: '',
    proxy: '',
    forceDemo: false,
    theme: 'light',
    depth: 50,
    includeShorts: true,
    channels: [],   // { id, title, thumb, subs, views, videoCount, publishedAt, uploadsPlaylist, handle }
    videos: [],     // 수집된 영상 원본
    scripts: {},    // { videoId: text }
    lastScan: null
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // 용량 초과 시 영상 캐시를 버리고 재시도
      try {
        const slim = { ...state, videos: state.videos.slice(0, 200) };
        localStorage.setItem(KEY, JSON.stringify(slim));
        state = slim;
      } catch (_) {
        console.warn('상태 저장 실패:', e);
      }
    }
  }

  const get = k => state[k];

  function set(k, v) { state[k] = v; save(); }

  function patch(obj) { Object.assign(state, obj); save(); }

  /* ── 채널 ── */
  function addChannel(ch) {
    if (state.channels.some(c => c.id === ch.id)) return false;
    state.channels.push(ch);
    save();
    return true;
  }
  function removeChannel(id) {
    state.channels = state.channels.filter(c => c.id !== id);
    state.videos   = state.videos.filter(v => v.channelId !== id);
    save();
  }
  function clearChannels() {
    state.channels = [];
    state.videos = [];
    save();
  }
  const channelById = id => state.channels.find(c => c.id === id) || null;

  /* ── 영상 ── */
  function setVideos(list) {
    state.videos = list;
    state.lastScan = new Date().toISOString();
    save();
  }
  function mergeVideos(list) {
    const map = new Map(state.videos.map(v => [v.id, v]));
    list.forEach(v => map.set(v.id, v));
    state.videos = [...map.values()];
    state.lastScan = new Date().toISOString();
    save();
  }
  const videoById = id => state.videos.find(v => v.id === id) || null;

  /* ── 스크립트 ── */
  function setScript(videoId, text) { state.scripts[videoId] = text; save(); }
  const getScript = videoId => state.scripts[videoId] || '';

  /* ── 모드 ── */
  const isDemo = () => state.forceDemo || !state.apiKey;

  function reset() {
    state = { ...DEFAULTS };
    try { localStorage.removeItem(KEY); } catch (_) {}
  }

  return {
    get, set, patch, save,
    addChannel, removeChannel, clearChannels, channelById,
    setVideos, mergeVideos, videoById,
    setScript, getScript,
    isDemo, reset,
    get raw() { return state; }
  };
})();
