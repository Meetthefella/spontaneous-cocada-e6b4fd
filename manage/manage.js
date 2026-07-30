import {
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  requestPasswordRecovery,
  updateUser
} from '@netlify/identity';

const panels = {
  loading: document.querySelector('#loadingPanel'),
  login: document.querySelector('#loginPanel'),
  invite: document.querySelector('#invitePanel'),
  recovery: document.querySelector('#recoveryPanel'),
  success: document.querySelector('#successPanel'),
  treatments: document.querySelector('#treatmentsPanel'),
  error: document.querySelector('#errorPanel')
};

const signedInAs = document.querySelector('#signedInAs');
const successMessage = document.querySelector('#successMessage');
const errorMessage = document.querySelector('#errorMessage');

let inviteToken = null;

function showPanel(name) {
  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== name;
  });
}

function clearIdentityCallbackUrl() {
  history.replaceState(null, document.title, '/manage/');
}

function showLogin() {
  signedInAs.textContent = '';
  successMessage.textContent = 'You are securely signed in.';
  showPanel('login');
}

function showSuccess(user, message = 'You are securely signed in.') {
  successMessage.textContent = message;
  signedInAs.textContent = user?.email || 'Authenticated user';
  showPanel('success');
}

function showError(error) {
  const message =
    error?.message ||
    error?.msg ||
    'The login service could not complete that request.';

  errorMessage.textContent = message;
  showPanel('error');
}

function passwordsMatch(password, confirmation) {
  if (password !== confirmation) {
    throw new Error('The two passwords do not match.');
  }

  if (password.length < 8) {
    throw new Error('Your password must contain at least 8 characters.');
  }
}
document
  .querySelector('#recoveryRequestButton')
  .addEventListener('click', async () => {
    const emailInput = document.querySelector('#loginEmail');
    const message = document.querySelector('#recoveryRequestMessage');
    const email = emailInput.value.trim();

    if (!email) {
      emailInput.focus();
      message.textContent =
        'Enter your email address first, then select Forgotten your password?';
      message.hidden = false;
      return;
    }

    try {
      message.textContent = 'Sending password reset email…';
      message.hidden = false;

      await requestPasswordRecovery(email);

      message.textContent =
        'Password reset email sent. Check your inbox and spam folder.';
    } catch (error) {
      message.textContent =
        error?.message ||
        'The password reset email could not be sent. Please try again.';
    }
  });
async function initialiseAuthentication() {
  const heading = document.querySelector('#loadingPanel h1');
  const message = document.querySelector('#loadingPanel p:last-child');

  try {
    heading.textContent = 'Step 1';
    message.textContent = 'Starting authentication…';

    const hasIdentityToken =
      /^#(?:invite_token|recovery_token|confirmation_token)=/.test(
        window.location.hash
      );

    let callback = null;

    if (hasIdentityToken) {
      heading.textContent = 'Step 2';
      message.textContent = 'Processing the email link…';

      callback = await handleAuthCallback();

      heading.textContent = 'Step 3';
      message.textContent = 'Identity link processed.';
    }

    if (callback) {
      switch (callback.type) {
        case 'invite':
          inviteToken = callback.token;
          showPanel('invite');
          return;

        case 'recovery':
          clearIdentityCallbackUrl();
          showPanel('recovery');
          return;

        case 'confirmation':
        case 'email_change':
        case 'oauth':
          clearIdentityCallbackUrl();
          showSuccess(callback.user);
          return;

        default:
          clearIdentityCallbackUrl();

          if (callback.user) {
            showSuccess(callback.user);
            return;
          }
      }
    }

    heading.textContent = 'Step 4';
    message.textContent = 'Checking for an existing login…';

    const user = await getUser();

    heading.textContent = 'Step 5';
    message.textContent = user
      ? 'Existing login found.'
      : 'No existing login found.';

    if (user) {
      showSuccess(user);
    } else {
      showLogin();
    }
  } catch (error) {
    showError(error);
  }
}

document.querySelector('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  showPanel('loading');

  const email = document.querySelector('#loginEmail').value.trim();
  const password = document.querySelector('#loginPassword').value;

  try {
    const user = await login(email, password);
    showSuccess(user);
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#inviteForm').addEventListener('submit', async event => {
  event.preventDefault();

  const password = document.querySelector('#invitePassword').value;
  const confirmation = document.querySelector('#invitePasswordConfirm').value;

  try {
    passwordsMatch(password, confirmation);

    if (!inviteToken) {
      throw new Error('The invitation token is missing or has expired. Request a new invitation and try again.');
    }

    showPanel('loading');
    const user = await acceptInvite(inviteToken, password);
    inviteToken = null;
    clearIdentityCallbackUrl();
    showSuccess(user, 'Your editor account is active and you are securely signed in.');
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#recoveryForm').addEventListener('submit', async event => {
  event.preventDefault();

  const password = document.querySelector('#recoveryPassword').value;
  const confirmation = document.querySelector('#recoveryPasswordConfirm').value;

  try {
    passwordsMatch(password, confirmation);
    showPanel('loading');
    const user = await updateUser({ password });
    showSuccess(user, 'Your password has been updated and you are securely signed in.');
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try {
    await logout();
    showLogin();
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#retryButton').addEventListener('click', () => {
  clearIdentityCallbackUrl();
  showLogin();
});

initialiseAuthentication();


const treatmentCategories = {
  signature: {
    title: 'Signature Treatments',
    description: 'Longer appointments with detailed treatment and follow-up information.'
  },
  beauty: {
    title: 'Beauty Treatments',
    description: 'Shorter beauty appointments, shown clearly with price and treatment time.'
  },
  'coming-soon': {
    title: 'Coming Soon',
    description: 'Treatments being prepared for a future launch.'
  }
};

const treatments = [
  {
    id: 'microblading',
    category: 'signature',
    title: 'Microblading',
    description: 'A precision brow treatment designed to create natural-looking hair strokes and enhance the brow shape.',
    price: '£100',
    time: '2 hours',
    visible: true,
    note: 'Detailed pricing, follow-up information, patch-test requirements and aftercare will be added during the editing checkpoint.'
  },
  {
    id: 'nano-brows',
    category: 'signature',
    title: 'Nano Brows',
    description: 'Fine machine-created strokes for soft, carefully defined brows with a natural finish.',
    price: '£100',
    time: 'To confirm',
    visible: true
  },
  {
    id: 'blending',
    category: 'signature',
    title: 'Blending',
    description: 'A tailored brow treatment that blends techniques to create balanced shape and definition.',
    price: '£100',
    time: 'To confirm',
    visible: true
  },
  {
    id: 'touch-up',
    category: 'signature',
    title: 'Touch-Up',
    description: 'A maintenance appointment used to refresh colour, shape and definition after an earlier treatment.',
    price: 'From £50',
    time: 'To confirm',
    visible: true
  },
  {
    id: 'removal-repair',
    category: 'signature',
    title: 'Removal / Repair',
    description: 'A consultation-led service for correcting, repairing or lightening previous brow work.',
    price: '£200',
    time: '3–4 hours',
    visible: true
  },
  {
    id: 'beauty-placeholder',
    category: 'beauty',
    title: 'Beauty treatments',
    description: 'Waxing, tinting, lash and brow, nail, piercing and other shorter services will be entered here once their final prices and times are confirmed.',
    price: 'Prices to confirm',
    time: 'Times to confirm',
    visible: false,
    note: 'This placeholder keeps the agreed section visible without publishing unconfirmed client information.'
  },
  {
    id: 'skin-peeling',
    category: 'coming-soon',
    title: 'Skin Peeling',
    description: 'A skin-resurfacing treatment intended to refresh the appearance and texture of the skin.',
    price: 'Coming soon',
    time: 'To be announced',
    visible: true
  },
  {
    id: 'vitamin-injections',
    category: 'coming-soon',
    title: 'Vitamin Injections',
    description: 'A planned treatment offering selected vitamin injections following appropriate consultation and suitability checks.',
    price: 'Coming soon',
    time: 'To be announced',
    visible: true
  },
  {
    id: 'threading',
    category: 'coming-soon',
    title: 'Threading',
    description: 'A precise hair-removal technique using twisted thread to shape and define areas such as the brows.',
    price: 'Coming soon',
    time: 'To be announced',
    visible: true
  },
  {
    id: 'cream-tanning',
    category: 'coming-soon',
    title: 'Cream Tanning',
    description: 'A carefully applied cream-tanning service designed to create an even, natural-looking glow.',
    price: 'Coming soon',
    time: 'To be announced',
    visible: true
  },
  {
    id: 'spray-tanning',
    category: 'coming-soon',
    title: 'Spray Tanning',
    description: 'A professionally applied spray tan for an even finish with colour selected to suit the client.',
    price: 'Coming soon',
    time: 'To be announced',
    visible: true
  }
];

const treatmentsBrowseView = document.querySelector('#treatmentsBrowseView');
const treatmentSummaryView = document.querySelector('#treatmentSummaryView');
const treatmentList = document.querySelector('#treatmentList');
const treatmentCategoryTitle = document.querySelector('#treatmentCategoryTitle');
const treatmentCategoryDescription = document.querySelector('#treatmentCategoryDescription');
let activeTreatmentCategory = 'signature';

function showTreatments() {
  showPanel('treatments');
  treatmentsBrowseView.hidden = false;
  treatmentSummaryView.hidden = true;
  renderTreatmentCategory(activeTreatmentCategory);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function showDashboard() {
  showPanel('success');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function renderTreatmentCategory(category) {
  activeTreatmentCategory = category;
  const categoryInfo = treatmentCategories[category];
  treatmentCategoryTitle.textContent = categoryInfo.title;
  treatmentCategoryDescription.textContent = categoryInfo.description;

  document.querySelectorAll('.treatment-tab').forEach(tab => {
    const selected = tab.dataset.category === category;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });

  const categoryTreatments = treatments.filter(treatment => treatment.category === category);
  treatmentList.replaceChildren(...categoryTreatments.map(createTreatmentRow));
}

function createTreatmentRow(treatment) {
  const button = document.createElement('button');
  button.className = 'treatment-row';
  button.type = 'button';
  button.dataset.treatmentId = treatment.id;

  const icon = document.createElement('span');
  icon.className = 'treatment-row-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = treatment.category === 'coming-soon' ? '◌' : treatment.category === 'beauty' ? '♡' : '✦';

  const copy = document.createElement('span');
  copy.className = 'treatment-row-copy';
  const title = document.createElement('strong');
  title.textContent = treatment.title;
  const details = document.createElement('small');
  details.textContent = `${treatment.price} · ${treatment.time}`;
  copy.append(title, details);

  const arrow = document.createElement('span');
  arrow.className = 'treatment-row-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '›';

  button.append(icon, copy, arrow);
  button.addEventListener('click', () => showTreatmentSummary(treatment.id));
  return button;
}

function showTreatmentSummary(treatmentId) {
  const treatment = treatments.find(item => item.id === treatmentId);
  if (!treatment) return;

  document.querySelector('#treatmentSummaryCategory').textContent = treatmentCategories[treatment.category].title;
  document.querySelector('#treatmentSummaryTitle').textContent = treatment.title;
  document.querySelector('#treatmentSummaryDescription').textContent = treatment.description;
  document.querySelector('#treatmentSummaryPrice').textContent = treatment.price;
  document.querySelector('#treatmentSummaryTime').textContent = treatment.time;
  document.querySelector('#treatmentSummaryVisibility').textContent = treatment.visible ? 'Visible' : 'Hidden placeholder';
  document.querySelector('#treatmentSummaryNote').textContent = treatment.note || '';
  document.querySelector('#treatmentSummaryImage').textContent = treatment.category === 'coming-soon' ? '◌' : treatment.category === 'beauty' ? '♡' : '✦';

  treatmentsBrowseView.hidden = true;
  treatmentSummaryView.hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

document.querySelector('#treatmentsButton').addEventListener('click', showTreatments);
document.querySelector('#backToDashboardButton').addEventListener('click', showDashboard);
document.querySelector('#backToTreatmentsButton').addEventListener('click', () => {
  treatmentSummaryView.hidden = true;
  treatmentsBrowseView.hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
});

document.querySelectorAll('.treatment-tab').forEach(tab => {
  tab.addEventListener('click', () => renderTreatmentCategory(tab.dataset.category));
});

document.querySelector('#treatmentsLogoutButton').addEventListener('click', async () => {
  try {
    await logout();
    showLogin();
  } catch (error) {
    showError(error);
  }
});
