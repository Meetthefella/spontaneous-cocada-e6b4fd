(function handIdentityTokenToManager() {
  const isIdentityToken = /^#(?:invite_token|recovery_token|confirmation_token)=/.test(window.location.hash);

  if (!isIdentityToken || window.location.pathname.startsWith('/manage')) return;

  // URL fragments never reach Netlify's server, so this browser-side hand-off
  // must preserve the complete hash exactly as supplied in the email link.
  window.location.replace(`/manage/${window.location.hash}`);
}());
