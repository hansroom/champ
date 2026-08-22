/* ================================================================
   analytics.js — 이슈 점수 · 성장 지표 · 패턴/스크립트 분석
================================================================ */
window.Analytics = (function () {

  /* ── 이슈 점수 가중치 ──
     anchor 값에 도달하면 해당 항목 만점(1.0). 로그 포화라 극단값에 덜 흔들린다. */
  const W = {
    outperform: { weight: 0.35, anchor: 3   },  // 채널 중앙값 대비 배율
    vpd:        { weight: 0.25, anchor: 30000 },// 일평균 조회수
    ratio:      { weight: 0.20, anchor: 0.6  }, // 구독자 대비 조회수
    engage:     { weight: 0.20, anchor: 0.05 }  // (좋아요+댓글)/조회수
  };

  const TIERS = [
    { min: 85, key: 's', label: '초대박' },
    { min: 70, key: 'a', label: '대박'   },
    { min: 55, key: 'b', label: '화제'   },
    { min: 40, key: 'c', label: '준수'   },
    { min: 0,  key: 'd', label: '평이'   }
  ];
  const tierOf = score => TIERS.find(t => score >= t.min);

  /* ── 영상 지표 계산 ──────────────────────────────────────────── */
  function enrich(videos, channels) {
    const byCh = new Map();
    videos.forEach(v => {
      if (!byCh.has(v.channelId)) byCh.set(v.channelId, []);
      byCh.get(v.channelId).push(v);
    });

    const baseline = new Map();
    byCh.forEach((list, chId) => {
      baseline.set(chId, {
        median: U.median(list.map(v => v.views)) || 1,
        subs: channels.find(c => c.id === chId)?.subs || 0
      });
    });

    return videos.map(v => {
      const base = baseline.get(v.channelId) || { median: 1, subs: 0 };
      const days = U.daysSince(v.publishedAt);

      const vpd        = v.views / days;
      const outperform = v.views / Math.max(base.median, 1);
      const ratio      = base.subs ? v.views / base.subs : 0;
      const engage     = v.views ? (v.likes + v.comments) / v.views : 0;

      const score =
        100 * (
          W.outperform.weight * U.sat(outperform, W.outperform.anchor) +
          W.vpd.weight        * U.sat(vpd,        W.vpd.anchor) +
          W.ratio.weight      * U.sat(ratio,      W.ratio.anchor) +
          W.engage.weight     * U.sat(engage,     W.engage.anchor)
        );

      const d = new Date(v.publishedAt);
      return {
        ...v,
        days,
        vpd,
        outperform,
        ratio,
        engage,
        score: Math.round(score * 10) / 10,
        tier: tierOf(score),
        isShort: v.duration > 0 && v.duration <= 60,
        weekday: d.getDay(),
        hour: d.getHours(),
        url: `https://www.youtube.com/watch?v=${v.id}`
      };
    });
  }

  /* ── 채널 성장 지표 ──────────────────────────────────────────── */
  function channelStats(channel, videos) {
    const list = videos
      .filter(v => v.channelId === channel.id)
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    if (!list.length) {
      return { channel, sample: 0, avgViews: 0, medianViews: 0, reach: 0,
               momentum: 0, intervalDays: 0, last30: 0, engageAvg: 0,
               issueCount: 0, best: null, recentViews: [] };
    }

    const views       = list.map(v => v.views);
    const avgViews    = U.avg(views);
    const medianViews = U.median(views);
    const recent      = list.slice(0, 10);
    const prev        = list.slice(10, 20);
    const recentAvg   = U.avg(recent.map(v => v.views));
    const prevAvg     = U.avg(prev.map(v => v.views));
    const momentum    = prevAvg ? (recentAvg / prevAvg - 1) * 100 : 0;

    /* 업로드 주기 = 최근 영상 간 발행 간격의 중앙값 */
    const gaps = [];
    for (let i = 0; i < Math.min(list.length - 1, 20); i++) {
      gaps.push((new Date(list[i].publishedAt) - new Date(list[i + 1].publishedAt)) / 86400000);
    }

    const last30 = list.filter(v => U.daysSince(v.publishedAt) <= 30).length;

    return {
      channel,
      sample: list.length,
      avgViews,
      medianViews,
      reach: channel.subs ? (avgViews / channel.subs) * 100 : 0,
      momentum,
      intervalDays: U.median(gaps),
      last30,
      engageAvg: U.avg(list.map(v => v.engage)) * 100,
      issueCount: list.filter(v => v.score >= 55).length,
      best: list.reduce((a, b) => (b.views > a.views ? b : a), list[0]),
      recentViews: recent.slice().reverse()
    };
  }

  /* ── 전체 요약 ──────────────────────────────────────────────── */
  function summary(channels, videos) {
    const stats = channels.map(c => channelStats(c, videos));
    const hot = videos.filter(v => v.score >= 55);
    const recent = videos.filter(v => U.daysSince(v.publishedAt) <= 30);
    return {
      stats,
      totalSubs:   channels.reduce((a, c) => a + c.subs, 0),
      totalViews:  videos.reduce((a, v) => a + v.views, 0),
      videoCount:  videos.length,
      hotCount:    hot.length,
      recentCount: recent.length,
      avgScore:    U.avg(videos.map(v => v.score)),
      bestMomentum: stats.slice().sort((a, b) => b.momentum - a.momentum)[0] || null,
      topVideo:    videos.slice().sort((a, b) => b.score - a.score)[0] || null
    };
  }

  /* ── 인기 영상 패턴 ─────────────────────────────────────────── */
  const DURATION_BUCKETS = [
    { label: '숏츠 (~1분)',  min: 0,    max: 60   },
    { label: '1~3분',        min: 60,   max: 180  },
    { label: '3~8분',        min: 180,  max: 480  },
    { label: '8~15분',       min: 480,  max: 900  },
    { label: '15~30분',      min: 900,  max: 1800 },
    { label: '30분 이상',    min: 1800, max: Infinity }
  ];

  const TITLE_FEATURES = [
    { key: 'number',   label: '숫자 포함',      test: t => /\d/.test(t) },
    { key: 'question', label: '물음표',         test: t => /[?？]/.test(t) },
    { key: 'bracket',  label: '괄호/대괄호',    test: t => /[\[\](){}【】]/.test(t) },
    { key: 'bang',     label: '느낌표',         test: t => /[!！]/.test(t) },
    { key: 'pipe',     label: '구분자(| · -)',  test: t => /[|·]|\s-\s/.test(t) },
    { key: 'emoji',    label: '이모지',         test: t => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t) },
    { key: 'superlative', label: '최상급 표현', test: t => /(최고|최악|충격|역대|진짜|완벽|끝판왕|무조건|절대|총정리|공개)/.test(t) }
  ];

  function patterns(videos, allVideos) {
    if (!videos.length) return null;

    const titles = videos.map(v => v.title);
    const keywords = U.freq(titles.flatMap(t => U.tokenize(t)), 24);
    const tagFreq  = U.freq(videos.flatMap(v => (v.tags || []).map(t => t.toLowerCase())), 14);

    /* 요일 / 시간대 — 편수와 평균 조회수를 함께 본다 */
    const weekday = U.WEEKDAYS.map((label, i) => {
      const g = videos.filter(v => v.weekday === i);
      return { label: label + '요일', count: g.length, avgViews: U.avg(g.map(v => v.views)) };
    });
    const hourGroups = [
      { label: '00-06시', from: 0,  to: 6  },
      { label: '06-09시', from: 6,  to: 9  },
      { label: '09-12시', from: 9,  to: 12 },
      { label: '12-15시', from: 12, to: 15 },
      { label: '15-18시', from: 15, to: 18 },
      { label: '18-21시', from: 18, to: 21 },
      { label: '21-24시', from: 21, to: 24 }
    ].map(h => {
      const g = videos.filter(v => v.hour >= h.from && v.hour < h.to);
      return { label: h.label, count: g.length, avgViews: U.avg(g.map(v => v.views)) };
    });

    const duration = DURATION_BUCKETS.map(b => {
      const g = videos.filter(v => v.duration >= b.min && v.duration < b.max);
      return { label: b.label, count: g.length, avgViews: U.avg(g.map(v => v.views)) };
    }).filter(b => b.count);

    const features = TITLE_FEATURES.map(f => {
      const hit = videos.filter(v => f.test(v.title));
      const base = allVideos && allVideos.length
        ? allVideos.filter(v => f.test(v.title)).length / allVideos.length * 100 : null;
      return {
        label: f.label,
        rate: (hit.length / videos.length) * 100,
        baseRate: base,
        avgViews: U.avg(hit.map(v => v.views))
      };
    }).sort((a, b) => b.rate - a.rate);

    const lengths = titles.map(t => t.length);
    const shorts = videos.filter(v => v.isShort);

    return {
      sample: videos.length,
      keywords,
      tagFreq,
      weekday,
      hour: hourGroups,
      duration,
      features,
      titleLen: { avg: U.avg(lengths), min: Math.min(...lengths), max: Math.max(...lengths) },
      shortRate: (shorts.length / videos.length) * 100,
      shortAvgViews: U.avg(shorts.map(v => v.views)),
      longAvgViews: U.avg(videos.filter(v => !v.isShort).map(v => v.views)),
      bestWeekday: weekday.slice().sort((a, b) => b.avgViews - a.avgViews)[0],
      bestHour: hourGroups.slice().sort((a, b) => b.avgViews - a.avgViews)[0],
      bestDuration: duration.slice().sort((a, b) => b.avgViews - a.avgViews)[0]
    };
  }

  /* ── 스크립트 분석 ──────────────────────────────────────────── */
  const CTA = ['구독', '좋아요', '알림', '댓글', '공유', '링크', '더보기'];

  function script(text, video) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return null;

    const sentences = clean.split(/(?<=[.!?。！？])\s+|(?<=다)\s(?=[가-힣])/)
      .map(s => s.trim()).filter(s => s.length > 4);
    const tokens = U.tokenize(clean);
    const words  = clean.split(/\s+/).filter(Boolean);
    const minutes = video?.duration ? video.duration / 60 : 0;

    return {
      chars: clean.length,
      words: words.length,
      sentences: sentences.length,
      avgSentence: sentences.length ? words.length / sentences.length : 0,
      wpm: minutes ? words.length / minutes : 0,
      keywords: U.freq(tokens, 18),
      hooks: sentences.slice(0, 3),
      closing: sentences.slice(-2),
      questionCount: sentences.filter(s => /[?？]/.test(s)).length,
      ctaHits: CTA.filter(c => clean.includes(c)),
      density: tokens.length ? new Set(tokens).size / tokens.length : 0
    };
  }

  /* ── 설명문에서 챕터/해시태그 추출 ──────────────────────────── */
  function chapters(description) {
    const out = [];
    String(description || '').split('\n').forEach(line => {
      const m = line.match(/^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s+[-–—]?\s*(.+)$/);
      if (m) out.push({ time: m[1], label: m[2].trim() });
    });
    return out;
  }
  function hashtags(description) {
    return [...new Set((String(description || '').match(/#[^\s#]+/g) || []))].slice(0, 20);
  }

  return { enrich, channelStats, summary, patterns, script, chapters, hashtags, tierOf, W };
})();
