/* ========================================
   Urban Garden — Scripts
   ======================================== */

// ---- Global Configurations & Elements ----
const DOM = {
  hero: document.getElementById('hero'),
  stickyNav: document.getElementById('sticky-nav'),
  floatingCta: document.getElementById('floating-cta'),
  navLinks: document.querySelectorAll('.nav-link'),
  sections: document.querySelectorAll('section[id]'),
  faqItems: document.querySelectorAll('.faq-item'),
  faqQuestions: document.querySelectorAll('.faq-question'),
  statNumbers: document.querySelectorAll('.proof-stat-number')
};

// ---- Countdown Timer ----
(function initCountdown() {
  // Event: 26 Jun 2026, 17:00 Helsinki time (EEST = UTC+3) — doors open
  const eventDate = new Date('2026-06-26T17:00:00+03:00');

  const $days = document.getElementById('cd-days');
  const $hours = document.getElementById('cd-hours');
  const $minutes = document.getElementById('cd-minutes');
  const $seconds = document.getElementById('cd-seconds');

  if (!$days) return; // Guard clause

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function update() {
    const now = new Date();
    let diff = eventDate - now;

    if (diff <= 0) {
      $days.textContent = '00';
      $hours.textContent = '00';
      $minutes.textContent = '00';
      $seconds.textContent = '00';
      const label = document.querySelector('.countdown-label');
      if (label) label.textContent = 'The event is live!';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    diff -= days * 1000 * 60 * 60 * 24;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    diff -= hours * 1000 * 60 * 60;
    const minutes = Math.floor(diff / (1000 * 60));
    diff -= minutes * 1000 * 60;
    const seconds = Math.floor(diff / 1000);

    $days.textContent = pad(days);
    $hours.textContent = pad(hours);
    $minutes.textContent = pad(minutes);
    $seconds.textContent = pad(seconds);
  }

  update();
  setInterval(update, 1000);
})();


// ---- Navigation & Sticky CTA Logic ----
(function initNavigation() {
  // 1. Scroll Spy for highlighting active nav link
  const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -60% 0px', // Trigger when section is in top 40% of viewport
    threshold: 0
  };

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const currentId = entry.target.getAttribute('id');
        
        DOM.navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('data-section') === currentId) {
            link.classList.add('active');
          }
        });
      }
    });
  }, observerOptions);

  DOM.sections.forEach(section => {
    sectionObserver.observe(section);
  });

  // 2. Sticky Nav & Floating Mobile CTA Visibility
  if (DOM.hero && DOM.stickyNav && DOM.floatingCta) {
    const heroObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        // If hero is NOT intersecting (user scrolled past it), show stickies
        if (!entry.isIntersecting) {
          DOM.stickyNav.classList.add('visible');
          
          // Only show floating bottom CTA on mobile (<768px) where top nav CTA might be hidden
          if (window.innerWidth <= 768) {
             DOM.floatingCta.classList.add('visible');
          }
        } else {
          // Hero is visible, hide stickies
          DOM.stickyNav.classList.remove('visible');
          DOM.floatingCta.classList.remove('visible');
        }
      });
    }, {
      root: null,
      threshold: 0.1 // Trigger when 90% of hero is gone
    });

    heroObserver.observe(DOM.hero);
    
    // Hide floating CTA if the user is looking at the tickets section
    // (Prevents double CTAs on screen)
    const ticketsSection = document.getElementById('tickets');
    if (ticketsSection) {
      const ticketsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && window.innerWidth <= 768) {
            DOM.floatingCta.classList.remove('visible');
          } else if (!entry.isIntersecting && !DOM.hero.getBoundingClientRect().top >= 0 && window.innerWidth <= 768) {
            // Only re-show if we aren't back at the hero section
             const heroRect = DOM.hero.getBoundingClientRect();
             if (heroRect.bottom < 0) {
               DOM.floatingCta.classList.add('visible');
             }
          }
        });
      }, { rootMargin: '0px 0px 200px 0px' });
      
      ticketsObserver.observe(ticketsSection);
    }
  }

  // 3. Smooth scrolling for nav links
  DOM.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const targetSection = document.getElementById(targetId);
      
      if (targetSection) {
        // Calculate offset to account for sticky nav height
        const navHeight = DOM.stickyNav.offsetHeight;
        const targetPosition = targetSection.getBoundingClientRect().top + window.scrollY - navHeight;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
})();


// ---- FAQ Accordion ----
(function initFAQ() {
  if (!DOM.faqQuestions.length) return;

  DOM.faqQuestions.forEach(question => {
    question.addEventListener('click', () => {
      const parentItem = question.closest('.faq-item');
      const isExpanded = question.getAttribute('aria-expanded') === 'true';

      // Optional: Close all other accordions
      DOM.faqItems.forEach(item => {
        item.classList.remove('active');
        item.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });

      // Toggle current one
      if (!isExpanded) {
        parentItem.classList.add('active');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });
})();


// ---- Animated Number Counters (Social Proof) ----
(function initStatCounters() {
  if (!DOM.statNumbers.length) return;

  const animateValue = (obj, start, end, duration) => {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // Use easeOutQuart for a nice slowdown effect at the end
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      
      obj.innerHTML = Math.floor(easeProgress * (end - start) + start);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        obj.innerHTML = end; // Ensure exact final value
      }
    };
    window.requestAnimationFrame(step);
  };

  const statsObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.getAttribute('data-target'), 10);
        
        // Vary duration based on the number size for effect
        const duration = target > 50 ? 2500 : 1500; 
        
        animateValue(entry.target, 0, target, duration);
        observer.unobserve(entry.target); // Only animate once
      }
    });
  }, { threshold: 0.5 });

  DOM.statNumbers.forEach(stat => {
    statsObserver.observe(stat);
  });
})();


// ---- Scroll Reveal ----
// Immediately reveal anything already in the viewport, animate the rest on scroll.
(function initReveal() {
  const reveals = document.querySelectorAll(
    '.about-section, .about-block, .about-extra, ' +
    '.social-proof-section, .faq-item, ' +
    '.lineup-section, .stage-block, .artist-card, ' +
    '.schedule-section, .schedule-item, ' +
    '.tickets-section, .ticket-card, ' +
    '.partners-section, .event-date-location'
  );

  // Use staggered delays on artist cards and schedule items for a nicer cascade effect
  const artistCards = document.querySelectorAll('.artist-card');
  artistCards.forEach((card, i) => {
    card.style.transitionDelay = `${(i % 5) * 0.06}s`; // Modulo 5 assumes 5 cards per row
  });

  const scheduleItems = document.querySelectorAll('.schedule-item');
  scheduleItems.forEach((item, i) => {
    item.style.transitionDelay = `${i * 0.05}s`;
  });
  
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item, i) => {
    item.style.transitionDelay = `${i * 0.08}s`;
  });

  // Mark all as reveal first
  reveals.forEach(el => el.classList.add('reveal'));

  // Immediately show anything that's already in the viewport (no flash)
  reveals.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add('visible');
    }
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.05,
    rootMargin: '0px 0px -20px 0px'
  });

  reveals.forEach(el => observer.observe(el));
})();


// ---- Ambient Light Particles Canvas ----
(function initLightParticles() {
  const canvas = document.getElementById('vine-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H;
  const particles = [];
  
  // Config flag to switch between sparks and ambient balls
  const USE_SPARKS = true;

  // Responsive particle count (fewer on mobile for performance)
  // Sparks need a bit more count to look good
  const PARTICLE_COUNT = USE_SPARKS ? 
    (window.innerWidth > 768 ? 100 : 40) : 
    (window.innerWidth > 768 ? 35 : 15);

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  // The original ambient light balls
  class LegacyParticle {
    constructor() {
      this.reset(true);
    }
    reset(initial = false) {
      this.x = Math.random() * W;
      this.y = initial ? Math.random() * H : H + Math.random() * 100 + 20;
      this.size = Math.random() * 11 + 3;
      this.speedX = (Math.random() - 0.5) * 0.4;
      this.speedY = -Math.random() * 0.6 - 0.2;
      this.opacity = Math.random() * 0.12 + 0.03;
      this.isWhite = Math.random() > 0.75;
      this.life = Math.random() * 800 + 400;
      this.maxLife = this.life;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.life--;
      this.x += Math.sin(Date.now() * 0.001 + this.y * 0.01) * 0.25;

      if (this.life <= 0 || this.y < -50 || this.x < -50 || this.x > W + 50) {
        this.reset();
      }
    }
    draw() {
      const fadeRatio = this.life < 100 ? this.life / 100 : (this.life > this.maxLife - 100 ? (this.maxLife - this.life) / 100 : 1);
      const currentOpacity = this.opacity * fadeRatio;
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.isWhite ? `rgba(255, 255, 255, ${currentOpacity})` : `rgba(180, 110, 220, ${currentOpacity})`;
      ctx.fill();
    }
  }

  // New realistic purple sparks
  class SparkParticle {
    constructor() {
      this.reset(true);
    }
    reset(initial = false) {
      this.x = Math.random() * W;
      // Sparks spawn heavily from the bottom or below
      this.y = initial ? H + Math.random() * H * 0.5 : H + Math.random() * 50;
      
      this.size = Math.random() * 1.5 + 0.5; // Small sparks
      
      // Fast upward speed initially
      this.speedY = -(Math.random() * 3 + 1.5); 
      this.speedX = (Math.random() - 0.5) * 1.5;
      
      this.baseOpacity = Math.random() * 0.6 + 0.4; // Starts bright
      this.opacity = this.baseOpacity;
      
      // Purple / Magenta / Deep Pink hues
      const hues = [270, 290, 310];
      this.hue = hues[Math.floor(Math.random() * hues.length)];
      
      this.maxLife = Math.random() * 150 + 80;
      this.life = this.maxLife;
      
      this.history = []; // For motion trails
    }
    update() {
      this.history.push({x: this.x, y: this.y});
      if (this.history.length > 6) { // Tail length
        this.history.shift();
      }
      
      this.x += this.speedX;
      this.y += this.speedY;
      
      // Air resistance / gravity
      this.speedY += 0.015; // Slow down ascent
      this.speedX += (Math.random() - 0.5) * 0.2; // Turbulence
      
      this.life--;
      
      // Twinkle
      this.opacity = this.baseOpacity * (0.6 + Math.random() * 0.4);
      
      // If it burns out or falls way out of bounds
      if (this.life <= 0 || this.y < -50 || this.x < -50 || this.x > W + 50 || this.y > H + 200) {
        this.reset();
        this.history = [];
      }
    }
    draw() {
      if (this.history.length < 2) return;
      
      const fadeRatio = Math.max(0, this.life / this.maxLife); // 1 to 0
      
      // Hot spark: starts almost white, cools to purple, then fades
      const lightness = fadeRatio > 0.85 ? 90 : Math.floor(fadeRatio * 40 + 30);
      
      // Draw tail
      ctx.beginPath();
      ctx.moveTo(this.history[0].x, this.history[0].y);
      for (let i = 1; i < this.history.length; i++) {
        ctx.lineTo(this.history[i].x, this.history[i].y);
      }
      
      ctx.strokeStyle = `hsla(${this.hue}, 100%, ${lightness}%, ${this.opacity * fadeRatio})`;
      ctx.lineWidth = this.size * 0.8;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Draw head
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${this.hue}, 100%, ${lightness + 10}%, ${this.opacity * fadeRatio})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(USE_SPARKS ? new SparkParticle() : new LegacyParticle());
  }

  // Optimize animation loop
  let animationFrameId;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loop() {
    if (prefersReducedMotion) return; // Stop entirely if user prefers reduced motion
    
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.update();
      p.draw();
    });
    animationFrameId = requestAnimationFrame(loop);
  }

  if (!prefersReducedMotion) {
    loop();
  }
})();


// ---- Smooth parallax on logo ----
(function initParallax() {
  const logo = document.getElementById('hero-logo');
  if (!logo) return;
  
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  // Use requestAnimationFrame for smoother parallax
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        // Stop calculating if scrolled way past hero
        if (scrollY < window.innerHeight) {
          const offset = scrollY * 0.15;
          const scale = 1 - scrollY * 0.0003;
          const opacity = 1 - scrollY * 0.0015;
          logo.style.transform = `translateY(${offset}px) scale(${Math.max(scale, 0.85)})`;
          logo.style.opacity = Math.max(opacity, 0);
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();

// ---- Flash Sale Timer ----
(function initFlashSaleTimer() {
  // Early bird price bump on May 27, 2026 at 00:00:00 (+03:00)
  const targetDate = new Date('2026-05-27T00:00:00+03:00').getTime();
  const timerElement = document.getElementById('flash-countdown');
  const topBar = document.getElementById('top-announcement-bar');
  const flashWrapper = document.querySelector('.flash-sale-wrapper');

  if (!timerElement || !topBar) return;

  function updateFlashTimer() {
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance <= 0) {
      // Flash sale over
      topBar.style.display = 'none';
      if (flashWrapper) flashWrapper.style.display = 'none';
      document.body.classList.remove('has-flash-sale');
      return;
    }

    document.body.classList.add('has-flash-sale');

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const format = (n) => n.toString().padStart(2, '0');
    
    if (days > 0) {
      timerElement.textContent = `${format(days)}d ${format(hours)}h ${format(minutes)}m ${format(seconds)}s`;
    } else {
      timerElement.textContent = `${format(hours)}:${format(minutes)}:${format(seconds)}`;
    }
  }

  updateFlashTimer();
  setInterval(updateFlashTimer, 1000);
})();

// ---- Language Toggle ----
(function initLanguageToggle() {
  const toggleBtn = document.getElementById('lang-toggle');
  if (!toggleBtn) return;

  const enSpan = toggleBtn.querySelector('.lang-toggle-en');
  const fiSpan = toggleBtn.querySelector('.lang-toggle-fi');

  function setLanguage(lang) {
    if (lang === 'fi') {
      document.body.classList.add('lang-fi');
      if (enSpan && fiSpan) {
        enSpan.style.opacity = '0.5';
        enSpan.style.color = 'var(--text-secondary)';
        fiSpan.style.opacity = '1';
        fiSpan.style.color = 'white';
      }
    } else {
      document.body.classList.remove('lang-fi');
      if (enSpan && fiSpan) {
        enSpan.style.opacity = '1';
        enSpan.style.color = 'white';
        fiSpan.style.opacity = '0.5';
        fiSpan.style.color = 'var(--text-secondary)';
      }
    }
  }

  // Check saved preference
  const savedLang = localStorage.getItem('ug_lang') || 'en';
  setLanguage(savedLang);

  toggleBtn.addEventListener('click', () => {
    const currentLang = document.body.classList.contains('lang-fi') ? 'fi' : 'en';
    const newLang = currentLang === 'fi' ? 'en' : 'fi';
    localStorage.setItem('ug_lang', newLang);
    setLanguage(newLang);
  });
})();
