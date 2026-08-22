/* ================================================================
   app.js — 컨트롤러 / 이벤트 바인딩
================================================================ */
(function () {

  const { $, $$ } = U;

  const App = {
    videos: [],       // 지표가 계산된 영상
    scanning: false
  };

  /* ══════════ 추천 채널 프리셋 ══════════ */
  const SEED_CHANNELS = [
    { title: 'natv 국회방송',  url: 'https://www.youtube.com/@NATV_korea' },
    { title: '이재명',         url: 'https://www.youtube.com/@%EC%9D%B4%EC%9E%AC%EB%AA%85tv' },
    { title: '델리민주',       url: 'https://www.youtube.com/@dailyminjoo' },
    { title: 'KTV 국민방송',   url: 'https://www.youtube.com/@KTV_korea' }
  ].map(c => ({ ...c, handle: '@' + decodeURIComponent(c.url).split('/@')[1] }));

  /* ══════════ 초기화 ══════════ */
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(Store.get('theme'));
    syncSettingsUI();
    bindEvents();
    recompute();
    if (Store.raw.videos.length) {
      U.toast(`이전 스캔 데이터 ${U.comma(Store.raw.videos.length)}개를 불러왔습니다.`);
    }
  });

  /* ══════════ 테마 ══════════ */
  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    Store.set('theme', t);
    const btn = $('#btnTheme');
    if (btn) btn.textContent = t === 'dark' ? '☀' : '◐';
  }

  /* ══════════ 설정 ══════════ */
  function syncSettingsUI() {
    $('#setKey').value   = Store.get('apiKey');
    $('#setProxy').value = Store.get('proxy');
    $('#setDemo').checked = Store.get('forceDemo');
    $('#optDepth').value = String(Store.get('depth'));
    $('#optShorts').checked = Store.get('includeShorts');

    const demo = Store.isDemo();
    const badge = $('#modeBadge');
    badge.textContent = demo ? '데모 모드' : 'API 연결됨';
    badge.className = 'badge ' + (demo ? 'badge--demo' : 'badge--live');
    $('#quotaHint').textContent = demo
      ? '데모 모드에서는 API 할당량을 사용하지 않습니다.'
      : '채널 1개당 약 (수집 수 ÷ 50) × 2 + 1 유닛의 할당량을 사용합니다.';
  }

  /* ══════════ 재계산 & 렌더 ══════════ */
  function recompute() {
    const channels = Store.get('channels');
    const raw = Store.get('videos');
    App.videos = Analytics.enrich(raw, channels);

    UI.channelList(channels);
    renderSeeds();
    UI.fillChannelSelects(channels);
    UI.fillVideoSelect(App.videos);
    UI.dashboard(Analytics.summary(channels, App.videos));
    renderIssues();
    renderPatterns();
  }

  /* ══════════ 이슈 영상 탭 ══════════ */
  function filteredVideos() {
    const period  = Number($('#fPeriod').value);
    const sort    = $('#fSort').value;
    const chId    = $('#fChannel').value;
    const type    = $('#fType').value;
    const q       = $('#fQuery').value.trim().toLowerCase();
    const shorts  = Store.get('includeShorts');

    let list = App.videos.filter(v => {
      if (period && U.daysSince(v.publishedAt) > period) return false;
      if (chId && v.channelId !== chId) return false;
      if (type === 'short' && !v.isShort) return false;
      if (type === 'long'  && v.isShort)  return false;
      if (!shorts && !type && v.isShort)  return false;
      if (q && !v.title.toLowerCase().includes(q)) return false;
      return true;
    });

    const cmp = {
      score:  (a, b) => b.score - a.score,
      views:  (a, b) => b.views - a.views,
      vpd:    (a, b) => b.vpd - a.vpd,
      ratio:  (a, b) => b.ratio - a.ratio,
      engage: (a, b) => b.engage - a.engage,
      date:   (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
    }[sort];

    return list.sort(cmp);
  }

  function renderIssues() {
    UI.videoGrid(filteredVideos(), App.videos.length);
  }

  /* ══════════ 패턴 탭 ══════════ */
  function renderPatterns() {
    const scope = $('#pScope').value;
    const chId  = $('#pChannel').value;

    let pool = App.videos.filter(v => !chId || v.channelId === chId);
    if (!Store.get('includeShorts')) pool = pool.filter(v => !v.isShort);

    let target = pool;
    let label  = '수집된 전체 영상';
    if (scope === 'top') {
      const sorted = pool.slice().sort((a, b) => b.score - a.score);
      const n = Math.max(Math.ceil(sorted.length * 0.2), Math.min(5, sorted.length));
      target = sorted.slice(0, n);
      label = '상위 이슈 영상 20%';
    }
    UI.patterns(target.length ? Analytics.patterns(target, pool) : null, label);
  }

  /* ══════════ 추천 채널 ══════════ */
  function renderSeeds() {
    const registered = Store.get('channels');
    const isAdded = seed => registered.some(c =>
      (c.handle || '').toLowerCase().replace(/^@/, '') === seed.handle.toLowerCase().replace(/^@/, '') ||
      c.title === seed.title);

    $('#seedList').innerHTML = SEED_CHANNELS.map((s, i) => {
      const added = isAdded(s);
      return `<li>
        <button class="seed" type="button" data-seed="${i}" ${added ? 'disabled' : ''}>
          <span class="seed__plus">${added ? '✓' : '+'}</span>
          <span class="seed__body">
            <span class="seed__name">${U.esc(s.title)}</span>
            <span class="seed__handle">${U.esc(s.handle)}</span>
          </span>
        </button></li>`;
    }).join('');

    const remain = SEED_CHANNELS.filter(s => !isAdded(s)).length;
    const all = $('#btnSeedAll');
    all.disabled = remain === 0;
    all.textContent = remain === 0 ? '등록 완료' : `모두 등록 (${remain})`;
  }

  async function addSeeds(seeds) {
    const added = [];
    for (const seed of seeds) {
      try {
        const ch = await API.resolveChannel(seed.url, seed.title);
        if (Store.addChannel(ch)) added.push(ch);
      } catch (e) {
        U.toast(`${seed.title}: ${e.message}`, 'err');
      }
    }
    recompute();
    if (added.length) {
      U.toast(`채널 ${added.length}개를 등록했습니다.`, 'ok');
      await scanChannels(added);
    }
  }

  /* ══════════ 채널 추가 ══════════ */
  async function addChannel(raw) {
    const btn = $('#addForm button');
    btn.disabled = true;
    try {
      const ch = await API.resolveChannel(raw);
      if (!Store.addChannel(ch)) {
        U.toast('이미 등록된 채널입니다.', 'err');
        return;
      }
      $('#addInput').value = '';
      recompute();
      U.toast(`"${ch.title}" 채널을 등록했습니다.`, 'ok');
      await scanChannels([ch]);
    } catch (e) {
      U.toast(e.message || '채널을 등록하지 못했습니다.', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  /* ══════════ 스캔 ══════════ */
  async function scanChannels(channels) {
    if (App.scanning) return;
    if (!channels.length) {
      U.toast('먼저 채널을 등록해 주세요.', 'err');
      return;
    }

    App.scanning = true;
    const btn = $('#btnScan');
    btn.classList.add('is-loading');
    btn.disabled = true;

    const depth = Number($('#optDepth').value) || 50;
    Store.set('depth', depth);

    const collected = [];
    let failed = 0;

    try {
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        UI.progress(i / channels.length, `${ch.title} 수집 중… (${i + 1}/${channels.length})`);
        try {
          const list = await API.fetchChannelVideos(ch, depth, p => {
            UI.progress((i + p) / channels.length, `${ch.title} 수집 중… (${i + 1}/${channels.length})`);
          });
          collected.push(...list);
        } catch (e) {
          failed++;
          U.toast(`${ch.title}: ${e.message}`, 'err');
        }
      }

      if (collected.length) {
        Store.mergeVideos(collected);
        recompute();
      }

      UI.progress(1, '완료');
      setTimeout(() => UI.progress(null), 600);

      if (collected.length) {
        U.toast(`영상 ${U.comma(collected.length)}개를 수집했습니다.${failed ? ` (실패 ${failed}개 채널)` : ''}`, 'ok');
      }
    } finally {
      App.scanning = false;
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  }

  /* ══════════ 데모 채널 ══════════ */
  async function loadDemo() {
    Store.set('forceDemo', true);
    syncSettingsUI();
    Mock.channels().forEach(c => Store.addChannel(c));
    recompute();
    await scanChannels(Store.get('channels'));
  }

  /* ══════════ CSV ══════════ */
  function exportCSV() {
    const list = filteredVideos();
    if (!list.length) { U.toast('내보낼 영상이 없습니다.', 'err'); return; }
    const rows = [[
      '채널', '제목', '업로드일', '길이(초)', '형식', '조회수', '좋아요', '댓글',
      '일평균 조회수', '채널중앙값 대비', '구독자 대비(%)', '참여율(%)', '이슈점수', '등급', 'URL'
    ]];
    list.forEach(v => rows.push([
      v.channelTitle, v.title, U.dateLabel(v.publishedAt), v.duration,
      v.isShort ? '숏츠' : '롱폼', v.views, v.likes, v.comments,
      Math.round(v.vpd), v.outperform.toFixed(2), (v.ratio * 100).toFixed(1),
      (v.engage * 100).toFixed(2), v.score.toFixed(1), v.tier.label, v.url
    ]));
    U.downloadCSV(rows, `youtube-scan-${U.dateLabel(new Date().toISOString()).replace(/\./g, '')}.csv`);
    U.toast('CSV를 내보냈습니다.', 'ok');
  }

  /* ══════════ 스크립트 탭 ══════════ */
  function currentScriptVideo() {
    const id = $('#sVideo').value;
    return id ? App.videos.find(v => v.id === id) : null;
  }

  function analyzeScript() {
    const v = currentScriptVideo();
    const text = $('#scriptText').value;
    if (!text.trim()) { U.toast('분석할 텍스트가 없습니다.', 'err'); return; }
    if (v) Store.setScript(v.id, text);
    UI.scriptResult(Analytics.script(text, v), v);
    U.toast('스크립트를 분석했습니다.', 'ok');
  }

  async function fetchCaption() {
    const v = currentScriptVideo();
    if (!v) { U.toast('먼저 영상을 선택해 주세요.', 'err'); return; }
    const btn = $('#btnFetchCap');
    btn.disabled = true;
    btn.textContent = '수집 중…';
    try {
      const text = await API.fetchCaption(v);
      $('#scriptText').value = text;
      Store.setScript(v.id, text);
      UI.scriptResult(Analytics.script(text, v), v);
      U.toast('자막을 수집했습니다.', 'ok');
    } catch (e) {
      U.toast(e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '⇩ 자막 자동 수집 시도';
    }
  }

  function openScriptTab(videoId) {
    switchTab('scripts');
    $('#sVideo').value = videoId;
    loadScriptForVideo();
    $('#videoModal').hidden = true;
  }

  function loadScriptForVideo() {
    const v = currentScriptVideo();
    if (!v) { $('#scriptText').value = ''; UI.scriptResult(null); return; }
    const saved = Store.getScript(v.id) || (v.demo ? '' : '');
    $('#scriptText').value = saved;
    UI.scriptResult(saved ? Analytics.script(saved, v) : null, v);
  }

  /* ══════════ 탭 ══════════ */
  function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === name));
  }

  /* ══════════ 이벤트 바인딩 ══════════ */
  function bindEvents() {
    /* 채널 추가 */
    $('#addForm').addEventListener('submit', e => {
      e.preventDefault();
      const val = $('#addInput').value.trim();
      if (val) addChannel(val);
    });

    /* 채널 삭제 */
    $('#channelList').addEventListener('click', e => {
      const id = e.target.dataset.remove;
      if (!id) return;
      Store.removeChannel(id);
      recompute();
      U.toast('채널을 삭제했습니다.');
    });

    /* 추천 채널 */
    $('#seedList').addEventListener('click', e => {
      const btn = e.target.closest('[data-seed]');
      if (!btn || btn.disabled) return;
      addSeeds([SEED_CHANNELS[Number(btn.dataset.seed)]]);
    });
    $('#btnSeedAll').addEventListener('click', () => {
      const registered = Store.get('channels');
      const remain = SEED_CHANNELS.filter(s => !registered.some(c =>
        (c.handle || '').toLowerCase().replace(/^@/, '') === s.handle.toLowerCase().replace(/^@/, '') ||
        c.title === s.title));
      if (remain.length) addSeeds(remain);
    });

    $('#btnClearCh').addEventListener('click', () => {
      if (!Store.get('channels').length) return;
      if (!confirm('등록된 채널과 수집된 영상을 모두 삭제할까요?')) return;
      Store.clearChannels();
      recompute();
      U.toast('전체 삭제했습니다.');
    });

    /* 스캔 */
    $('#btnScan').addEventListener('click', () => scanChannels(Store.get('channels')));
    $('#btnLoadDemo').addEventListener('click', loadDemo);

    /* 스캔 옵션 */
    $('#optDepth').addEventListener('change', e => Store.set('depth', Number(e.target.value)));
    $('#optShorts').addEventListener('change', e => {
      Store.set('includeShorts', e.target.checked);
      renderIssues();
      renderPatterns();
    });

    /* 탭 */
    $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    /* 필터 */
    ['#fPeriod', '#fSort', '#fChannel', '#fType'].forEach(sel =>
      $(sel).addEventListener('change', renderIssues));
    $('#fQuery').addEventListener('input', U.debounce(renderIssues, 250));
    $('#btnCsv').addEventListener('click', exportCSV);

    /* 패턴 필터 */
    ['#pScope', '#pChannel'].forEach(sel =>
      $(sel).addEventListener('change', renderPatterns));

    /* 영상 카드 → 모달 */
    $('#videoGrid').addEventListener('click', e => {
      const card = e.target.closest('[data-video]');
      if (!card) return;
      const v = App.videos.find(x => x.id === card.dataset.video);
      if (v) UI.videoModal(v);
    });
    $('#videoGrid').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const card = e.target.closest('[data-video]');
      if (!card) return;
      const v = App.videos.find(x => x.id === card.dataset.video);
      if (v) UI.videoModal(v);
    });

    /* 모달 내부 액션 */
    $('#vmBody').addEventListener('click', async e => {
      const copyId = e.target.dataset.copyDesc;
      const goId = e.target.dataset.analyze;
      if (copyId) {
        const v = App.videos.find(x => x.id === copyId);
        if (v && await U.copy(v.description)) U.toast('설명문을 복사했습니다.', 'ok');
      }
      if (goId) openScriptTab(goId);
    });

    /* 모달 닫기 */
    $$('.modal').forEach(m => {
      m.addEventListener('click', e => {
        if (e.target.dataset.close !== undefined) m.hidden = true;
      });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') $$('.modal').forEach(m => (m.hidden = true));
    });

    /* 설정 */
    $('#btnSettings').addEventListener('click', () => {
      syncSettingsUI();
      $('#settingsModal').hidden = false;
    });
    $('#btnSaveSet').addEventListener('click', () => {
      Store.patch({
        apiKey: $('#setKey').value.trim(),
        proxy: $('#setProxy').value.trim(),
        forceDemo: $('#setDemo').checked
      });
      syncSettingsUI();
      $('#settingsModal').hidden = true;
      U.toast('설정을 저장했습니다.', 'ok');
    });
    $('#btnResetAll').addEventListener('click', () => {
      if (!confirm('API 키, 채널, 수집 데이터를 모두 삭제할까요?')) return;
      Store.reset();
      syncSettingsUI();
      applyTheme('light');
      recompute();
      $('#settingsModal').hidden = true;
      U.toast('초기화했습니다.');
    });

    /* 테마 */
    $('#btnTheme').addEventListener('click', () =>
      applyTheme(Store.get('theme') === 'dark' ? 'light' : 'dark'));

    /* 스크립트 탭 */
    $('#sVideo').addEventListener('change', loadScriptForVideo);
    $('#btnFetchCap').addEventListener('click', fetchCaption);
    $('#btnSaveScript').addEventListener('click', analyzeScript);
    $('#btnUseDesc').addEventListener('click', () => {
      const v = currentScriptVideo();
      if (!v) { U.toast('먼저 영상을 선택해 주세요.', 'err'); return; }
      $('#scriptText').value = v.description || '';
      analyzeScript();
    });
    $('#btnCopyScript').addEventListener('click', async () => {
      const text = $('#scriptText').value;
      if (!text.trim()) { U.toast('복사할 내용이 없습니다.', 'err'); return; }
      if (await U.copy(text)) U.toast('복사했습니다.', 'ok');
    });
  }

  window.App = App;
})();
