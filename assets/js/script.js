const nav = document.querySelector('.site-nav');
const menuToggle = document.querySelector('.menu-toggle');
const tabLinks = document.querySelectorAll('[data-tab-link]');
const panels = document.querySelectorAll('.tab-panel');
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

const contentState = {
  booking: {},
  treatments: []
};

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element && typeof value === 'string') element.textContent = value;
}

function linesToHtml(lines = []) {
  return lines.map((line) => escapeHtml(line)).join('<br />');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

function renderHomepage(data) {
  setText('#heroTitleFirst', data.heroTitleFirst);
  setText('#heroTitleSecond', data.heroTitleSecond);
  setText('#heroLine', data.heroLine);
  setText('#heroLineEmphasis', data.heroLineEmphasis);
  setText('#heroIntro', data.intro);
  setText('#primaryButton', data.primaryButton);
  setText('#secondaryButton', data.secondaryButton);
  setText('#homeSectionKicker', data.sectionKicker);
  setText('#homeSectionHeading', data.sectionHeading);
  const row = document.querySelector('#featureRow');
  if (row) row.innerHTML = (data.features || []).map((item) =>
    `<article><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`
  ).join('');
}

function renderTreatments(data) {
  setText('#treatmentsEyebrow', data.eyebrow);
  setText('#treatmentsHeading', data.heading);
  setText('#treatmentsIntro', data.intro);
  contentState.treatments = (data.items || []).filter((item) => item.active !== false);
  const grid = document.querySelector('#treatmentGrid');
  if (grid) grid.innerHTML = contentState.treatments.map((item) =>
    `<article data-treatment-id="${escapeHtml(item.id)}"><span>${escapeHtml(item.icon)}</span><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.description)}</p><strong>${escapeHtml(item.price)}</strong></article>`
  ).join('');
}

function stageDecorations(className) {
  if (className === 'day1') return '<span class="float heart h1">♥</span><span class="float heart h2">♥</span><span class="float heart h3">♥</span>';
  if (className === 'day8') return '<span class="pop q1">?</span><span class="pop q2">!</span>';
  if (className === 'day42') return '<span class="spark s1">✦</span><span class="spark s2">✦</span><span class="spark s3">✦</span>';
  return '';
}

function renderAftercare(data) {
  setText('#aftercareEyebrow', data.eyebrow);
  setText('#aftercareHeading', data.heading);
  setText('#aftercareIntro', data.intro);
  const timeline = document.querySelector('#aftercareTimeline');
  if (!timeline) return;

  if (data.posterImage) {
    timeline.classList.add('timeline-poster');
    timeline.innerHTML = `<figure class="aftercare-poster"><img src="${escapeHtml(data.posterImage)}" alt="${escapeHtml(data.posterAlt || 'Illustrated eyebrow aftercare journey')}" />${data.posterCaption ? `<figcaption>${escapeHtml(data.posterCaption)}</figcaption>` : ''}</figure>`;
    return;
  }

  timeline.classList.remove('timeline-poster');
  timeline.classList.add('aftercare-carousel');
  timeline.innerHTML = (data.stages || []).map((stage, index) => {
    if (stage.artworkOnly) {
      return `<article class="card aftercare-art-card ${escapeHtml(stage.className)}" data-carousel-slide="${index}"><img src="${escapeHtml(stage.image)}" alt="${escapeHtml(stage.alt)}" loading="lazy" /></article>`;
    }
    return `<article class="card ${escapeHtml(stage.className)}" data-carousel-slide="${index}"><div class="stage"><img src="${escapeHtml(stage.image)}" alt="${escapeHtml(stage.alt)}" class="emoji ${escapeHtml(stage.imageClass)}" />${stageDecorations(stage.className)}</div><h2>${escapeHtml(stage.day)}</h2><p>${escapeHtml(stage.text)}</p></article>`;
  }).join('');

  const previousNav = timeline.parentElement?.querySelector('.aftercare-carousel-nav');
  if (previousNav) previousNav.remove();
  const slides = [...timeline.querySelectorAll('[data-carousel-slide]')];
  if (slides.length > 1) {
    const nav = document.createElement('div');
    nav.className = 'aftercare-carousel-nav';
    nav.setAttribute('aria-label', 'Choose an aftercare stage');
    nav.innerHTML = slides.map((_, index) => `<button type="button" class="aftercare-carousel-dot${index === 0 ? ' active' : ''}" aria-label="Show aftercare day ${index + 1}" aria-current="${index === 0 ? 'true' : 'false'}"></button>`).join('');
    timeline.insertAdjacentElement('afterend', nav);
    const dots = [...nav.querySelectorAll('.aftercare-carousel-dot')];
    const selectSlide = (index, smooth = true) => {
      slides[index]?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest', inline: 'start' });
      dots.forEach((dot, dotIndex) => {
        const active = dotIndex === index;
        dot.classList.toggle('active', active);
        dot.setAttribute('aria-current', active ? 'true' : 'false');
      });
    };
    dots.forEach((dot, index) => dot.addEventListener('click', () => selectSlide(index)));

    let scrollTimer;
    timeline.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const index = Math.max(0, Math.min(slides.length - 1, Math.round(timeline.scrollLeft / Math.max(1, timeline.clientWidth))));
        dots.forEach((dot, dotIndex) => {
          const active = dotIndex === index;
          dot.classList.toggle('active', active);
          dot.setAttribute('aria-current', active ? 'true' : 'false');
        });
      }, 60);
    }, { passive: true });

    let dragging = false;
    let startX = 0;
    let startScrollLeft = 0;
    timeline.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startScrollLeft = timeline.scrollLeft;
      timeline.classList.add('is-dragging');
      timeline.setPointerCapture?.(event.pointerId);
    });
    timeline.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      timeline.scrollLeft = startScrollLeft - (event.clientX - startX);
    });
    const finishDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      timeline.classList.remove('is-dragging');
      timeline.releasePointerCapture?.(event.pointerId);
      const index = Math.max(0, Math.min(slides.length - 1, Math.round(timeline.scrollLeft / Math.max(1, timeline.clientWidth))));
      selectSlide(index);
    };
    timeline.addEventListener('pointerup', finishDrag);
    timeline.addEventListener('pointercancel', finishDrag);
  }
  observeCards();
}

function renderBooking(data) {
  setText('#bookingEyebrow', data.eyebrow);
  setText('#bookingHeading', data.heading);
  setText('#bookingIntro', data.intro);
  setText('#bookingStudioNote', data.studioNote);
  setText('#bookingSecurityNote', data.securityNote);
  setText('#squareBookingButton', data.buttonText || 'Continue to secure booking');

  const steps = document.querySelector('#bookingSteps');
  if (steps) {
    steps.innerHTML = (data.steps || []).map((step, index) =>
      `<article class="booking-step"><span aria-hidden="true">${index + 1}</span><div><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p></div></article>`
    ).join('');
  }

  const bookingButton = document.querySelector('#squareBookingButton');
  if (bookingButton && typeof data.bookingUrl === 'string') {
    bookingButton.href = data.bookingUrl;
  }
  contentState.booking = data;
}

function renderContact(data) {
  setText('#contactEyebrow', data.eyebrow);
  setText('#contactHeading', data.heading);
  setText('#contactIntro', data.intro);
  setText('#studioHeading', data.studio?.heading);
  setText('#contactDetailsHeading', data.contact?.heading);
  setText('#hoursHeading', data.hours?.heading);
  setText('#mapText', data.mapText);
  const studioLines = document.querySelector('#studioLines');
  if (studioLines) studioLines.innerHTML = linesToHtml(data.studio?.lines);
  const hoursLines = document.querySelector('#hoursLines');
  if (hoursLines) hoursLines.innerHTML = linesToHtml(data.hours?.lines);
  const contactDetails = document.querySelector('#contactDetails');
  if (contactDetails) contactDetails.innerHTML = [
    `Email: ${escapeHtml(data.contact?.email || '')}`,
    `Phone: ${escapeHtml(data.contact?.phone || '')}`,
    `Instagram: ${escapeHtml(data.contact?.instagram || '')}`
  ].join('<br />');
}

function renderPrivacy(data) {
  setText('#privacyEyebrow', data.eyebrow);
  setText('#privacyHeading', data.heading);
  setText('#privacyIntro', data.intro);
  const card = document.querySelector('#policyCard');
  if (card) card.innerHTML = (data.sections || []).map((section) =>
    `<h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.text)}</p>`
  ).join('');
}

async function loadEditableContent() {
  const files = ['site', 'homepage', 'treatments', 'aftercare', 'booking', 'contact', 'privacy'];
  const results = await Promise.allSettled(files.map((name) => loadJson(`content/${name}.json`)));
  const content = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') content[files[index]] = result.value;
    else console.error(result.reason);
  });

  if (content.site) {
    document.title = content.site.pageTitle || document.title;
    const meta = document.querySelector('#metaDescription');
    if (meta && content.site.metaDescription) meta.content = content.site.metaDescription;
    setText('#footerText', content.site.footerText);
  }
  if (content.homepage) renderHomepage(content.homepage);
  if (content.treatments) renderTreatments(content.treatments);
  if (content.aftercare) renderAftercare(content.aftercare);
  if (content.booking) renderBooking(content.booking);
  if (content.contact) renderContact(content.contact);
  if (content.privacy) renderPrivacy(content.privacy);
}

function showTab(tabName) {
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === tabName));
  tabLinks.forEach((link) => link.classList.toggle('active', link.dataset.tabLink === tabName));
  if (nav) nav.classList.remove('open');
  if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

tabLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const tabName = link.dataset.tabLink;
    history.pushState(null, '', `#${tabName}`);
    showTab(tabName);
  });
});

menuToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('in-view');
  });
}, { threshold: 0.2 });

function observeCards() {
  document.querySelectorAll('.card').forEach((card, index) => {
    card.style.transitionDelay = `${index * 80}ms`;
    observer.observe(card);
  });
}

const startTab = location.hash?.replace('#', '') || 'home';
if (document.getElementById(startTab)) showTab(startTab);
loadEditableContent();
