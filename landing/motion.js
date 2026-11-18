// Motion system: GSAP + ScrollTrigger + Lenis. Content stays visible without JS
// or with reduced motion; this file only adds choreography on top.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  // Before/after works with or without GSAP.
  initBeforeAfter();
  initNav();

  if (!hasGsap) return;

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power3.out', duration: 0.85 });

  if (reduceMotion) return;
  document.documentElement.classList.add('has-motion');

  // Smooth scroll, driven by the GSAP ticker so ScrollTrigger stays in sync.
  if (typeof window.Lenis !== 'undefined') {
    var lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9, anchors: { offset: -70 } });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  // Hero: media settles first, headline lines second, copy and CTAs last.
  var heroTl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  heroTl
    .fromTo('.hero-media img', { scale: 1.12 }, { scale: 1, duration: 2.2, ease: 'power3.out' }, 0)
    .fromTo('[data-hero-title] .line', { yPercent: 105 }, { yPercent: 0, duration: 1.1, stagger: 0.12 }, 0.25)
    .fromTo('[data-hero-fade]', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1 }, 0.75);

  // Single reveals.
  gsap.utils.toArray('[data-reveal]').forEach(function (el) {
    gsap.fromTo(el, { autoAlpha: 0, y: 34 }, {
      autoAlpha: 1, y: 0, duration: 0.95, ease: 'power4.out',
      scrollTrigger: { trigger: el, start: 'top 84%', once: true }
    });
  });

  // Group reveals (process steps).
  gsap.utils.toArray('[data-reveal-group]').forEach(function (group) {
    gsap.fromTo(group.querySelectorAll('[data-reveal-item]'), { autoAlpha: 0, y: 36 }, {
      autoAlpha: 1, y: 0, duration: 0.95, ease: 'power4.out', stagger: 0.09,
      scrollTrigger: { trigger: group, start: 'top 82%', once: true }
    });
  });

  // Clip reveals for framed images.
  gsap.utils.toArray('[data-image-reveal]').forEach(function (fig) {
    gsap.fromTo(fig, { clipPath: 'inset(12% 8% 12% 8%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'power4.out',
      scrollTrigger: { trigger: fig, start: 'top 85%', once: true }
    });
  });

  // Gentle parallax: backgrounds slower than content.
  gsap.utils.toArray('[data-parallax-image]').forEach(function (img) {
    var speed = Number(img.dataset.parallaxSpeed || 0.1);
    var section = img.closest('[data-parallax-section]') || img;
    gsap.to(img, {
      y: function () { return window.innerHeight * speed * -1; },
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 1.2, invalidateOnRefresh: true }
    });
  });

  // Pinned horizontal gallery on desktop; native swipe on mobile (see CSS).
  var mm = gsap.matchMedia();
  mm.add('(min-width: 961px)', function () {
    var section = document.querySelector('[data-gallery]');
    var track = document.querySelector('[data-gallery-track]');
    if (!section || !track) return;
    // RTL: the track overflows to the left, so it travels right (+x).
    var distance = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
    gsap.to(track, {
      x: distance,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: function () { return '+=' + distance(); },
        scrub: 1,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true
      }
    });
  });

  // Magnetic CTAs.
  if (!coarse) {
    gsap.utils.toArray('[data-magnetic]').forEach(function (el) {
      var xTo = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3.out' });
      var yTo = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3.out' });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.2);
        yTo((e.clientY - r.top - r.height / 2) * 0.2);
      });
      el.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
    });
  }

  // Before/after: one slow sweep the first time it enters, to show it is draggable.
  var frame = document.querySelector('[data-ba]');
  if (frame) {
    var state = { v: 50 };
    ScrollTrigger.create({
      trigger: frame, start: 'top 70%', once: true,
      onEnter: function () {
        if (frame.dataset.touched) return;
        gsap.timeline()
          .to(state, { v: 22, duration: 0.9, ease: 'power2.inOut', onUpdate: function () { setBA(frame, state.v); } }, 0.6)
          .to(state, { v: 50, duration: 1.0, ease: 'power3.out', onUpdate: function () { setBA(frame, state.v); } });
      }
    });
  }

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });

  // ── helpers ──────────────────────────────────────────
  function setBA(frameEl, value) {
    frameEl.style.setProperty('--pos', value + '%');
    var range = frameEl.querySelector('[data-ba-range]');
    if (range) range.value = String(Math.round(value));
  }

  function initBeforeAfter() {
    var f = document.querySelector('[data-ba]');
    if (!f) return;
    var range = f.querySelector('[data-ba-range]');
    range.addEventListener('input', function () {
      f.dataset.touched = '1';
      f.style.setProperty('--pos', range.value + '%');
    });
  }

  function initNav() {
    var nav = document.querySelector('[data-nav]');
    var hero = document.querySelector('.hero');
    if (!nav || !hero) return;
    var onScroll = function () {
      nav.classList.toggle('is-solid', window.scrollY > hero.offsetHeight - 90);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
