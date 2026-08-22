/* ================================================================
   ui.js — 화면 렌더링
================================================================ */
window.UI = (function () {

  const { $, esc, num, comma, pct } = U;

  /* ── 공통 조각 ── */
  function bar(label, value, display, max, variant = '') {
    const w = max > 0 ? Math.max((value / max) * 100, value > 0 ? 3 : 0) : 0;
    return `<div class="bar">
      <span class="bar__label" title="${esc(label)}">${esc(label)}</span>
      <span class="bar__track"><span class="bar__fill ${variant}" style="width:${w.toFixed(1)}%"></span></span>
      <span class="bar__value">${esc(display)}</span>
    </div>`;
  }

  const delta = v => {
    if (!isFinite(v) || Math.abs(v) < 1) return `<span class="flat">보합</span>`;
    return v > 0 ? `<span class="up">▲ ${v.toFixed(0)}%</span>`
                 : `<span class="down">▼ ${Math.abs(v).toFixed(0)}%</span>`;
  };

  const kpi = (label, value, sub, mod = '') =>
    `<div class="kpi ${mod}">
       <p class="kpi__label">${esc(label)}</p>
       <p class="kpi__value">${esc(value)}</p>
       <p class="kpi__sub">${sub}</p>
     </div>`;

  /* ── 채널 목록 ── */
  function channelList(channels) {
    const ul = $('#channelList');
    $('#chCount').textContent = channels.length;
    if (!channels.length) {
      ul.innerHTML = `<li class="chitem is-empty">등록된 채널이 없습니다</li>`;
      return;
    }
    ul.innerHTML = channels.map(c => `
      <li class="chitem" data-id="${esc(c.id)}">
        <img class="chitem__img" src="${esc(c.thumb)}" alt="" loading="lazy" />
        <div class="chitem__body">
          <p class="chitem__name" title="${esc(c.title)}">${esc(c.title)}</p>
          <p class="chitem__meta">구독자 ${num(c.subs)} · 영상 ${num(c.videoCount)}</p>
        </div>
        <button class="chitem__x" type="button" data-remove="${esc(c.id)}" aria-label="채널 삭제">✕</button>
      </li>`).join('');
  }

  /* ── 대시보드 ── */
  function dashboard(sum) {
    const hasData = sum.videoCount > 0;
    $('#dashEmpty').hidden = hasData;
    $('#dashBody').hidden = !hasData;
    if (!hasData) return;

    const mom = sum.bestMomentum;
    $('#kpiGrid').innerHTML = [
      kpi('등록 채널', comma(sum.stats.length) + '개', `수집 영상 ${comma(sum.videoCount)}개`),
      kpi('합산 구독자', num(sum.totalSubs), '등록 채널 전체'),
      kpi('수집 영상 조회수', num(sum.totalViews), `평균 이슈 점수 ${sum.avgScore.toFixed(1)}`),
      kpi('이슈 영상', comma(sum.hotCount) + '개', '이슈 점수 55점 이상', 'kpi--hot'),
      kpi('최근 30일 업로드', comma(sum.recentCount) + '개', '전체 채널 합계'),
      mom ? kpi('모멘텀 1위', mom.channel.title,
        `최근 10개 평균 ${delta(mom.momentum)}`,
        mom.momentum >= 0 ? 'kpi--up' : 'kpi--down') : ''
    ].join('');

    /* 채널 테이블 */
    $('#chTable tbody').innerHTML = sum.stats.map(s => `
      <tr>
        <td>
          <div class="table__ch">
            <img src="${esc(s.channel.thumb)}" alt="" loading="lazy" />
            <span>${esc(s.channel.title)}</span>
          </div>
        </td>
        <td>${num(s.channel.subs)}</td>
        <td>${num(s.channel.views)}</td>
        <td>${comma(s.channel.videoCount)}</td>
        <td>${num(s.avgViews)}</td>
        <td>${pct(s.reach)}</td>
        <td>${s.intervalDays ? s.intervalDays.toFixed(1) + '일' : '-'}</td>
        <td>${delta(s.momentum)}</td>
        <td>${pct(s.engageAvg, 2)}</td>
        <td>${comma(s.issueCount)}개</td>
      </tr>`).join('');

    /* 최근 업로드 추이 — 채널별 최신 10개 */
    const trend = sum.stats.flatMap(s =>
      s.recentViews.map((v, i) => ({
        label: `${s.channel.title.slice(0, 6)} #${i + 1}`,
        value: v.views
      }))
    );
    const trendMax = Math.max(...trend.map(t => t.value), 1);
    $('#trendChart').innerHTML = trend.length
      ? trend.slice(-24).map(t => bar(t.label, t.value, num(t.value), trendMax)).join('')
      : `<p class="card__note">데이터가 없습니다.</p>`;

    /* 도달률 비교 */
    const reachMax = Math.max(...sum.stats.map(s => s.reach), 1);
    $('#reachChart').innerHTML = sum.stats.map(s =>
      bar(s.channel.title, s.reach, pct(s.reach), reachMax, 'bar__fill--blue')
    ).join('') + `<p class="card__note" style="margin-top:12px">
      도달률 = 영상 평균 조회수 ÷ 구독자 수. 100%를 넘으면 구독자 밖으로 확산되는 채널입니다.</p>`;
  }

  /* ── 영상 카드 ── */
  function videoCard(v) {
    return `<article class="vcard" data-video="${esc(v.id)}" tabindex="0">
      <div class="vcard__thumb">
        <img src="${esc(v.thumb)}" alt="" loading="lazy" />
        <span class="vcard__score">${v.score.toFixed(0)}점</span>
        <span class="vcard__dur">${U.secToClock(v.duration)}</span>
      </div>
      <div class="vcard__body">
        <h3 class="vcard__title" title="${esc(v.title)}">${esc(v.title)}</h3>
        <p class="vcard__ch">${esc(v.channelTitle)} · ${U.ago(v.publishedAt)}</p>
        <div class="vcard__tags">
          <span class="tier tier--${v.tier.key}">${v.tier.label}</span>
          ${v.isShort ? '<span class="chip">숏츠</span>' : ''}
          <span class="chip">구독자 대비 ${(v.ratio * 100).toFixed(0)}%</span>
        </div>
        <div class="vcard__stats">
          <span>조회 <b>${num(v.views)}</b></span>
          <span>일평균 <b>${num(v.vpd)}</b></span>
          <span>채널 평균比 <b>${v.outperform.toFixed(1)}배</b></span>
          <span>참여 <b>${pct(v.engage * 100, 1)}</b></span>
        </div>
      </div>
    </article>`;
  }

  function videoGrid(list, totalCount) {
    const grid = $('#videoGrid');
    $('#issueSummary').innerHTML = list.length
      ? `조건에 맞는 영상 <b>${comma(list.length)}개</b> / 수집 <b>${comma(totalCount)}개</b>
         · 이슈 점수 55점 이상 <b>${comma(list.filter(v => v.score >= 55).length)}개</b>`
      : '';
    grid.innerHTML = list.length
      ? list.map(videoCard).join('')
      : `<div class="empty" style="grid-column:1/-1">
           <p class="empty__ico">🔍</p>
           <p class="empty__title">조건에 맞는 영상이 없습니다</p>
           <p class="empty__desc">기간을 넓히거나 필터를 초기화해 보세요.</p>
         </div>`;
  }

  /* ── 패턴 ── */
  function patterns(p, scopeLabel) {
    const box = $('#patternBody');
    if (!p) {
      box.innerHTML = `<div class="empty">
        <p class="empty__ico">🧬</p>
        <p class="empty__title">분석할 영상이 없습니다</p>
        <p class="empty__desc">먼저 채널을 등록하고 스캔을 실행해 주세요.</p></div>`;
      return;
    }

    const kwMax = p.keywords[0]?.count || 1;
    const wdMax = Math.max(...p.weekday.map(w => w.avgViews), 1);
    const hrMax = Math.max(...p.hour.map(h => h.avgViews), 1);
    const duMax = Math.max(...p.duration.map(d => d.avgViews), 1);

    box.innerHTML = `
      <div class="card">
        <div class="card__head">
          <h3 class="card__title">제목 키워드 빈도</h3>
          <span class="card__note">${esc(scopeLabel)} · 표본 ${comma(p.sample)}개</span>
        </div>
        <div class="kwcloud">
          ${p.keywords.length
            ? p.keywords.map(k => `<span class="kw" style="font-size:${(12 + (k.count / kwMax) * 7).toFixed(0)}px">
                ${esc(k.word)}<span>${k.count}</span></span>`).join('')
            : '<p class="card__note">반복되는 키워드가 없습니다.</p>'}
        </div>
        <div class="statrow">
          <div class="stat"><p class="stat__label">평균 제목 길이</p><p class="stat__value">${p.titleLen.avg.toFixed(0)}자</p></div>
          <div class="stat"><p class="stat__label">최단 / 최장</p><p class="stat__value">${p.titleLen.min} / ${p.titleLen.max}자</p></div>
          <div class="stat"><p class="stat__label">숏츠 비중</p><p class="stat__value">${pct(p.shortRate, 0)}</p></div>
          <div class="stat"><p class="stat__label">숏츠 평균 조회</p><p class="stat__value">${num(p.shortAvgViews)}</p></div>
          <div class="stat"><p class="stat__label">롱폼 평균 조회</p><p class="stat__value">${num(p.longAvgViews)}</p></div>
        </div>
      </div>

      <div class="grid2">
        <div class="card">
          <h3 class="card__title">요일별 평균 조회수</h3>
          <div class="chart">${p.weekday.map(w =>
            bar(`${w.label} (${w.count})`, w.avgViews, num(w.avgViews), wdMax)).join('')}</div>
        </div>
        <div class="card">
          <h3 class="card__title">업로드 시간대별 평균 조회수</h3>
          <div class="chart">${p.hour.map(h =>
            bar(`${h.label} (${h.count})`, h.avgViews, num(h.avgViews), hrMax, 'bar__fill--blue')).join('')}</div>
        </div>
      </div>

      <div class="grid2">
        <div class="card">
          <h3 class="card__title">영상 길이대별 성과</h3>
          <div class="chart">${p.duration.map(d =>
            bar(`${d.label} (${d.count})`, d.avgViews, num(d.avgViews), duMax, 'bar__fill--green')).join('')}</div>
        </div>
        <div class="card">
          <h3 class="card__title">제목 구성 요소</h3>
          <div class="chart">${p.features.map(f => {
            const diff = f.baseRate == null ? '' :
              ` (전체 ${f.baseRate.toFixed(0)}%)`;
            return bar(f.label, f.rate, pct(f.rate, 0) + diff, 100);
          }).join('')}</div>
        </div>
      </div>

      <div class="card">
        <h3 class="card__title">자동 도출 인사이트</h3>
        ${insight('📅', `업로드는 <b>${esc(p.bestWeekday.label)}</b>에 올린 영상의 평균 조회수가 ${num(p.bestWeekday.avgViews)}회로 가장 높습니다.`)}
        ${insight('⏰', `시간대는 <b>${esc(p.bestHour.label)}</b> 업로드가 평균 ${num(p.bestHour.avgViews)}회로 가장 좋은 성과를 냈습니다.`)}
        ${p.bestDuration ? insight('⏱', `길이는 <b>${esc(p.bestDuration.label)}</b> 구간이 평균 ${num(p.bestDuration.avgViews)}회로 가장 강합니다.`) : ''}
        ${insight('✍️', `제목은 평균 <b>${p.titleLen.avg.toFixed(0)}자</b>, 상위 요소는
          ${p.features.slice(0, 3).map(f => `<b>${esc(f.label)}</b> ${pct(f.rate, 0)}`).join(', ')} 입니다.`)}
        ${p.shortRate > 0 ? insight('📱', `숏츠 비중 <b>${pct(p.shortRate, 0)}</b>,
          숏츠 평균 ${num(p.shortAvgViews)}회 vs 롱폼 평균 ${num(p.longAvgViews)}회
          → ${p.shortAvgViews > p.longAvgViews ? '숏츠가 도달에 유리합니다.' : '롱폼이 조회수를 더 많이 확보합니다.'}`) : ''}
        ${p.tagFreq.length ? insight('🏷', `자주 쓰인 태그: ${p.tagFreq.slice(0, 8).map(t => `<b>${esc(t.word)}</b>`).join(', ')}`) : ''}
      </div>`;
  }

  const insight = (ico, html) =>
    `<div class="insight"><span class="insight__ico">${ico}</span><p>${html}</p></div>`;

  /* ── 스크립트 결과 ── */
  function scriptResult(r, video) {
    const box = $('#scriptResult');
    if (!r) { box.innerHTML = ''; return; }
    const kwMax = r.keywords[0]?.count || 1;

    box.innerHTML = `
      <div class="card">
        <div class="card__head">
          <h3 class="card__title">스크립트 지표</h3>
          <span class="card__note">${video ? esc(video.title) : ''}</span>
        </div>
        <div class="statrow">
          <div class="stat"><p class="stat__label">글자 수</p><p class="stat__value">${comma(r.chars)}</p></div>
          <div class="stat"><p class="stat__label">단어 수</p><p class="stat__value">${comma(r.words)}</p></div>
          <div class="stat"><p class="stat__label">문장 수</p><p class="stat__value">${comma(r.sentences)}</p></div>
          <div class="stat"><p class="stat__label">문장당 단어</p><p class="stat__value">${r.avgSentence.toFixed(1)}</p></div>
          <div class="stat"><p class="stat__label">분당 단어(WPM)</p><p class="stat__value">${r.wpm ? r.wpm.toFixed(0) : '-'}</p></div>
          <div class="stat"><p class="stat__label">어휘 다양도</p><p class="stat__value">${pct(r.density * 100, 0)}</p></div>
          <div class="stat"><p class="stat__label">질문 문장</p><p class="stat__value">${r.questionCount}개</p></div>
          <div class="stat"><p class="stat__label">CTA 표현</p><p class="stat__value">${r.ctaHits.length}개</p></div>
        </div>
        ${r.ctaHits.length ? `<div class="vcard__tags" style="margin-top:12px">
          ${r.ctaHits.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
      </div>

      <div class="grid2">
        <div class="card">
          <h3 class="card__title">도입부 훅 (첫 3문장)</h3>
          <ul class="hooklist">
            ${r.hooks.map(h => `<li>${esc(h)}</li>`).join('') || '<li>문장을 찾지 못했습니다.</li>'}
          </ul>
          <h3 class="card__title" style="margin-top:20px">마무리 문장</h3>
          <ul class="hooklist">
            ${r.closing.map(h => `<li>${esc(h)}</li>`).join('') || '<li>-</li>'}
          </ul>
        </div>
        <div class="card">
          <h3 class="card__title">핵심 키워드</h3>
          <div class="chart">
            ${r.keywords.map(k => bar(k.word, k.count, k.count + '회', kwMax)).join('')}
          </div>
        </div>
      </div>`;
  }

  /* ── 영상 상세 모달 ── */
  function videoModal(v) {
    const chapters = Analytics.chapters(v.description);
    const tags = Analytics.hashtags(v.description);
    $('#vmTitle').textContent = v.title;
    $('#vmBody').innerHTML = `
      <div class="vm__top">
        <div>
          <img class="vm__thumb" src="${esc(v.thumb)}" alt="" />
          <div class="vcard__tags" style="margin-top:12px">
            <span class="tier tier--${v.tier.key}">${v.tier.label} ${v.score.toFixed(1)}점</span>
            ${v.isShort ? '<span class="chip">숏츠</span>' : '<span class="chip">롱폼</span>'}
            <span class="chip">${U.secToClock(v.duration)}</span>
          </div>
          <p class="card__note" style="margin-top:12px">
            ${esc(v.channelTitle)}<br />${U.dateLabel(v.publishedAt)} (${U.ago(v.publishedAt)})
          </p>
          <a class="btn btn--ghost" style="margin-top:12px" href="${esc(v.url)}" target="_blank" rel="noopener">▶ 유튜브에서 열기</a>
        </div>
        <div>
          <div class="statrow" style="margin-top:0">
            <div class="stat"><p class="stat__label">조회수</p><p class="stat__value">${comma(v.views)}</p></div>
            <div class="stat"><p class="stat__label">좋아요</p><p class="stat__value">${comma(v.likes)}</p></div>
            <div class="stat"><p class="stat__label">댓글</p><p class="stat__value">${comma(v.comments)}</p></div>
            <div class="stat"><p class="stat__label">일평균 조회수</p><p class="stat__value">${num(v.vpd)}</p></div>
            <div class="stat"><p class="stat__label">채널 중앙값 대비</p><p class="stat__value">${v.outperform.toFixed(1)}배</p></div>
            <div class="stat"><p class="stat__label">구독자 대비</p><p class="stat__value">${pct(v.ratio * 100, 0)}</p></div>
            <div class="stat"><p class="stat__label">참여율</p><p class="stat__value">${pct(v.engage * 100, 2)}</p></div>
            <div class="stat"><p class="stat__label">경과일</p><p class="stat__value">${Math.round(v.days)}일</p></div>
          </div>

          ${chapters.length ? `<div class="vm__section">
            <h4>챕터 ${chapters.length}개</h4>
            <div class="vcard__tags">
              ${chapters.map(c => `<span class="chip">${esc(c.time)} ${esc(c.label)}</span>`).join('')}
            </div></div>` : ''}

          ${(v.tags?.length || tags.length) ? `<div class="vm__section">
            <h4>태그 · 해시태그</h4>
            <div class="vcard__tags">
              ${(v.tags || []).slice(0, 15).map(t => `<span class="chip">${esc(t)}</span>`).join('')}
              ${tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}
            </div></div>` : ''}

          <div class="vm__section">
            <h4>설명문 (스크립트 원본)</h4>
            <div class="vm__desc">${esc(v.description || '설명문이 없습니다.')}</div>
            <div class="scriptbar" style="margin-top:12px">
              <button class="btn btn--ghost" type="button" data-copy-desc="${esc(v.id)}">⧉ 설명문 복사</button>
              <button class="btn btn--primary" type="button" data-analyze="${esc(v.id)}">스크립트 분석으로 보내기</button>
            </div>
          </div>
        </div>
      </div>`;
    $('#videoModal').hidden = false;
  }

  /* ── 셀렉트 채우기 ── */
  function fillChannelSelects(channels) {
    ['#fChannel', '#pChannel'].forEach(sel => {
      const el = $(sel);
      const cur = el.value;
      el.innerHTML = `<option value="">전체 채널</option>` +
        channels.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
      el.value = cur;
    });
  }

  function fillVideoSelect(videos) {
    const el = $('#sVideo');
    const cur = el.value;
    const list = videos.slice().sort((a, b) => b.score - a.score).slice(0, 200);
    el.innerHTML = `<option value="">영상을 선택하세요</option>` +
      list.map(v => `<option value="${esc(v.id)}">[${v.score.toFixed(0)}점] ${esc(v.title.slice(0, 46))}</option>`).join('');
    el.value = cur;
  }

  /* ── 진행률 ── */
  function progress(ratio, text) {
    const box = $('#progress');
    if (ratio == null) { box.hidden = true; return; }
    box.hidden = false;
    $('#progressFill').style.width = (U.clamp(ratio, 0, 1) * 100).toFixed(1) + '%';
    $('#progressText').textContent = text || '';
  }

  return {
    channelList, dashboard, videoGrid, patterns, scriptResult,
    videoModal, fillChannelSelects, fillVideoSelect, progress, bar
  };
})();
