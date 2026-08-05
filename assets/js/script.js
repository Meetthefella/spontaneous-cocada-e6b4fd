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


function addPreviewBanner(message) {
  const banner = document.createElement('div');
  banner.className = 'preview-banner';
  const label = document.createElement('span');
  label.textContent = message;
  const button = document.createElement('button');
  button.className = 'preview-back-button';
  button.type = 'button';
  button.textContent = '← Back to Website Manager';
  button.addEventListener('click', () => {
    const returnUrl = localStorage.getItem('eb-preview-return-url-v1') || '/manage/';
    window.close();
    setTimeout(() => {
      if (!window.closed) window.location.href = returnUrl;
    }, 120);
  });
  banner.append(label, button);
  document.body.prepend(banner);
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
  contentState.treatments = (data.items || []).filter((item) => item.visible !== false && item.active !== false);
  const grid = document.querySelector('#treatmentGrid');
  if (grid) grid.innerHTML = contentState.treatments.map((item) => {
    const title = item.title || item.name || '';
    const description = item.shortDescription || item.description || '';
    const icon = item.icon || '✦';
    const duration = item.duration ? `<small aria-label="Treatment time"> · ${escapeHtml(item.duration)}</small>` : '';
    return `<article data-treatment-id="${escapeHtml(item.id)}"><span>${escapeHtml(icon)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p><strong>${escapeHtml(item.price || '')}</strong>${duration}</article>`;
  }).join('');
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
  setText('#bookingComplianceNote', data.complianceNote);
  setText('#bookingEligibilityHeading', data.eligibilityHeading || 'Before you continue');
  setText('#bookingClientTypeQuestion', data.clientTypeQuestion);
  setText('#bookingNewClientLabel', data.newClientLabel);
  setText('#bookingReturningClientLabel', data.returningClientLabel);
  setText('#bookingAgeConfirmationLabel', data.ageConfirmation);
  setText('#bookingPatchConfirmationLabel', data.patchConfirmation);

  const steps = document.querySelector('#bookingSteps');
  if (steps) {
    steps.innerHTML = (data.steps || []).map((step, index) =>
      `<article class="booking-step"><span aria-hidden="true">${index + 1}</span><div><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p></div></article>`
    ).join('');
  }

  const bookingButton = document.querySelector('#squareBookingButton');
  const routeMessage = document.querySelector('#bookingRouteMessage');
  const ageConfirmation = document.querySelector('#bookingAgeConfirmation');
  const patchConfirmation = document.querySelector('#bookingPatchConfirmation');
  const clientTypeInputs = [...document.querySelectorAll('input[name="bookingClientType"]')];

  const updateBookingRoute = () => {
    const selectedType = clientTypeInputs.find((input) => input.checked)?.value || '';
    const confirmed = Boolean(selectedType && ageConfirmation?.checked && patchConfirmation?.checked);

    if (routeMessage) {
      routeMessage.textContent = selectedType === 'new'
        ? (data.newClientMessage || '')
        : selectedType === 'returning'
          ? (data.returningClientMessage || '')
          : 'Choose the option that applies to you.';
      routeMessage.dataset.route = selectedType;
    }

    if (!bookingButton) return;
    bookingButton.textContent = selectedType === 'new'
      ? (data.newClientButtonText || 'Book your free Patch Test')
      : selectedType === 'returning'
        ? (data.returningClientButtonText || 'Continue to Microblading booking')
        : (data.buttonText || 'Choose an option to continue');

    bookingButton.href = confirmed && typeof data.bookingUrl === 'string' ? data.bookingUrl : '#';
    bookingButton.classList.toggle('is-disabled', !confirmed);
    bookingButton.setAttribute('aria-disabled', String(!confirmed));
  };

  clientTypeInputs.forEach((input) => input.addEventListener('change', updateBookingRoute));
  ageConfirmation?.addEventListener('change', updateBookingRoute);
  patchConfirmation?.addEventListener('change', updateBookingRoute);
  bookingButton?.addEventListener('click', (event) => {
    if (bookingButton.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });
  updateBookingRoute();
  contentState.booking = data;
}

function renderContact(data) {
  setText('#contactEyebrow', data.eyebrow);
  setText('#contactHeading', data.heading);
  setText('#contactIntro', data.intro);
  setText('#contactDetailsHeading', data.contact?.heading);
  setText('#hoursHeading', data.hours?.heading);
  const hoursLines = document.querySelector('#hoursLines');
  if (hoursLines) hoursLines.innerHTML = linesToHtml(data.hours?.lines);
  const contactDetails = document.querySelector('#contactDetails');
  if (contactDetails) {
    const details = [];
    if (data.contact?.email) details.push(`Email: <a href="mailto:${escapeHtml(data.contact.email)}">${escapeHtml(data.contact.email)}</a>`);
    if (data.contact?.phone) details.push(`Phone: <a href="tel:${escapeHtml(data.contact.phone.replace(/\s+/g, ''))}">${escapeHtml(data.contact.phone)}</a>`);
    if (data.contact?.instagram) details.push(`Instagram: ${escapeHtml(data.contact.instagram)}`);
    contactDetails.innerHTML = details.join('<br />');
  }
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


async function loadPublishedHomepage() {
  const previewRequested = new URLSearchParams(location.search).get('preview') === 'homepage';
  if (previewRequested) {
    try {
      const preview = JSON.parse(localStorage.getItem('eb-homepage-preview-v1') || 'null');
      if (preview?.features) {
        addPreviewBanner('Homepage preview only — these changes are not live.');
        return preview;
      }
    } catch (error) {
      console.warn('Unable to load homepage preview.', error);
    }
  }

  try {
    const response = await fetch(`/.netlify/functions/homepage?live=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) {
      const result = await response.json();
      if (result?.data?.features) return result.data;
    }
  } catch (error) {
    console.warn('Published homepage content is temporarily unavailable.', error);
  }

  return loadJson('content/homepage.json');
}

async function loadPublishedTreatments() {
  const previewRequested = new URLSearchParams(location.search).get('preview') === 'treatments';
  if (previewRequested) {
    try {
      const preview = JSON.parse(localStorage.getItem('eb-treatments-preview-v2') || 'null');
      if (preview?.items) {
        addPreviewBanner('Treatments preview only — these changes are not live.');
        return preview;
      }
    } catch (error) {
      console.warn('Unable to load treatment preview.', error);
    }
  }

  try {
    const response = await fetch(`/.netlify/functions/treatments?live=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) {
      const result = await response.json();
      if (result?.data?.items) return result.data;
    }
  } catch (error) {
    console.warn('Published treatment content is temporarily unavailable.', error);
  }

  return loadJson('content/treatments.json');
}


function renderGallery(data) {
  setText('#galleryEyebrow', data.eyebrow); setText('#galleryHeading', data.heading); setText('#galleryIntro', data.intro);
  const root = document.querySelector('#galleryGrid'); if (!root) return;
  const items=(data.items||[]).filter(item=>item.visible!==false);
  root.innerHTML = items.length ? items.map(item=>`<article class="card">${item.image?`<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.alt||item.title||'Effortless Beauty work')}" />`:''}<h2>${escapeHtml(item.title||'Recent work')}</h2><p>${escapeHtml(item.caption||'')}</p></article>`).join('') : '<article class="card"><h2>Gallery coming soon</h2><p>Approved client photographs will appear here.</p></article>';
}
function renderMerchandise(data) {
  setText('#merchandiseEyebrow', data.eyebrow); setText('#merchandiseHeading', data.heading); setText('#merchandiseIntro', data.intro);
  const root = document.querySelector('#merchandiseGrid'); if (!root) return;
  const source = Array.isArray(data.categories) ? data.categories : Array.isArray(data.items) ? data.items : Array.isArray(data.products) ? data.products : [];
  const items = source
    .filter(item => item && typeof item === 'object')
    .map((item, index) => ({ ...item, _displayOrder: Number.isFinite(Number(item.order)) ? Number(item.order) : index }))
    .filter(item => item.visible !== false)
    .sort((left, right) => left._displayOrder - right._displayOrder);
  root.innerHTML = items.length
    ? items.map((item, index) => {
      const title = item.title || item.name || 'Merchandise item';
      const alt = item.alt || item.imageAlt || `${title} merchandise`;
      const image = typeof item.image === 'string' ? item.image.trim() : '';
      const imageMarkup = image
        ? `<button class="merchandise-image-button" type="button" data-merchandise-image="${escapeHtml(image)}" data-merchandise-alt="${escapeHtml(alt)}" aria-label="View a larger image of ${escapeHtml(title)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" loading="lazy" /></button>`
        : `<div class="merchandise-image-placeholder" role="img" aria-label="${escapeHtml(title)} image coming soon"><span aria-hidden="true">✦</span><small>Image coming soon</small></div>`;
      return `<article class="card in-view merchandise-card" data-merchandise-card="${index}">${imageMarkup}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(item.description || item.caption || '')}</p>${item.price ? `<strong>${escapeHtml(item.price)}</strong>` : ''}</article>`;
    }).join('')
    : '<article class="card in-view"><h2>Merchandise coming soon</h2><p>New Effortless Beauty items will appear here.</p></article>';
  root.querySelectorAll('.merchandise-image-button img').forEach((image) => image.addEventListener('error', () => {
    const button = image.closest('.merchandise-image-button');
    if (!button) return;
    const fallback = document.createElement('div');
    fallback.className = 'merchandise-image-placeholder';
    fallback.setAttribute('role', 'img');
    fallback.setAttribute('aria-label', `${image.alt || 'Merchandise'} image unavailable`);
    fallback.innerHTML = '<span aria-hidden="true">✦</span><small>Image unavailable</small>';
    button.replaceWith(fallback);
  }, { once: true }));
}

const merchandiseViewer = document.querySelector('#merchandiseImageViewer');
const merchandiseViewerImage = document.querySelector('#merchandiseViewerImage');
const merchandiseViewerClose = document.querySelector('#merchandiseViewerClose');
let merchandiseViewerTrigger = null;
let merchandiseViewerScrollY = 0;

function closeMerchandiseViewer({ fromHistory = false } = {}) {
  if (!merchandiseViewer?.open) return;
  if (!fromHistory && history.state?.merchandiseLightbox) {
    history.back();
    return;
  }
  merchandiseViewer.close();
}

function openMerchandiseViewer(trigger) {
  if (!merchandiseViewer || !merchandiseViewerImage) return;
  merchandiseViewerTrigger = trigger;
  merchandiseViewerScrollY = window.scrollY;
  merchandiseViewerImage.src = trigger.dataset.merchandiseImage || '';
  merchandiseViewerImage.alt = trigger.dataset.merchandiseAlt || 'Effortless Beauty merchandise';
  document.body.classList.add('image-viewer-open');
  history.pushState({ ...(history.state || {}), merchandiseLightbox: true }, '', location.href);
  merchandiseViewer.showModal();
  merchandiseViewerClose?.focus({ preventScroll: true });
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('.merchandise-image-button');
  if (trigger) openMerchandiseViewer(trigger);
});
merchandiseViewerClose?.addEventListener('click', () => closeMerchandiseViewer());
merchandiseViewer?.addEventListener('click', (event) => { if (event.target === merchandiseViewer) closeMerchandiseViewer(); });
merchandiseViewer?.addEventListener('cancel', (event) => { event.preventDefault(); closeMerchandiseViewer(); });
merchandiseViewer?.addEventListener('close', () => {
  document.body.classList.remove('image-viewer-open');
  merchandiseViewerImage?.removeAttribute('src');
  merchandiseViewerTrigger?.focus({ preventScroll: true });
  window.scrollTo({ top: merchandiseViewerScrollY, behavior: 'instant' });
  merchandiseViewerTrigger = null;
});
window.addEventListener('popstate', () => { if (merchandiseViewer?.open) closeMerchandiseViewer({ fromHistory: true }); });
async function loadPublishedSection(name) {
  const fallback = await loadJson(`content/${name}.json`);
  const completeMerchandise = (data) => {
    if (name !== 'merchandise' || !data) return data;
    const hasItems = ['categories', 'items', 'products'].some(key => Array.isArray(data[key]) && data[key].length);
    return hasItems ? data : {...fallback, ...data, categories: fallback.categories || []};
  };
  const preview = new URLSearchParams(location.search).get('preview');
  if (preview === name) {
    try { const data=JSON.parse(localStorage.getItem(`eb-section-preview:${name}`)||'null'); if(data){addPreviewBanner(`${name} preview only — these changes are not live.`);return completeMerchandise(data);} } catch(error){console.warn(error);}
  }
  try { const response=await fetch(`/.netlify/functions/site-section?section=${encodeURIComponent(name)}&live=${Date.now()}`,{cache:'no-store'}); if(response.ok){const result=await response.json();if(result?.data)return completeMerchandise(result.data);} } catch(error){console.warn(error);}
  return fallback;
}

async function loadEditableContent() {
  const files = ['site', 'aftercare', 'booking', 'contact', 'privacy', 'gallery', 'merchandise'];
  const results = await Promise.allSettled(files.map((name) => loadPublishedSection(name)));
  const content = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') content[files[index]] = result.value;
    else console.error(result.reason);
  });
  try {
    [content.homepage, content.treatments] = await Promise.all([loadPublishedHomepage(), loadPublishedTreatments()]);
  } catch (error) {
    console.error(error);
  }

  if (content.site) {
    document.title = content.site.pageTitle || document.title;
    const meta = document.querySelector('#metaDescription');
    if (meta && content.site.metaDescription) meta.content = content.site.metaDescription;
    setText('#footerText', content.site.footerText);
  }
  if (content.homepage) renderHomepage(content.homepage);
  if (content.treatments) renderTreatments(content.treatments);
  if (content.aftercare) renderAftercare(content.aftercare);
  if (content.gallery) renderGallery(content.gallery);
  if (content.merchandise) renderMerchandise(content.merchandise);
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
