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
