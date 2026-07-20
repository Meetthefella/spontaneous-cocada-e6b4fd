const nav = document.querySelector('.site-nav');
const menuToggle = document.querySelector('.menu-toggle');
const tabLinks = document.querySelectorAll('[data-tab-link]');
const panels = document.querySelectorAll('.tab-panel');
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

const contentState = {
  booking: { closedWeekdays: [0], slotTimes: ['09:30', '10:30', '11:30', '13:00', '14:00', '15:00'] },
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
  const select = document.querySelector('#bookingTreatment');
  if (select) select.innerHTML = contentState.treatments.map((item) =>
    `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`
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
  timeline.innerHTML = (data.stages || []).map((stage) =>
    `<article class="card ${escapeHtml(stage.className)}"><div class="stage"><img src="${escapeHtml(stage.image)}" alt="${escapeHtml(stage.alt)}" class="emoji ${escapeHtml(stage.imageClass)}" />${stageDecorations(stage.className)}</div><h2>${escapeHtml(stage.day)}</h2><p>${escapeHtml(stage.text)}</p></article>`
  ).join('');
  observeCards();
}

function renderBooking(data) {
  setText('#bookingEyebrow', data.eyebrow);
  setText('#bookingHeading', data.heading);
  setText('#bookingIntro', data.intro);
  contentState.booking = {
    closedWeekdays: Array.isArray(data.closedWeekdays)
      ? data.closedWeekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [0],
    slotTimes: Array.isArray(data.slotTimes) ? data.slotTimes : contentState.booking.slotTimes
  };
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
  renderCalendar();
  renderSlots();
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

const monthLabel = document.querySelector('#monthLabel');
const calendarGrid = document.querySelector('#calendarGrid');
const prevMonth = document.querySelector('#prevMonth');
const nextMonth = document.querySelector('#nextMonth');
const selectedDateText = document.querySelector('#selectedDateText');
const timeSlots = document.querySelector('#timeSlots');
const bookingForm = document.querySelector('#bookingForm');
const bookingMessage = document.querySelector('#bookingMessage');

let viewDate = new Date();
viewDate.setDate(1);
let selectedDate = null;
let selectedTime = null;

function getBookings() {
  return JSON.parse(localStorage.getItem('effortlessBeautyBookings') || '[]');
}

function saveBooking(booking) {
  const bookings = getBookings();
  bookings.push(booking);
  localStorage.setItem('effortlessBeautyBookings', JSON.stringify(bookings));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function isPast(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function isClosed(date) {
  return contentState.booking.closedWeekdays.includes(date.getDay());
}

function renderCalendar() {
  if (!calendarGrid || !monthLabel) return;
  calendarGrid.innerHTML = '';
  monthLabel.textContent = viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const mondayIndex = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < mondayIndex; i += 1) calendarGrid.appendChild(document.createElement('span'));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const key = dateKey(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day-button';
    button.textContent = day;
    if (isPast(date) || isClosed(date)) button.disabled = true;
    else {
      button.classList.add('available');
      button.addEventListener('click', () => {
        selectedDate = date;
        selectedTime = null;
        renderCalendar();
        renderSlots();
      });
    }
    if (selectedDate && key === dateKey(selectedDate)) button.classList.add('selected');
    calendarGrid.appendChild(button);
  }
}

function renderSlots() {
  if (!timeSlots || !selectedDateText) return;
  timeSlots.innerHTML = '';
  if (!selectedDate) {
    selectedDateText.textContent = 'Select a date from the calendar.';
    return;
  }
  const key = dateKey(selectedDate);
  selectedDateText.textContent = selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const bookings = getBookings().filter((booking) => booking.date === key);
  contentState.booking.slotTimes.forEach((time) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = time;
    const booked = bookings.some((booking) => booking.time === time);
    if (booked) {
      button.disabled = true;
      button.textContent = `${time} booked`;
    } else {
      button.addEventListener('click', () => {
        selectedTime = time;
        renderSlots();
      });
    }
    if (selectedTime === time) button.classList.add('selected');
    timeSlots.appendChild(button);
  });
}

prevMonth?.addEventListener('click', () => {
  viewDate.setMonth(viewDate.getMonth() - 1);
  renderCalendar();
});
nextMonth?.addEventListener('click', () => {
  viewDate.setMonth(viewDate.getMonth() + 1);
  renderCalendar();
});
bookingForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selectedDate || !selectedTime) {
    bookingMessage.textContent = 'Please choose a date and time first.';
    return;
  }
  const data = new FormData(bookingForm);
  saveBooking({
    date: dateKey(selectedDate),
    time: selectedTime,
    name: data.get('name'),
    email: data.get('email'),
    phone: data.get('phone'),
    treatment: data.get('treatment'),
    createdAt: new Date().toISOString()
  });
  bookingMessage.textContent = `Booking requested for ${selectedDateText.textContent} at ${selectedTime}.`;
  bookingForm.reset();
  selectedTime = null;
  renderCalendar();
  renderSlots();
});

const startTab = location.hash?.replace('#', '') || 'home';
if (document.getElementById(startTab)) showTab(startTab);
loadEditableContent();
