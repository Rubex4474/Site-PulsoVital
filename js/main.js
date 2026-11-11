/* Pulso Vital Enfermagem — interações */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* ---------- Header: sombra ao rolar ---------- */
  var header = document.querySelector('.site-header');
  var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Menu mobile ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('menu');

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    nav.classList.toggle('is-open', open);
  }

  toggle.addEventListener('click', function () {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true');
  });
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      toggle.focus();
    }
  });
  window.matchMedia('(min-width: 960px)').addEventListener('change', function (e) {
    if (e.matches) setMenu(false);
  });

  /* ---------- Animações de entrada ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !hasIO) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        // Pequeno escalonamento entre irmãos que entram juntos
        var siblings = el.parentElement ? el.parentElement.querySelectorAll(':scope > .reveal') : [];
        var index = Array.prototype.indexOf.call(siblings, el);
        el.style.transitionDelay = Math.min(Math.max(index, 0), 4) * 70 + 'ms';
        el.classList.add('is-in');
        revealIO.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { revealIO.observe(el); });
  }

  /* ---------- WhatsApp flutuante: aparece depois do hero ---------- */
  var waFloat = document.querySelector('.wa-float');
  var hero = document.querySelector('.hero');
  if (hasIO && hero) {
    new IntersectionObserver(function (entries) {
      waFloat.classList.toggle('is-visible', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(hero);
  } else {
    waFloat.classList.add('is-visible');
  }

  /* ---------- "Como funciona": caminho animado no mobile ----------
     A trilha vai do centro do 1º marcador ao centro do último. O preenchimento acompanha
     uma linha imaginária a 60% da altura da tela; cada passo acende quando ela passa
     pelo seu marcador. No desktop (ou com reduced-motion) fica tudo aceso. */
  var stepsWrap = document.querySelector('.steps-wrap');
  if (stepsWrap) {
    var pathTrack = stepsWrap.querySelector('.steps-track');
    var pathFill = stepsWrap.querySelector('.steps-fill');
    var stepItems = stepsWrap.querySelectorAll('.step');
    var markers = stepsWrap.querySelectorAll('.step-marker');
    var pathMQ = window.matchMedia('(max-width: 767.98px)');
    var ticking = false;

    // posição do centro do marcador dentro de .steps-wrap, pelo layout (ignora transforms das animações)
    var centerY = function (el) {
      var y = el.offsetHeight / 2;
      for (var node = el; node && node !== stepsWrap; node = node.offsetParent) y += node.offsetTop;
      return y;
    };

    var updatePath = function () {
      ticking = false;
      var usePath = pathMQ.matches && !reduceMotion;
      stepsWrap.classList.toggle('is-path', usePath);
      if (!usePath) {
        stepItems.forEach(function (s) { s.classList.add('is-active'); });
        return;
      }
      var first = centerY(markers[0]);
      var last = centerY(markers[markers.length - 1]);
      pathTrack.style.top = first + 'px';
      pathTrack.style.height = (last - first) + 'px';

      // linha de leitura (60% da tela) em coordenadas de .steps-wrap
      var line = window.innerHeight * 0.6 - stepsWrap.getBoundingClientRect().top;
      pathFill.style.height = Math.min(Math.max(line - first, 0), last - first) + 'px';
      markers.forEach(function (m, i) {
        stepItems[i].classList.toggle('is-active', line >= centerY(m));
      });
    };
    var requestPath = function () {
      if (!ticking) { ticking = true; requestAnimationFrame(updatePath); }
    };

    window.addEventListener('scroll', requestPath, { passive: true });
    window.addEventListener('resize', requestPath);
    pathMQ.addEventListener('change', requestPath);
    updatePath();
  }

  /* ---------- Carrossel de depoimentos (auto-play) ----------
     Avança sozinho o tempo todo. Para enquanto a pessoa segura o dedo/clique no card,
     com o mouse em cima, foco pelo teclado, "Ler mais" aberto, aba oculta ou seção
     fora da tela; depois de soltar/arrastar, retoma após IDLE_MS.
     Com prefers-reduced-motion não roda sozinho (as setas continuam funcionando). */
  var carousel = document.querySelector('.carousel');
  var AUTOPLAY_MS = 5500;
  var AUTOPLAY_MOBILE_MS = 4000;  // no celular aparece 1 card por vez, então passa mais rápido
  var mobileMQ = window.matchMedia('(max-width: 599.98px)');
  var IDLE_MS = 3000;

  if (carousel) {
    var track = carousel.querySelector('.carousel-track');
    var cards = carousel.querySelectorAll('.review');
    var dotsWrap = document.querySelector('.carousel-dots');
    var arrowBtns = document.querySelectorAll('.carousel-btn[data-dir]');
    var reviewsSection = document.getElementById('depoimentos');

    var holding = false;
    var hovering = false;
    var focused = false;
    var inView = false;
    var lastInteraction = 0;

    var dots = Array.prototype.map.call(cards, function () {
      var d = document.createElement('span');
      dotsWrap.appendChild(d);
      return d;
    });

    var stepSize = function () {
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return cards[0].getBoundingClientRect().width + gap;
    };
    var maxScroll = function () { return carousel.scrollWidth - carousel.clientWidth - 2; };

    var go = function (dir) {
      var behavior = reduceMotion ? 'auto' : 'smooth';
      if (dir > 0 && carousel.scrollLeft >= maxScroll()) {
        carousel.scrollTo({ left: 0, behavior: behavior });
      } else if (dir < 0 && carousel.scrollLeft <= 2) {
        carousel.scrollTo({ left: carousel.scrollWidth, behavior: behavior });
      } else {
        carousel.scrollBy({ left: stepSize() * dir, behavior: behavior });
      }
    };

    var updateDots = function () {
      var index = Math.round(carousel.scrollLeft / stepSize());
      // no fim do scroll, os últimos cards visíveis não chegam ao início: marca o último
      if (carousel.scrollLeft >= maxScroll()) index = cards.length - 1;
      dots.forEach(function (d, i) { d.classList.toggle('is-active', i === index); });
    };

    var touch = function () { lastInteraction = Date.now(); };
    var hold = function () { holding = true; touch(); };
    var release = function () { holding = false; touch(); };

    var lastAdvance = Date.now();
    setInterval(function () {
      var now = Date.now();
      var reading = carousel.querySelector('.review.is-expanded');
      if (reduceMotion || holding || hovering || focused || reading || !inView || document.hidden ||
          now - lastInteraction < IDLE_MS) {
        lastAdvance = now;  // ao retomar, espera o intervalo inteiro
        return;
      }
      if (now - lastAdvance >= (mobileMQ.matches ? AUTOPLAY_MOBILE_MS : AUTOPLAY_MS)) {
        lastAdvance = now;
        go(1);
      }
    }, 250);

    arrowBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { touch(); go(Number(btn.dataset.dir)); });
    });

    // Segurar o dedo (ou o clique) sobre os depoimentos para de passar; soltar retoma
    carousel.addEventListener('touchstart', hold, { passive: true });
    carousel.addEventListener('touchend', release);
    carousel.addEventListener('touchcancel', release);
    carousel.addEventListener('mousedown', hold);
    window.addEventListener('mouseup', function () { if (holding) release(); });
    carousel.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hovering = true; });
    carousel.addEventListener('pointerleave', function () { hovering = false; });
    carousel.addEventListener('wheel', touch, { passive: true });
    // Só pausa no foco por teclado (um toque também foca o carrossel e não deve travá-lo)
    carousel.addEventListener('focusin', function (e) { focused = e.target.matches(':focus-visible'); });
    carousel.addEventListener('focusout', function () { focused = false; });
    carousel.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); touch(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); touch(); go(-1); }
    });
    carousel.addEventListener('scroll', updateDots, { passive: true });
    window.addEventListener('resize', updateDots);

    if (hasIO) {
      new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; }, { threshold: 0.35 })
        .observe(reviewsSection);
    } else {
      inView = true;
    }

    // "Ler mais" só nos depoimentos que passam do corte de 7 linhas (medido após carregar a fonte)
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { cards.forEach(function (card) {
      var text = card.querySelector('blockquote p');
      if (text.scrollHeight <= text.clientHeight + 2) return;
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'review-more';
      more.textContent = 'Ler mais';
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', function () {
        var open = card.classList.toggle('is-expanded');
        more.textContent = open ? 'Ler menos' : 'Ler mais';
        more.setAttribute('aria-expanded', String(open));
        touch();
      });
      card.querySelector('blockquote').after(more);
    }); });

    updateDots();
  }
})();
