const nav = document.querySelector('.site-nav');
const menuToggle = document.querySelector('.menu-toggle');
const tabLinks = document.querySelectorAll('[data-tab-link]');
const panels = document.querySelectorAll('.tab-panel');
const cards = document.querySelectorAll('.card');
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

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

cards.forEach((card, index) => {
  card.style.transitionDelay = `${index * 80}ms`;
  observer.observe(card);
});

const monthLabel = document.querySelector('#monthLabel');
const calendarGrid = document.querySelector('#calendarGrid');
const prevMonth = document.querySelector('#prevMonth');
const nextMonth = document.querySelector('#nextMonth');
const selectedDateText = document.querySelector('#selectedDateText');
const timeSlots = document.querySelector('#timeSlots');
const bookingForm = document.querySelector('#bookingForm');
const bookingMessage = document.querySelector('#bookingMessage');

const slotTimes = ['09:30', '10:30', '11:30', '13:00', '14:00', '15:00'];
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
  const day = date.getDay();
  return day === 0; // Sunday closed for this starter.
}

function renderCalendar() {
  if (!calendarGrid || !monthLabel) return;
  calendarGrid.innerHTML = '';
  monthLabel.textContent = viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const mondayIndex = (firstDay.getDay() + 6) % 7;

  for (let i = 0; i < mondayIndex; i += 1) {
    const spacer = document.createElement('span');
    calendarGrid.appendChild(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const key = dateKey(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day-button';
    button.textContent = day;

    if (isPast(date) || isClosed(date)) {
      button.disabled = true;
    } else {
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

  slotTimes.forEach((time) => {
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
  const booking = {
    date: dateKey(selectedDate),
    time: selectedTime,
    name: data.get('name'),
    email: data.get('email'),
    phone: data.get('phone'),
    treatment: data.get('treatment'),
    createdAt: new Date().toISOString()
  };
  saveBooking(booking);
  bookingMessage.textContent = `Booking requested for ${selectedDateText.textContent} at ${selectedTime}.`;
  bookingForm.reset();
  selectedTime = null;
  renderCalendar();
  renderSlots();
});

const startTab = location.hash?.replace('#', '') || 'home';
if (document.getElementById(startTab)) showTab(startTab);
renderCalendar();
renderSlots();
