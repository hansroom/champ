/* ================================================================
   utils.js — 공통 유틸리티
================================================================ */
window.U = (function () {

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ── 숫자 포맷 ── */
  function num(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(n >= 1000000000 ? 0 : 1) + '억';
    if (n >= 10000)     return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '만';
    if (n >= 1000)      return (n / 1000).toFixed(1) + '천';
    return String(Math.round(n));
  }
  const comma = n => (Number(n) || 0).toLocaleString('ko-KR');
  const pct   = (n, d = 1) => (Number(n) || 0).toFixed(d) + '%';

  /* ── 날짜 ── */
  function daysSince(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(ms / 86400000, 0.5);
  }
  function dateLabel(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }
  function ago(iso) {
    const d = daysSince(iso);
    if (d < 1)   return '오늘';
    if (d < 30)  return Math.floor(d) + '일 전';
    if (d < 365) return Math.floor(d / 30) + '개월 전';
    return (d / 365).toFixed(1) + '년 전';
  }
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  /* ── ISO 8601 duration → 초 ── */
  function durationToSec(iso) {
    if (!iso) return 0;
    const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
    if (!m) return 0;
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }
  function secToClock(s) {
    s = Math.round(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
             : `${m}:${String(sec).padStart(2, '0')}`;
  }

  /* ── 수학 ── */
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  /** 0에서 시작해 x=anchor 일 때 1이 되는 로그 포화 함수 */
  const sat = (x, anchor) => clamp(Math.log10(1 + 9 * Math.max(0, x) / anchor), 0, 1);
  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  /* ── 문자열 ── */
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 한국어 조사 제거 + 토큰화 */
  const STOP = new Set([
    '그리고','하지만','그런데','이것','저것','그것','우리','너무','정말','진짜','오늘','영상',
    '입니다','있는','하는','되는','합니다','했다','했습니다','때문','에서','으로','에게','에도',
    'the','and','for','you','with','this','that','from','are','was','have','how','what','why',
    'your','can','not','但是','shorts'
  ]);
  const JOSA = /(은|는|이|가|을|를|의|에|도|와|과|로|으로|에서|에게|부터|까지|보다|이나|라도)$/;

  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^가-힣ㄱ-ㆎa-z0-9#\s]/g, ' ')
      .split(/\s+/)
      .map(w => (w.length > 3 ? w.replace(JOSA, '') : w))
      .filter(w => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
  }

  function freq(tokens, limit = 30) {
    const map = new Map();
    tokens.forEach(t => map.set(t, (map.get(t) || 0) + 1));
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    /* 반복 등장한 단어를 우선 보여주되, 없으면 상위 빈도로 대체한다 */
    const repeated = sorted.filter(([, c]) => c > 1);
    return (repeated.length ? repeated : sorted)
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }

  /* ── 저장/다운로드/클립보드 ── */
  function downloadCSV(rows, filename) {
    const csv = rows.map(r => r.map(c => {
      const v = String(c == null ? '' : c).replace(/"/g, '""');
      return /[",\n]/.test(v) ? `"${v}"` : v;
    }).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  }

  /* ── 토스트 ── */
  let toastTimer = null;
  function toast(msg, type = '') {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast' + (type ? ' toast--' + type : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  const debounce = (fn, ms = 250) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  return {
    $, $$, num, comma, pct, daysSince, dateLabel, ago, WEEKDAYS,
    durationToSec, secToClock, clamp, sat, median, avg,
    esc, tokenize, freq, downloadCSV, copy, toast, debounce, chunk
  };
})();
