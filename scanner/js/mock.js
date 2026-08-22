/* ================================================================
   mock.js — 데모 모드용 가상 데이터 생성기 (결정적/시드 기반)
   API 키 없이도 전체 분석 흐름을 그대로 체험할 수 있게 한다.
================================================================ */
window.Mock = (function () {

  /* ── 시드 난수 ── */
  function hash(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = hash(seed);
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const between = (r, a, b) => a + r() * (b - a);

  /* ── 썸네일 자리표시자 (외부 요청 없이 SVG data URI) ── */
  function placeholder(text, w, h, tone) {
    const bg = ['#e0e1e4', '#cdced2', '#a9abb0', '#8a8c92'][tone % 4];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="100%" height="100%" fill="${bg}"/>
      <text x="50%" y="50%" font-family="Inter,sans-serif" font-size="${Math.round(h / 4)}"
            font-weight="700" fill="#1a1b1e" opacity=".5"
            text-anchor="middle" dominant-baseline="central">${text}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
  }

  /* ── 채널 프리셋 ── */
  const PRESETS = [
    {
      id: 'UCdemo0000000000000IT', title: '테크리뷰 랩', handle: '@techreviewlab',
      subs: 842000, topic: 'tech',
      titles: [
        '{n}만원대 {product} 솔직 후기 | 이건 진짜 사세요',
        '{product} 3개월 쓰고 느낀 점 (장점 단점 총정리)',
        '아무도 말 안 해주는 {product} 단점 {n}가지',
        '{product} vs {product2} 실사용 비교, 승자는?',
        '{year} 가성비 {product} 추천 TOP 5',
        '{product} 신제품 공개 | 이번엔 진짜 다릅니다',
        '충격적인 {product} 성능 테스트 결과',
        '{product} 100일 사용기 — 결국 팔았습니다'
      ],
      words: { product: ['노트북', '무선이어폰', '모니터', '키보드', '스마트워치', '태블릿', '그래픽카드'],
               product2: ['맥북', '갤럭시북', '아이패드', '그램'] }
    },
    {
      id: 'UCdemo0000000000COOK', title: '집밥의 정석', handle: '@homecook',
      subs: 1560000, topic: 'cook',
      titles: [
        '{time}분 만에 완성되는 {food} 레시피',
        '식당보다 맛있는 {food} 만드는 법',
        '자취생 필수 {food} | 재료 {n}개면 끝',
        '{food} 황금 비율 공개합니다',
        '실패 없는 {food} 초간단 레시피',
        '백종원도 놀란 {food} 비법',
        '{food} 이렇게 하면 절대 안 됩니다',
        '냉장고 털이 {food} 만들기'
      ],
      words: { food: ['김치찌개', '제육볶음', '파스타', '떡볶이', '계란말이', '된장찌개', '닭볶음탕', '비빔국수'],
               time: ['5', '10', '15', '20'] }
    },
    {
      id: 'UCdemo00000000000FIN', title: '머니 인사이트', handle: '@moneyinsight',
      subs: 327000, topic: 'finance',
      titles: [
        '{year}년 {asset} 전망, 지금 사도 될까요?',
        '월급 {n}만원으로 {n2}억 모은 방법',
        '{asset} 폭락 이유 완벽 정리',
        '연금저축 이거 모르면 {n}백만원 손해',
        '지금 {asset}에 들어가면 안 되는 이유',
        '{n}년 만에 찾아온 기회 | {asset} 분석',
        '부자들이 절대 안 하는 소비 습관 {n}가지',
        '{asset} 지금 상황 정리해 드립니다'
      ],
      words: { asset: ['미국주식', '금', '반도체', '부동산', '환율', '배당주', 'ETF'] }
    },
    {
      id: 'UCdemo0000000000VLOG', title: '데일리 로그', handle: '@dailylog',
      subs: 118000, topic: 'vlog',
      titles: [
        '{place} 여행 브이로그 | {n}박 {n2}일',
        '퇴사하고 {place} 다녀왔습니다',
        '{place} 한 달 살기 비용 전부 공개',
        '혼자 떠난 {place} 여행 기록',
        '{place}에서 생긴 황당한 일',
        '{place} 로컬 맛집 {n}곳 총정리',
        '{place} 숙소 추천 | 가성비 끝판왕',
        '{place} 갈 때 이건 꼭 챙기세요'
      ],
      words: { place: ['제주', '오사카', '다낭', '치앙마이', '타이베이', '후쿠오카', '발리', '삿포로'] }
    }
  ];

  const TAGS = {
    tech:    ['리뷰', 'IT', '언박싱', '가성비', '비교', '테크'],
    cook:    ['레시피', '집밥', '요리', '자취요리', '간단요리', '먹방'],
    finance: ['재테크', '주식', '투자', '경제', '자산관리'],
    vlog:    ['브이로그', '여행', '일상', '해외여행', 'vlog']
  };

  function fill(tpl, words, r) {
    return tpl.replace(/\{(\w+)\}/g, (m, key) => {
      if (key === 'n')    return String(Math.floor(between(r, 3, 9)));
      if (key === 'n2')   return String(Math.floor(between(r, 2, 6)));
      if (key === 'year') return String(new Date().getFullYear());
      const list = words[key];
      return list ? pick(r, list) : m;
    });
  }

  function makeDescription(title, tags, ch) {
    return `${title}\n\n안녕하세요, ${ch.title}입니다.\n` +
      `이번 영상에서는 요청이 가장 많았던 주제를 직접 확인하고 정리했습니다.\n\n` +
      `00:00 인트로\n01:24 핵심 요약\n04:10 자세한 설명\n08:35 실제 사용/적용\n12:02 정리\n\n` +
      `문의: contact@example.com\n` +
      tags.map(t => '#' + t).join(' ');
  }

  function makeCaption(title, r) {
    const hooks = [
      '이거 진짜 끝까지 보셔야 됩니다.',
      '결론부터 말씀드릴게요.',
      '많은 분들이 여기서 실수하십니다.',
      '오늘은 좀 다른 이야기를 해보려고 합니다.'
    ];
    const body = [
      '제가 직접 한 달 동안 써보면서 기록한 내용입니다.',
      '수치로 비교해 보면 차이가 명확하게 드러납니다.',
      '이 부분은 댓글로 질문이 정말 많았던 내용이에요.',
      '무조건 좋다는 얘기가 아니라 상황에 따라 다릅니다.',
      '가격 대비 성능만 놓고 보면 확실히 장점이 있습니다.',
      '반대로 이런 경우에는 추천드리기 어렵습니다.',
      '실제 데이터를 함께 보면서 설명드리겠습니다.'
    ];
    const out = [pick(r, hooks), `오늘 주제는 ${title} 입니다.`];
    for (let i = 0; i < 10; i++) out.push(pick(r, body));
    out.push('도움이 되셨다면 구독과 좋아요 부탁드립니다. 다음 영상에서 뵙겠습니다.');
    return out.join(' ');
  }

  /* ── 채널 1개 생성 ── */
  function buildChannel(preset, idx) {
    const r = rng(preset.id);
    const created = new Date(Date.now() - between(r, 900, 2600) * 86400000).toISOString();
    return {
      id: preset.id,
      title: preset.title,
      handle: preset.handle,
      thumb: placeholder(preset.title.slice(0, 2), 88, 88, idx),
      subs: preset.subs,
      views: Math.round(preset.subs * between(r, 60, 140)),
      videoCount: Math.floor(between(r, 180, 620)),
      publishedAt: created,
      uploadsPlaylist: 'UU' + preset.id.slice(2),
      country: 'KR',
      demo: true
    };
  }

  /* ── 채널의 영상 목록 생성 ── */
  function buildVideos(preset, channel, count) {
    const r = rng(preset.id + ':videos');
    const tags = TAGS[preset.topic];
    const out = [];
    let cursor = 0;

    for (let i = 0; i < count; i++) {
      cursor += between(r, 2, 6);                       // 업로드 간격(일)
      const publishedAt = new Date(Date.now() - cursor * 86400000);
      const days = Math.max(cursor, 0.6);
      const title = fill(pick(r, preset.titles), preset.words, r);
      const isShort = r() < 0.22;
      const duration = isShort
        ? Math.round(between(r, 18, 59))
        : Math.round(between(r, 300, 1500));

      /* 기본 조회수 = 구독자 대비 도달률, 여기에 간헐적 바이럴 계수 */
      const base = channel.subs * between(r, 0.03, 0.16);
      const viralRoll = r();
      const viral = viralRoll > 0.94 ? between(r, 6, 22)
                  : viralRoll > 0.85 ? between(r, 2.2, 5)
                  : between(r, 0.55, 1.6);
      const maturity = Math.min(1, 0.35 + days / 21);   // 최신 영상은 아직 덜 쌓임
      const views = Math.round(base * viral * maturity * (isShort ? 2.1 : 1));

      const engage  = between(r, 0.018, 0.075) * (viral > 3 ? 1.35 : 1);
      const likes   = Math.round(views * engage);
      const comments = Math.round(likes * between(r, 0.03, 0.13));
      const vTags = [...tags].sort(() => r() - 0.5).slice(0, Math.floor(between(r, 3, 6)));

      out.push({
        id: 'demo_' + preset.id.slice(-4) + '_' + String(i).padStart(3, '0'),
        channelId: channel.id,
        channelTitle: channel.title,
        title,
        description: makeDescription(title, vTags, channel),
        tags: vTags,
        publishedAt: publishedAt.toISOString(),
        duration,
        views,
        likes,
        comments,
        thumb: placeholder(String(i + 1), 480, 270, i + preset.topic.length),
        caption: makeCaption(title, r),
        demo: true
      });
    }
    return out;
  }

  function channels() {
    return PRESETS.map(buildChannel);
  }

  function videosFor(channel, count) {
    let preset = PRESETS.find(p => p.id === channel.id);
    if (!preset) {
      /* 새로고침 후 커스텀 데모 채널이 프리셋을 잃은 경우 동일 시드로 복원 */
      const r = rng('restore:' + channel.id);
      const src = PRESETS[Math.floor(r() * 4)];
      preset = { ...src, id: channel.id, title: channel.title, subs: channel.subs };
      PRESETS.push(preset);
    }
    return buildVideos(preset, channel, count);
  }

  /** 사용자가 임의 문자열로 채널을 추가했을 때(데모) 가상 채널 생성 */
  function customChannel(query, knownTitle, knownHandle) {
    const r = rng('custom:' + query);
    const derived = String(query).replace(/^https?:\/\/\S*\/@?/, '').replace(/^@/, '');
    const name = knownTitle || derived || '새 채널';
    const preset = PRESETS[Math.floor(r() * 4)];
    const clone = {
      ...preset,
      id: 'UCdemo' + hash(query).toString(36).padStart(12, '0').slice(0, 12),
      title: name,
      handle: knownHandle || ('@' + derived.toLowerCase().replace(/\s+/g, '')),
      subs: Math.round(between(r, 20000, 2200000))
    };
    PRESETS.push(clone);                                  // videosFor 에서 재사용
    return buildChannel(clone, PRESETS.length - 1);
  }

  return { channels, videosFor, customChannel, placeholder };
})();
