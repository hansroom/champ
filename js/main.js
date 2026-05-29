/* ================================================================
   로밍도깨비 - main.js
================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initNavHamburger();
  initNavScroll();
  initPersonaSlider();
  initScrollAnimations();
  initBarChartAnimation();
});

/* ── Nav: hamburger ── */
function initNavHamburger() {
  const btn  = document.querySelector('.gnb__hamburger');
  const menu = document.querySelector('.gnb__menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    btn.classList.toggle('is-open', open);
    btn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  });

  /* close on link click */
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.remove('is-open');
      btn.classList.remove('is-open');
    });
  });
}

/* ── Nav: change background on scroll ── */
function initNavScroll() {
  const gnb = document.querySelector('.gnb');
  if (!gnb) return;

  const update = () => {
    if (window.scrollY > 20) {
      gnb.style.background = 'rgba(248,249,253,0.96)';
    } else {
      gnb.style.background = 'rgba(248,249,253,0.85)';
    }
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/* ── Persona Slider ── */
function initPersonaSlider() {
  const slides = document.querySelectorAll('.persona-slide');
  const dots   = document.querySelectorAll('.persona-slider .dot');
  const btnPrev = document.querySelector('.persona-slider__btn--prev');
  const btnNext = document.querySelector('.persona-slider__btn--next');

  if (!slides.length) return;

  let current = 0;
  let timer;

  const goTo = (index) => {
    slides[current].classList.remove('active');
    dots[current]?.classList.remove('active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current]?.classList.add('active');
  };

  const startAuto = () => {
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), 5000);
  };

  btnPrev?.addEventListener('click', () => { goTo(current - 1); startAuto(); });
  btnNext?.addEventListener('click', () => { goTo(current + 1); startAuto(); });

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      goTo(Number(dot.dataset.index));
      startAuto();
    });
  });

  /* touch swipe */
  const slider = document.querySelector('.persona-slides');
  if (slider) {
    let startX = 0;
    slider.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', e => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) { goTo(diff > 0 ? current + 1 : current - 1); startAuto(); }
    }, { passive: true });
  }

  startAuto();
}

/* ── Scroll animations ── */
function initScrollAnimations() {
  /* add fade-up class to elements */
  const targets = [
    '.section-header',
    '.card-split__text',
    '.card-split__img',
    '.chart-card',
    '.going-card',
    '.story-item',
    '.newhero-banner',
  ];
  targets.forEach(sel => {
    document.querySelectorAll(sel).forEach((el, i) => {
      el.classList.add('fade-up');
      el.classList.add(`fade-up-delay-${(i % 3) + 1}`);
    });
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
}

/* ── Bar chart: animate heights on scroll ── */
function initBarChartAnimation() {
  const bars = document.querySelectorAll('.bar');
  if (!bars.length) return;

  /* Store original heights and reset to 0 for animation */
  bars.forEach(bar => {
    const h = bar.style.height;
    bar.dataset.targetHeight = h;
    bar.style.height = '0px';
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const chart = entry.target;
        chart.querySelectorAll('.bar').forEach(bar => {
          bar.style.height = bar.dataset.targetHeight;
        });
        observer.unobserve(chart);
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.chart-card').forEach(card => observer.observe(card));
}
