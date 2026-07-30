const panels = {
  loading: document.querySelector('#loadingPanel'),
  login: document.querySelector('#loginPanel'),
  success: document.querySelector('#successPanel'),
  error: document.querySelector('#errorPanel')
};

const signedInAs = document.querySelector('#signedInAs');
const errorMessage = document.querySelector('#errorMessage');

function showPanel(name) {
  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== name;
  });
}

function clearCompletedIdentityCallback() {
  const isIdentityToken = /^#(?:invite_token|recovery_token|confirmation_token)=/.test(window.location.hash);
  const hasCallbackFlag = new URLSearchParams(window.location.search).has('identity_callback');

  if (isIdentityToken || hasCallbackFlag) {
    history.replaceState(null, document.title, '/manage/');
  }
}

function showSuccess(user) {
  signedInAs.textContent = user?.email ? `Signed in as ${user.email}` : '';
  showPanel('success');
  clearCompletedIdentityCallback();
}

function showLogin() {
  signedInAs.textContent = '';
  showPanel('login');
}

function showError(error) {
  const message = error?.message || error?.msg || 'The login service could not complete that request.';
  errorMessage.textContent = message;
  showPanel('error');
}

window.addEventListener('DOMContentLoaded', () => {
  const identity = window.netlifyIdentity;

  if (!identity) {
    showError(new Error('The login service could not load. Please refresh the page and try again.'));
    return;
  }

  identity.on('init', user => {
    if (user) showSuccess(user);
    else showLogin();
  });

  identity.on('login', user => {
    identity.close();
    showSuccess(user);
  });

  identity.on('logout', showLogin);
  identity.on('error', showError);

  // Netlify Identity reads invitation, recovery and confirmation tokens from
  // the current URL hash during initialisation. Do not redirect or clear the
  // hash before this call has completed.
  identity.init();

  document.querySelector('#loginButton').addEventListener('click', () => identity.open('login'));
  document.querySelector('#logoutButton').addEventListener('click', () => identity.logout());
  document.querySelector('#retryButton').addEventListener('click', showLogin);
});
