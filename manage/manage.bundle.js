var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// node_modules/gotrue-js/lib/index.js
var HTTPError = class extends Error {
  constructor(response) {
    super(response.statusText);
    this.name = "HTTPError";
    this.status = response.status;
  }
};
var TextHTTPError = class extends HTTPError {
  constructor(response, data) {
    super(response);
    this.name = "TextHTTPError";
    this.data = data;
  }
};
var JSONHTTPError = class extends HTTPError {
  constructor(response, json) {
    super(response);
    this.name = "JSONHTTPError";
    this.json = json;
  }
};
var API = class _API {
  constructor(apiURL, options) {
    this.apiURL = apiURL || "";
    this._sameOrigin = /^\/(?!\/)/.test(this.apiURL);
    this.defaultHeaders = options?.defaultHeaders || {};
  }
  headers(headers = {}) {
    return {
      ...this.defaultHeaders,
      "Content-Type": "application/json",
      ...headers
    };
  }
  static async parseJsonResponse(response) {
    const json = await response.json();
    if (!response.ok) {
      throw new JSONHTTPError(response, json);
    }
    return json;
  }
  async request(path, options = {}) {
    const headers = this.headers(options.headers || {});
    if (!options.body) {
      delete headers["Content-Type"];
    }
    const fetchOptions = {
      ...options,
      headers
    };
    if (this._sameOrigin) {
      fetchOptions.credentials = options.credentials || "same-origin";
    }
    const response = await fetch(this.apiURL + path, fetchOptions);
    const contentType = response.headers.get("Content-Type");
    if (contentType?.includes("json")) {
      return _API.parseJsonResponse(response);
    }
    const data = await response.text();
    if (!response.ok) {
      throw new TextHTTPError(response, data);
    }
    return data;
  }
};
var Admin = class {
  constructor(user) {
    this.user = user;
  }
  listUsers(aud) {
    return this.user._request("/admin/users", {
      method: "GET",
      audience: aud
    });
  }
  getUser(user) {
    return this.user._request(`/admin/users/${user.id}`);
  }
  updateUser(user, attributes = {}) {
    return this.user._request(`/admin/users/${user.id}`, {
      method: "PUT",
      body: JSON.stringify(attributes)
    });
  }
  createUser(email, password, attributes = {}) {
    attributes.email = email;
    attributes.password = password;
    return this.user._request("/admin/users", {
      method: "POST",
      body: JSON.stringify(attributes)
    });
  }
  deleteUser(user) {
    return this.user._request(`/admin/users/${user.id}`, {
      method: "DELETE"
    });
  }
};
var ExpiryMargin = 60 * 1e3;
var storageKey = "gotrue.user";
var refreshPromises = {};
var currentUser = null;
var forbiddenUpdateAttributes = { api: 1, token: 1, audience: 1, url: 1 };
var forbiddenSaveAttributes = { api: 1 };
var isBrowser = () => typeof window !== "undefined";
var storageListenerActive = false;
function ensureStorageListener() {
  if (!storageListenerActive && isBrowser()) {
    storageListenerActive = true;
    window.addEventListener("storage", (event) => {
      if (event.key === storageKey) {
        currentUser = null;
      }
    });
  }
}
var User = class _User {
  constructor(api, tokenResponse, audience) {
    this.token = null;
    this.api = api;
    this.url = api.apiURL;
    this.audience = audience;
    this._processTokenResponse(tokenResponse);
    currentUser = this;
    ensureStorageListener();
  }
  static removeSavedSession() {
    isBrowser() && localStorage.removeItem(storageKey);
  }
  static recoverSession(apiInstance) {
    ensureStorageListener();
    if (currentUser) {
      return currentUser;
    }
    const json = isBrowser() && localStorage.getItem(storageKey);
    if (json) {
      try {
        const data = JSON.parse(json);
        const { url, token, audience } = data;
        if (!url || !token) {
          return null;
        }
        const api = apiInstance || new API(url, {});
        return new _User(api, token, audience)._saveUserData(data, true);
      } catch (error) {
        console.error(new Error(`Gotrue-js: Error recovering session: ${error}`));
        return null;
      }
    }
    return null;
  }
  get admin() {
    return new Admin(this);
  }
  async update(attributes) {
    const response = await this._request("/user", {
      method: "PUT",
      body: JSON.stringify(attributes)
    });
    return this._saveUserData(response)._refreshSavedSession();
  }
  jwt(forceRefresh) {
    const token = this.tokenDetails();
    if (token === null || token === void 0) {
      return Promise.reject(new Error(`Gotrue-js: failed getting jwt access token`));
    }
    const { expires_at, refresh_token, access_token } = token;
    if (forceRefresh || expires_at - ExpiryMargin < Date.now()) {
      return this._refreshToken(refresh_token);
    }
    return Promise.resolve(access_token);
  }
  logout() {
    return this._request("/logout", { method: "POST" }).then(this.clearSession.bind(this)).catch(this.clearSession.bind(this));
  }
  _refreshToken(refresh_token) {
    const existingPromise = refreshPromises[refresh_token];
    if (existingPromise) {
      return existingPromise;
    }
    const refreshRequest = this.api.request("/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${refresh_token}`
    });
    const timeoutPromise = new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error("Token refresh timeout")), 3e4);
    });
    const promise = Promise.race([refreshRequest, timeoutPromise]).then((response) => {
      delete refreshPromises[refresh_token];
      this._processTokenResponse(response);
      this._refreshSavedSession();
      if (!this.token) {
        throw new Error("Gotrue-js: Token not set after refresh");
      }
      return this.token.access_token;
    }).catch((error) => {
      delete refreshPromises[refresh_token];
      this.clearSession();
      throw error;
    });
    refreshPromises[refresh_token] = promise;
    return promise;
  }
  async _request(path, options = {}) {
    options.headers = options.headers || {};
    const aud = options.audience || this.audience;
    if (aud) {
      options.headers["X-JWT-AUD"] = aud;
    }
    try {
      const token = await this.jwt();
      return await this.api.request(path, {
        headers: Object.assign(options.headers, {
          Authorization: `Bearer ${token}`
        }),
        ...options
      });
    } catch (error) {
      if (error instanceof JSONHTTPError && error.json) {
        if (error.json.msg) {
          error.message = error.json.msg;
        } else if (error.json.error) {
          error.message = `${error.json.error}: ${error.json.error_description}`;
        }
      }
      throw error;
    }
  }
  async getUserData() {
    const response = await this._request("/user");
    return this._saveUserData(response)._refreshSavedSession();
  }
  _saveUserData(attributes, fromStorage) {
    for (const key in attributes) {
      if (key in _User.prototype || key in forbiddenUpdateAttributes) {
        continue;
      }
      this[key] = attributes[key];
    }
    if (fromStorage) {
      this._fromStorage = true;
    }
    return this;
  }
  _processTokenResponse(tokenResponse) {
    this.token = tokenResponse;
    try {
      const claims = JSON.parse(urlBase64Decode(tokenResponse.access_token.split(".")[1]));
      this.token.expires_at = claims.exp * 1e3;
    } catch (error) {
      console.error(new Error(`Gotrue-js: Failed to parse tokenResponse claims: ${error}`));
    }
  }
  _refreshSavedSession() {
    if (isBrowser() && localStorage.getItem(storageKey)) {
      this._saveSession();
    }
    return this;
  }
  get _details() {
    const userCopy = {};
    for (const key in this) {
      if (key in _User.prototype || key in forbiddenSaveAttributes) {
        continue;
      }
      userCopy[key] = this[key];
    }
    return userCopy;
  }
  _saveSession() {
    isBrowser() && localStorage.setItem(storageKey, JSON.stringify(this._details));
    return this;
  }
  tokenDetails() {
    return this.token;
  }
  clearSession() {
    _User.removeSavedSession();
    this.token = null;
    currentUser = null;
  }
};
function base64Decode(base64) {
  if (typeof atob === "function") {
    return atob(base64);
  }
  return Buffer.from(base64, "base64").toString("binary");
}
function urlBase64Decode(str) {
  let output = str.replace(/-/g, "+").replace(/_/g, "/");
  switch (output.length % 4) {
    case 0:
      break;
    case 2:
      output += "==";
      break;
    case 3:
      output += "=";
      break;
    default:
      throw new Error("Illegal base64url string!");
  }
  const binaryString = base64Decode(output);
  try {
    const bytes = Uint8Array.from(binaryString, (char) => char.codePointAt(0) ?? 0);
    return new TextDecoder().decode(bytes);
  } catch {
    return binaryString;
  }
}
var HTTPRegexp = /^http:\/\//;
var defaultApiURL = `/.netlify/identity`;
var GoTrue = class {
  constructor({
    APIUrl = defaultApiURL,
    audience = "",
    setCookie = false,
    clientName = "gotrue-js"
  } = {}) {
    if (HTTPRegexp.test(APIUrl)) {
      console.warn(
        "Warning:\n\nDO NOT USE HTTP IN PRODUCTION FOR GOTRUE EVER!\nGoTrue REQUIRES HTTPS to work securely."
      );
    }
    if (audience) {
      this.audience = audience;
    }
    this.setCookie = setCookie;
    this.api = new API(APIUrl, { defaultHeaders: { "X-Nf-Client": clientName } });
  }
  async _request(path, options = {}) {
    options.headers = options.headers || {};
    const aud = options.audience || this.audience;
    if (aud) {
      options.headers["X-JWT-AUD"] = aud;
    }
    try {
      return await this.api.request(path, options);
    } catch (error) {
      if (error instanceof JSONHTTPError && error.json) {
        if (error.json.msg) {
          error.message = error.json.msg;
        } else if (error.json.error) {
          error.message = `${error.json.error}: ${error.json.error_description}`;
        }
      }
      throw error;
    }
  }
  settings() {
    return this._request("/settings");
  }
  signup(email, password, data) {
    return this._request("/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data })
    });
  }
  login(email, password, remember) {
    this._setRememberHeaders(remember);
    return this._request("/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=password&username=${encodeURIComponent(
        email
      )}&password=${encodeURIComponent(password)}`
    }).then((response) => {
      User.removeSavedSession();
      return this.createUser(response, remember);
    });
  }
  loginExternalUrl(provider) {
    return `${this.api.apiURL}/authorize?provider=${provider}`;
  }
  confirm(token, remember) {
    this._setRememberHeaders(remember);
    return this.verify("signup", token, remember);
  }
  requestPasswordRecovery(email) {
    return this._request("/recover", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  }
  recover(token, remember) {
    this._setRememberHeaders(remember);
    return this.verify("recovery", token, remember);
  }
  acceptInvite(token, password, remember) {
    this._setRememberHeaders(remember);
    return this._request("/verify", {
      method: "POST",
      body: JSON.stringify({ token, password, type: "signup" })
    }).then((response) => this.createUser(response, remember));
  }
  acceptInviteExternalUrl(provider, token) {
    return `${this.api.apiURL}/authorize?provider=${provider}&invite_token=${token}`;
  }
  createUser(tokenResponse, remember = false) {
    this._setRememberHeaders(remember);
    const user = new User(this.api, tokenResponse, this.audience || "");
    return user.getUserData().then((userData) => {
      if (remember) {
        userData._saveSession();
      }
      return userData;
    });
  }
  currentUser() {
    const user = User.recoverSession(this.api);
    user && this._setRememberHeaders(user._fromStorage);
    return user;
  }
  async validateCurrentSession() {
    const user = this.currentUser();
    if (!user) {
      return null;
    }
    try {
      return await user.getUserData();
    } catch {
      user.clearSession();
      return null;
    }
  }
  verify(type, token, remember) {
    this._setRememberHeaders(remember);
    return this._request("/verify", {
      method: "POST",
      body: JSON.stringify({ token, type })
    }).then((response) => this.createUser(response, remember));
  }
  _setRememberHeaders(remember) {
    if (this.setCookie) {
      this.api.defaultHeaders = this.api.defaultHeaders || {};
      this.api.defaultHeaders["X-Use-Cookie"] = remember ? "1" : "session";
    }
  }
};
if (typeof window !== "undefined") {
  window.GoTrue = GoTrue;
}

// node_modules/@netlify/identity/dist/main.js
var __require2 = /* @__PURE__ */ ((x) => typeof __require !== "undefined" ? __require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof __require !== "undefined" ? __require : a)[b]
}) : x)(function(x) {
  if (typeof __require !== "undefined") return __require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var AUTH_PROVIDERS = ["google", "github", "gitlab", "bitbucket", "facebook", "email"];
var AuthError = class _AuthError extends Error {
  constructor(message, status, options) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    if (options && "cause" in options) {
      this.cause = options.cause;
    }
  }
  static from(error) {
    if (error instanceof _AuthError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new _AuthError(message, void 0, { cause: error });
  }
};
var MissingIdentityError = class extends Error {
  constructor(message = "Netlify Identity is not available.") {
    super(message);
    this.name = "MissingIdentityError";
  }
};
var IDENTITY_PATH = "/.netlify/identity";
var goTrueClient = null;
var cachedApiUrl;
var warnedMissingUrl = false;
var isBrowser2 = () => typeof window !== "undefined" && typeof window.location !== "undefined";
var discoverApiUrl = () => {
  if (cachedApiUrl !== void 0) return cachedApiUrl;
  if (isBrowser2()) {
    cachedApiUrl = `${window.location.origin}${IDENTITY_PATH}`;
  } else {
    const identityContext = getIdentityContext();
    if (identityContext?.url) {
      cachedApiUrl = identityContext.url;
    } else if (globalThis.Netlify?.context?.url) {
      cachedApiUrl = new URL(IDENTITY_PATH, globalThis.Netlify.context.url).href;
    } else if (typeof process !== "undefined" && process.env?.URL) {
      cachedApiUrl = new URL(IDENTITY_PATH, process.env.URL).href;
    }
  }
  return cachedApiUrl ?? null;
};
var getGoTrueClient = () => {
  if (goTrueClient) return goTrueClient;
  const apiUrl = discoverApiUrl();
  if (!apiUrl) {
    if (!warnedMissingUrl) {
      console.warn(
        "@netlify/identity: Could not determine the Identity endpoint URL. Make sure your site has Netlify Identity enabled, or run your app with `netlify dev`."
      );
      warnedMissingUrl = true;
    }
    return null;
  }
  goTrueClient = new GoTrue({ APIUrl: apiUrl, setCookie: false });
  return goTrueClient;
};
var getClient = () => {
  const client = getGoTrueClient();
  if (!client) throw new MissingIdentityError();
  return client;
};
var getIdentityContext = () => {
  const identityContext = globalThis.netlifyIdentityContext;
  if (identityContext?.url) {
    return {
      url: identityContext.url,
      token: identityContext.token
    };
  }
  if (globalThis.Netlify?.context?.url) {
    return { url: new URL(IDENTITY_PATH, globalThis.Netlify.context.url).href };
  }
  const siteUrl = typeof process !== "undefined" ? process.env?.URL : void 0;
  if (siteUrl) {
    return { url: new URL(IDENTITY_PATH, siteUrl).href };
  }
  return null;
};
var NF_JWT_COOKIE = "nf_jwt";
var NF_REFRESH_COOKIE = "nf_refresh";
var getCookie = (name) => {
  if (typeof document === "undefined") return null;
  const match = new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`).exec(document.cookie);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};
var setAuthCookies = (cookies, accessToken, refreshToken) => {
  cookies.set({
    name: NF_JWT_COOKIE,
    value: accessToken,
    httpOnly: false,
    secure: true,
    path: "/",
    sameSite: "Lax"
  });
  if (refreshToken) {
    cookies.set({
      name: NF_REFRESH_COOKIE,
      value: refreshToken,
      httpOnly: false,
      secure: true,
      path: "/",
      sameSite: "Lax"
    });
  }
};
var deleteAuthCookies = (cookies) => {
  cookies.delete(NF_JWT_COOKIE);
  cookies.delete(NF_REFRESH_COOKIE);
};
var setBrowserAuthCookies = (accessToken, refreshToken) => {
  if (typeof document === "undefined") return;
  document.cookie = `${NF_JWT_COOKIE}=${encodeURIComponent(accessToken)}; path=/; secure; samesite=lax`;
  if (refreshToken) {
    document.cookie = `${NF_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; path=/; secure; samesite=lax`;
  }
};
var deleteBrowserAuthCookies = () => {
  if (typeof document === "undefined") return;
  document.cookie = `${NF_JWT_COOKIE}=; path=/; secure; samesite=lax; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  document.cookie = `${NF_REFRESH_COOKIE}=; path=/; secure; samesite=lax; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};
var getServerCookie = (name) => {
  const cookies = globalThis.Netlify?.context?.cookies;
  if (!cookies || typeof cookies.get !== "function") return null;
  return cookies.get(name) ?? null;
};
var nextHeadersFn;
var triggerNextjsDynamic = () => {
  if (nextHeadersFn === null) return;
  if (nextHeadersFn === void 0) {
    try {
      if (typeof __require2 === "undefined") {
        nextHeadersFn = null;
        return;
      }
      const mod = __require2("next/headers");
      nextHeadersFn = mod.headers;
    } catch {
      nextHeadersFn = null;
      return;
    }
  }
  const fn = nextHeadersFn;
  if (!fn) return;
  try {
    fn();
  } catch (e) {
    if (e instanceof Error && ("digest" in e || /bail\s*out.*prerende/i.test(e.message))) {
      throw e;
    }
  }
};
var DEFAULT_TIMEOUT_MS = 5e3;
var fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const pathname = new URL(url).pathname;
      throw new AuthError(`Identity request to ${pathname} timed out after ${String(timeoutMs)}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
var AUTH_EVENTS = {
  LOGIN: "login",
  LOGOUT: "logout",
  TOKEN_REFRESH: "token_refresh",
  USER_UPDATED: "user_updated",
  RECOVERY: "recovery"
};
var listeners = /* @__PURE__ */ new Set();
var emitAuthEvent = (event, user) => {
  for (const listener of listeners) {
    try {
      listener(event, user);
    } catch {
    }
  }
};
var REFRESH_MARGIN_S = 60;
var refreshTimer = null;
var startTokenRefresh = () => {
  if (!isBrowser2()) return;
  stopTokenRefresh();
  const client = getGoTrueClient();
  const user = client?.currentUser();
  if (!user) return;
  const token = user.tokenDetails();
  if (!token?.expires_at) return;
  const nowS = Math.floor(Date.now() / 1e3);
  const expiresAtS = typeof token.expires_at === "number" && token.expires_at > 1e12 ? Math.floor(token.expires_at / 1e3) : token.expires_at;
  const delayMs = Math.max(0, expiresAtS - nowS - REFRESH_MARGIN_S) * 1e3;
  refreshTimer = setTimeout(() => {
    void (async () => {
      try {
        const freshJwt = await user.jwt(true);
        const freshDetails = user.tokenDetails();
        setBrowserAuthCookies(freshJwt, freshDetails?.refresh_token);
        emitAuthEvent(AUTH_EVENTS.TOKEN_REFRESH, toUser(user));
        startTokenRefresh();
      } catch {
        stopTokenRefresh();
      }
    })();
  }, delayMs);
};
var stopTokenRefresh = () => {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
};
var getCookies = () => {
  const cookies = globalThis.Netlify?.context?.cookies;
  if (!cookies) {
    throw new AuthError("Server-side auth requires Netlify Functions runtime");
  }
  return cookies;
};
var getServerIdentityUrl = () => {
  const ctx = getIdentityContext();
  if (!ctx?.url) {
    throw new AuthError("Could not determine the Identity endpoint URL on the server");
  }
  return ctx.url;
};
var persistSession = true;
var login = async (email, password) => {
  if (!isBrowser2()) {
    const identityUrl = getServerIdentityUrl();
    const cookies = getCookies();
    const body = new URLSearchParams({
      grant_type: "password",
      username: email,
      password
    });
    let res;
    try {
      res = await fetchWithTimeout(`${identityUrl}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
    } catch (error) {
      throw AuthError.from(error);
    }
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new AuthError(
        errorBody.msg ?? errorBody.error_description ?? `Login failed (${String(res.status)})`,
        res.status
      );
    }
    const data = await res.json();
    const accessToken = data.access_token;
    let userRes;
    try {
      userRes = await fetchWithTimeout(`${identityUrl}/user`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch (error) {
      throw AuthError.from(error);
    }
    if (!userRes.ok) {
      const errorBody = await userRes.json().catch(() => ({}));
      throw new AuthError(errorBody.msg ?? `Failed to fetch user data (${String(userRes.status)})`, userRes.status);
    }
    const userData = await userRes.json();
    const user = toUser(userData);
    setAuthCookies(cookies, accessToken, data.refresh_token);
    return user;
  }
  const client = getClient();
  try {
    const gotrueUser = await client.login(email, password, persistSession);
    const jwt = await gotrueUser.jwt();
    setBrowserAuthCookies(jwt, gotrueUser.tokenDetails()?.refresh_token);
    const user = toUser(gotrueUser);
    startTokenRefresh();
    emitAuthEvent(AUTH_EVENTS.LOGIN, user);
    return user;
  } catch (error) {
    throw AuthError.from(error);
  }
};
var logout = async () => {
  if (!isBrowser2()) {
    const identityUrl = getServerIdentityUrl();
    const cookies = getCookies();
    const jwt = cookies.get(NF_JWT_COOKIE);
    if (jwt) {
      try {
        await fetchWithTimeout(`${identityUrl}/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}` }
        });
      } catch {
      }
    }
    deleteAuthCookies(cookies);
    return;
  }
  const client = getClient();
  try {
    const currentUser2 = client.currentUser();
    if (currentUser2) {
      await currentUser2.logout();
    }
    deleteBrowserAuthCookies();
    stopTokenRefresh();
    emitAuthEvent(AUTH_EVENTS.LOGOUT, null);
  } catch (error) {
    throw AuthError.from(error);
  }
};
var handleAuthCallback = async () => {
  if (!isBrowser2()) return null;
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const client = getClient();
  const params = new URLSearchParams(hash);
  try {
    const accessToken = params.get("access_token");
    if (accessToken) return await handleOAuthCallback(client, params, accessToken);
    const confirmationToken = params.get("confirmation_token");
    if (confirmationToken) return await handleConfirmationCallback(client, confirmationToken);
    const recoveryToken = params.get("recovery_token");
    if (recoveryToken) return await handleRecoveryCallback(client, recoveryToken);
    const inviteToken2 = params.get("invite_token");
    if (inviteToken2) return handleInviteCallback(inviteToken2);
    const emailChangeToken = params.get("email_change_token");
    if (emailChangeToken) return await handleEmailChangeCallback(client, emailChangeToken);
    return null;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw AuthError.from(error);
  }
};
var handleOAuthCallback = async (client, params, accessToken) => {
  const refreshToken = params.get("refresh_token") ?? "";
  const expiresIn = parseInt(params.get("expires_in") ?? "", 10);
  const expiresAt = parseInt(params.get("expires_at") ?? "", 10);
  const gotrueUser = await client.createUser(
    {
      access_token: accessToken,
      token_type: params.get("token_type") ?? "bearer",
      expires_in: isFinite(expiresIn) ? expiresIn : 3600,
      expires_at: isFinite(expiresAt) ? expiresAt : Math.floor(Date.now() / 1e3) + 3600,
      refresh_token: refreshToken
    },
    persistSession
  );
  setBrowserAuthCookies(accessToken, refreshToken || void 0);
  const user = toUser(gotrueUser);
  startTokenRefresh();
  clearHash();
  emitAuthEvent(AUTH_EVENTS.LOGIN, user);
  return { type: "oauth", user };
};
var handleConfirmationCallback = async (client, token) => {
  const gotrueUser = await client.confirm(token, persistSession);
  const jwt = await gotrueUser.jwt();
  setBrowserAuthCookies(jwt, gotrueUser.tokenDetails()?.refresh_token);
  const user = toUser(gotrueUser);
  startTokenRefresh();
  clearHash();
  emitAuthEvent(AUTH_EVENTS.LOGIN, user);
  return { type: "confirmation", user };
};
var handleRecoveryCallback = async (client, token) => {
  const gotrueUser = await client.recover(token, persistSession);
  const jwt = await gotrueUser.jwt();
  setBrowserAuthCookies(jwt, gotrueUser.tokenDetails()?.refresh_token);
  const user = toUser(gotrueUser);
  startTokenRefresh();
  clearHash();
  emitAuthEvent(AUTH_EVENTS.RECOVERY, user);
  return { type: "recovery", user };
};
var handleInviteCallback = (token) => {
  clearHash();
  return { type: "invite", user: null, token };
};
var handleEmailChangeCallback = async (client, emailChangeToken) => {
  const currentUser2 = client.currentUser();
  if (!currentUser2) {
    throw new AuthError("Email change verification requires an active browser session");
  }
  const jwt = await currentUser2.jwt();
  const identityUrl = `${window.location.origin}${IDENTITY_PATH}`;
  const emailChangeRes = await fetch(`${identityUrl}/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`
    },
    body: JSON.stringify({ email_change_token: emailChangeToken })
  });
  if (!emailChangeRes.ok) {
    const errorBody = await emailChangeRes.json().catch(() => ({}));
    throw new AuthError(
      errorBody.msg ?? `Email change verification failed (${String(emailChangeRes.status)})`,
      emailChangeRes.status
    );
  }
  const emailChangeData = await emailChangeRes.json();
  const user = toUser(emailChangeData);
  clearHash();
  emitAuthEvent(AUTH_EVENTS.USER_UPDATED, user);
  return { type: "email_change", user };
};
var clearHash = () => {
  history.replaceState(null, "", window.location.pathname + window.location.search);
};
var hydrateSession = async () => {
  if (!isBrowser2()) return null;
  const client = getClient();
  const currentUser2 = client.currentUser();
  if (currentUser2) {
    startTokenRefresh();
    return toUser(currentUser2);
  }
  const accessToken = getCookie(NF_JWT_COOKIE);
  if (!accessToken) return null;
  const refreshToken = getCookie(NF_REFRESH_COOKIE) ?? "";
  const decoded = decodeJwtPayload(accessToken);
  const expiresAt = decoded?.exp ?? Math.floor(Date.now() / 1e3) + 3600;
  const expiresIn = Math.max(0, expiresAt - Math.floor(Date.now() / 1e3));
  let gotrueUser;
  try {
    gotrueUser = await client.createUser(
      {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: expiresIn,
        expires_at: expiresAt,
        refresh_token: refreshToken
      },
      persistSession
    );
  } catch {
    deleteBrowserAuthCookies();
    return null;
  }
  const user = toUser(gotrueUser);
  startTokenRefresh();
  emitAuthEvent(AUTH_EVENTS.LOGIN, user);
  return user;
};
var toAuthProvider = (value) => typeof value === "string" && AUTH_PROVIDERS.includes(value) ? value : void 0;
var toOptionalString = (value) => typeof value === "string" && value !== "" ? value : void 0;
var toRoles = (appMeta) => {
  const roles = appMeta.roles;
  if (Array.isArray(roles) && roles.every((r) => typeof r === "string")) {
    return roles;
  }
  return void 0;
};
var toUser = (userData) => {
  const userMeta = userData.user_metadata ?? {};
  const appMeta = userData.app_metadata ?? {};
  const name = userMeta.full_name ?? userMeta.name;
  const pictureUrl = userMeta.avatar_url;
  return {
    id: userData.id,
    email: userData.email,
    confirmedAt: toOptionalString(userData.confirmed_at),
    createdAt: userData.created_at,
    updatedAt: userData.updated_at,
    role: toOptionalString(userData.role),
    provider: toAuthProvider(appMeta.provider),
    name: typeof name === "string" ? name : void 0,
    pictureUrl: typeof pictureUrl === "string" ? pictureUrl : void 0,
    roles: toRoles(appMeta),
    invitedAt: toOptionalString(userData.invited_at),
    confirmationSentAt: toOptionalString(userData.confirmation_sent_at),
    recoverySentAt: toOptionalString(userData.recovery_sent_at),
    pendingEmail: toOptionalString(userData.new_email),
    emailChangeSentAt: toOptionalString(userData.email_change_sent_at),
    lastSignInAt: toOptionalString(userData.last_sign_in_at),
    userMetadata: userMeta,
    appMetadata: appMeta
  };
};
var claimsToUser = (claims) => {
  const appMeta = claims.app_metadata ?? {};
  const userMeta = claims.user_metadata ?? {};
  const name = userMeta.full_name ?? userMeta.name;
  const pictureUrl = userMeta.avatar_url;
  return {
    id: claims.sub ?? "",
    email: claims.email,
    provider: toAuthProvider(appMeta.provider),
    name: typeof name === "string" ? name : void 0,
    pictureUrl: typeof pictureUrl === "string" ? pictureUrl : void 0,
    roles: toRoles(appMeta),
    userMetadata: userMeta,
    appMetadata: appMeta
  };
};
var decodeJwtPayload = (token) => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payload);
  } catch {
    return null;
  }
};
var fetchFullUser = async (identityUrl, jwt) => {
  try {
    const res = await fetchWithTimeout(`${identityUrl}/user`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    if (!res.ok) return null;
    const userData = await res.json();
    return toUser(userData);
  } catch {
    return null;
  }
};
var resolveIdentityUrl = () => {
  const identityContext = getIdentityContext();
  if (identityContext?.url) return identityContext.url;
  if (globalThis.Netlify?.context?.url) {
    return new URL(IDENTITY_PATH, globalThis.Netlify.context.url).href;
  }
  const siteUrl = typeof process !== "undefined" ? process.env?.URL : void 0;
  if (siteUrl) {
    return new URL(IDENTITY_PATH, siteUrl).href;
  }
  return null;
};
var getUser = async () => {
  if (isBrowser2()) {
    const client = getGoTrueClient();
    const currentUser2 = client?.currentUser() ?? null;
    if (currentUser2) {
      const jwt2 = getCookie(NF_JWT_COOKIE);
      if (!jwt2) {
        try {
          currentUser2.clearSession();
        } catch {
        }
        return null;
      }
      startTokenRefresh();
      return toUser(currentUser2);
    }
    const jwt = getCookie(NF_JWT_COOKIE);
    if (!jwt) return null;
    const claims2 = decodeJwtPayload(jwt);
    if (!claims2) return null;
    const hydrated = await hydrateSession();
    return hydrated ?? null;
  }
  triggerNextjsDynamic();
  const identityContext = globalThis.netlifyIdentityContext;
  const serverJwt = identityContext?.token ?? getServerCookie(NF_JWT_COOKIE);
  if (serverJwt) {
    const identityUrl = resolveIdentityUrl();
    if (identityUrl) {
      const fullUser = await fetchFullUser(identityUrl, serverJwt);
      if (fullUser) return fullUser;
    }
  }
  const claims = identityContext?.user ?? null;
  return claims ? claimsToUser(claims) : null;
};
var resolveCurrentUser = async () => {
  const client = getClient();
  let currentUser2 = client.currentUser();
  if (!currentUser2 && isBrowser2()) {
    try {
      await hydrateSession();
    } catch {
    }
    currentUser2 = client.currentUser();
  }
  if (!currentUser2) throw new AuthError("No user is currently logged in");
  return currentUser2;
};
var requestPasswordRecovery = async (email) => {
  const client = getClient();
  try {
    await client.requestPasswordRecovery(email);
  } catch (error) {
    throw AuthError.from(error);
  }
};
var acceptInvite = async (token, password) => {
  const client = getClient();
  try {
    const gotrueUser = await client.acceptInvite(token, password, persistSession);
    const user = toUser(gotrueUser);
    startTokenRefresh();
    emitAuthEvent(AUTH_EVENTS.LOGIN, user);
    return user;
  } catch (error) {
    throw AuthError.from(error);
  }
};
var updateUser = async (updates) => {
  const currentUser2 = await resolveCurrentUser();
  try {
    const updatedUser = await currentUser2.update(updates);
    const user = toUser(updatedUser);
    emitAuthEvent(AUTH_EVENTS.USER_UPDATED, user);
    return user;
  } catch (error) {
    throw AuthError.from(error);
  }
};

// manage/manage.js
const panels = Object.fromEntries(['loading','login','invite','recovery','success','error'].map(name => [name, document.querySelector(`#${name}Panel`)]));
const signedInAs = document.querySelector('#signedInAs');
const successMessage = document.querySelector('#successMessage');
const errorMessage = document.querySelector('#errorMessage');
let inviteToken = null;
let activeCategory = 'signature';
let activeTreatmentId = null;
let editorStep = 0;
let editorDirty = false;
let pendingLeaveTarget = null;
let sessionImageUrl = '';
let draftTimer = null;

const treatments = [
  {id:'microblading',category:'signature',title:'Microblading',shortDescription:'Natural-looking brow enhancement using fine, hair-like strokes.',fullDescription:'Microblading is designed to create fuller, naturally defined brows using carefully placed hair-like strokes.',price:'£100',duration:'2 hours',detailedPricing:'Initial treatment: £100',followUpPricing:'Second session: £100\nThird session: £75\nFourth session: Free',patchTest:true,visible:true},
  {id:'nano-brows',category:'signature',title:'Nano Brows',shortDescription:'Fine machine-created strokes for softly defined brows.',fullDescription:'Nano brows use a precision machine technique to create delicate, realistic-looking strokes.',price:'£100',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'blending',category:'signature',title:'Blending',shortDescription:'A blended brow treatment tailored to the desired finish.',fullDescription:'Blending combines techniques to create a balanced, softly defined result.',price:'£100',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'touch-up',category:'signature',title:'Touch-Up',shortDescription:'A refresh treatment to maintain colour and definition.',fullDescription:'Touch-up appointments refresh previous work and maintain the desired shape and colour.',price:'£50–£100',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  {id:'removal-repair',category:'signature',title:'Removal / Repair',shortDescription:'Specialist correction or lightening of previous work.',fullDescription:'A consultation-led service for correcting or lightening existing work.',price:'£200',duration:'3–4 hours',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'waxing',category:'beauty',title:'Waxing',shortDescription:'A selection of quick waxing treatments.',fullDescription:'Choose from a range of waxing services. Individual areas and prices can be listed in the detailed pricing.',price:'From £5',duration:'Varies',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  {id:'lash-brow',category:'beauty',title:'Lash & Brow',shortDescription:'A combined lash and brow treatment.',fullDescription:'A convenient combined appointment for lashes and brows.',price:'£20',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'tinting',category:'beauty',title:'Tinting',shortDescription:'Enhance the appearance of brows or lashes with tint.',fullDescription:'Tinting adds colour and definition for a polished, low-maintenance finish.',price:'£10',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'nail-art',category:'beauty',title:'Nail Art',shortDescription:'Creative nail designs tailored to your chosen style.',fullDescription:'Choose from simple accents through to detailed custom nail art.',price:'£10–£65',duration:'Varies',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  {id:'ear-piercing',category:'beauty',title:'Ear Piercing',shortDescription:'A straightforward ear-piercing appointment.',fullDescription:'Ear piercing provided in a calm and welcoming setting.',price:'£10',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  {id:'shellac-nails',category:'beauty',title:'Shellac Nails',shortDescription:'Long-lasting, glossy colour for natural nails.',fullDescription:'Shellac provides a durable and polished finish for natural nails.',price:'£25',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  ...[
    ['skin-peeling','Skin Peeling','A skin-renewal treatment designed to improve texture and radiance.'],
    ['vitamin-injections','Vitamin Injections','Targeted vitamin treatments, subject to consultation and suitability.'],
    ['threading','Threading','Precise hair removal using a traditional threading technique.'],
    ['cream-tanning','Cream Tanning','An even, sun-kissed finish applied using a professional tanning cream.'],
    ['spray-tanning','Spray Tanning','A professionally applied tan for an even, natural-looking glow.']
  ].map(([id,title,shortDescription]) => ({id,category:'coming-soon',title,shortDescription,fullDescription:shortDescription,price:'Coming soon',duration:'Coming soon',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true}))
];

const views = ['dashboardView','treatmentsView','treatmentSummaryView','editorView','previewView'];
const DRAFT_VERSION = 1;
const draftKey = id => `eb-treatment-draft:${id}`;
const clone = value => JSON.parse(JSON.stringify(value));
const findTreatment = id => treatments.find(item => item.id === id);

function showPanel(name){Object.entries(panels).forEach(([key,panel])=>{panel.hidden=key!==name;});}
function showAppView(id){views.forEach(viewId=>{document.querySelector(`#${viewId}`).hidden=viewId!==id;});window.scrollTo({top:0,behavior:'instant'});}
function clearIdentityCallbackUrl(){history.replaceState(null,document.title,'/manage/');}
function showLogin(){signedInAs.textContent='';successMessage.textContent='You are securely signed in.';showPanel('login');}
function showSuccess(user,message='Manage your Effortless Beauty website from one place.'){successMessage.textContent=message;signedInAs.textContent=user?.email||'Authenticated user';showPanel('success');showAppView('dashboardView');}
function showError(error){errorMessage.textContent=error?.message||error?.msg||'The login service could not complete that request.';showPanel('error');}
function passwordsMatch(password,confirmation){if(password!==confirmation)throw new Error('The two passwords do not match.');if(password.length<8)throw new Error('Your password must contain at least 8 characters.');}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
function nl2br(value=''){return escapeHtml(value).replace(/\n/g,'<br>');}

function readDraft(id){
  try{
    const stored=JSON.parse(localStorage.getItem(draftKey(id))||'null');
    if(!stored)return null;
    if(stored.record)return stored;
    const {savedAt,...record}=stored;
    return {version:DRAFT_VERSION,treatmentId:id,savedAt:savedAt||new Date().toISOString(),record};
  }catch{return null;}
}
function writeDraft(record){
  const savedAt=new Date().toISOString();
  const payload={version:DRAFT_VERSION,treatmentId:record.id,savedAt,record:clone(record)};
  localStorage.setItem(draftKey(record.id),JSON.stringify(payload));
  setDraftStatus(`Draft saved · ${relativeTime(savedAt)}`);
  renderTreatments();
  return payload;
}
function removeDraft(id){localStorage.removeItem(draftKey(id));renderTreatments();}
function relativeTime(value){
  const elapsed=Math.max(0,Date.now()-new Date(value).getTime());
  const seconds=Math.floor(elapsed/1000);
  if(seconds<10)return 'Just now';
  if(seconds<60)return `${seconds} seconds ago`;
  const minutes=Math.floor(seconds/60);
  if(minutes===1)return '1 minute ago';
  if(minutes<60)return `${minutes} minutes ago`;
  const hours=Math.floor(minutes/60);
  if(hours===1)return '1 hour ago';
  if(hours<24)return `${hours} hours ago`;
  return new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}
function setDraftStatus(text){document.querySelector('#draftStatus').textContent=text;}
function currentRecord(){
  const base=clone(findTreatment(activeTreatmentId));
  const form=new FormData(document.querySelector('#treatmentEditorForm'));
  return {...base,title:form.get('title')?.trim()||'',shortDescription:form.get('shortDescription')?.trim()||'',price:form.get('price')?.trim()||'',duration:form.get('duration')?.trim()||'',fullDescription:form.get('fullDescription')?.trim()||'',detailedPricing:form.get('detailedPricing')?.trim()||'',followUpPricing:form.get('followUpPricing')?.trim()||'',patchTest:document.querySelector('#editPatchTest').checked,visible:document.querySelector('#editVisible').checked};
}
function flushDraft(){
  if(!activeTreatmentId||document.querySelector('#editorView').hidden)return null;
  clearTimeout(draftTimer);
  draftTimer=null;
  return writeDraft(currentRecord());
}

function renderTreatments(){
  document.querySelectorAll('.treatment-tabs [role="tab"]').forEach(btn=>btn.setAttribute('aria-selected',String(btn.dataset.category===activeCategory)));
  const items=treatments.filter(item=>item.category===activeCategory);
  document.querySelector('#treatmentList').innerHTML=items.map(item=>{
    const draft=readDraft(item.id);
    const draftLabel=draft?`<em data-draft-time="${escapeHtml(draft.savedAt)}">Draft · ${escapeHtml(relativeTime(draft.savedAt))}</em>`:'';
    return `<button class="treatment-row" type="button" data-treatment-id="${item.id}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.price)} · ${escapeHtml(item.duration)}</small></span><span class="row-meta">${draftLabel}<b aria-hidden="true">›</b></span></button>`;
  }).join('');
}
function refreshDraftTimes(){
  document.querySelectorAll('[data-draft-time]').forEach(el=>{el.textContent=`Draft · ${relativeTime(el.dataset.draftTime)}`;});
  const draft=activeTreatmentId&&readDraft(activeTreatmentId);
  if(draft&&!document.querySelector('#editorView').hidden)setDraftStatus(`Draft saved · ${relativeTime(draft.savedAt)}`);
}
function summaryMarkup(record,{preview=false}={}){
  return `<div class="summary-hero"><div class="summary-image-placeholder" aria-hidden="true">${record.imageData?`<img src="${record.imageData}" alt="">`:'✦'}</div><p class="eyebrow">${escapeHtml(record.category.replace('-', ' '))}</p><h1>${escapeHtml(record.title)}</h1><p class="summary-intro">${escapeHtml(record.shortDescription)}</p><div class="summary-facts"><span><small>Price</small><strong>${escapeHtml(record.price||'Not set')}</strong></span><span><small>Treatment time</small><strong>${escapeHtml(record.duration||'Not set')}</strong></span></div></div><div class="summary-details"><h2>About this treatment</h2><p>${nl2br(record.fullDescription||'No full description has been added yet.')}</p>${record.detailedPricing?`<h3>Detailed pricing</h3><p>${nl2br(record.detailedPricing)}</p>`:''}${record.followUpPricing?`<h3>Follow-up pricing</h3><p>${nl2br(record.followUpPricing)}</p>`:''}<dl><div><dt>Patch test</dt><dd>${record.patchTest?'Required':'Not required'}</dd></div><div><dt>Website visibility</dt><dd>${record.visible?'Visible':'Hidden'}</dd></div></dl>${preview?'<p class="preview-note">This is a draft preview only. Nothing has been published.</p>':''}</div>`;
}
function openSummary(id){activeTreatmentId=id;document.querySelector('#treatmentSummary').innerHTML=summaryMarkup(findTreatment(id));showAppView('treatmentSummaryView');history.pushState({view:'summary'},'',`#treatment-${id}`);}
function populateEditor(record){
  document.querySelector('#editTitle').value=record.title||'';
  document.querySelector('#editShortDescription').value=record.shortDescription||'';
  document.querySelector('#editPrice').value=record.price||'';
  document.querySelector('#editDuration').value=record.duration||'';
  document.querySelector('#editFullDescription').value=record.fullDescription||'';
  document.querySelector('#editDetailedPricing').value=record.detailedPricing||'';
  document.querySelector('#editFollowUpPricing').value=record.followUpPricing||'';
  document.querySelector('#editPatchTest').checked=Boolean(record.patchTest);
  document.querySelector('#editVisible').checked=Boolean(record.visible);
  const img=document.querySelector('#editorImagePreview');img.hidden=true;img.removeAttribute('src');
  editorStep=0;sessionImageUrl='';renderEditorStep();showAppView('editorView');history.pushState({view:'editor'},'',`#edit-${activeTreatmentId}`);
}
function startEditor(useDraft=false){
  const draft=readDraft(activeTreatmentId);
  const record=useDraft&&draft?clone(draft.record):clone(findTreatment(activeTreatmentId));
  editorDirty=Boolean(useDraft&&draft);
  populateEditor(record);
  setDraftStatus(draft&&useDraft?`Draft saved · ${relativeTime(draft.savedAt)}`:'Your changes will save automatically');
}
function requestEditor(){
  const draft=readDraft(activeTreatmentId);
  if(!draft){startEditor(false);return;}
  const base=findTreatment(activeTreatmentId);
  document.querySelector('#resumeDraftMessage').textContent=`A draft for ${base.title} was saved ${relativeTime(draft.savedAt)}.`;
  document.querySelector('#resumeDraftDialog').showModal();
}
function renderEditorStep(){document.querySelectorAll('.editor-step').forEach((step,index)=>step.hidden=index!==editorStep);document.querySelector('#editorPreviousButton').hidden=editorStep===0;document.querySelector('#editorNextButton').hidden=editorStep===4;document.querySelector('#editorSaveButton').hidden=editorStep!==4;document.querySelector('#editorPreviewButton').hidden=editorStep!==4;document.querySelector('#editorProgressBar').style.width=`${((editorStep+1)/5)*100}%`;}
function validateStep(){const step=document.querySelector(`.editor-step[data-step="${editorStep}"]`);const invalid=[...step.querySelectorAll('[required]')].find(field=>!field.value.trim());if(invalid){invalid.reportValidity();invalid.focus();return false;}return true;}
function requestLeave(target){pendingLeaveTarget=target;if(editorDirty||readDraft(activeTreatmentId)){document.querySelector('#leaveDialog').showModal();}else{leaveEditor(target);}}
function leaveEditor(target){editorDirty=false;pendingLeaveTarget=null;clearTimeout(draftTimer);if(target==='dashboard')showAppView('dashboardView');else if(target==='treatments'){renderTreatments();showAppView('treatmentsView');}else openSummary(activeTreatmentId);}

// Dashboard and treatment browser
document.querySelector('#openTreatmentsButton').addEventListener('click',()=>{activeCategory='signature';renderTreatments();showAppView('treatmentsView');history.pushState({view:'treatments'},'','#treatments');});
document.querySelector('#treatmentsBackButton').addEventListener('click',()=>showAppView('dashboardView'));
document.querySelector('#summaryBackButton').addEventListener('click',()=>{renderTreatments();showAppView('treatmentsView');});
document.querySelectorAll('.treatment-tabs [role="tab"]').forEach(btn=>btn.addEventListener('click',()=>{activeCategory=btn.dataset.category;renderTreatments();}));
document.querySelector('#treatmentList').addEventListener('click',event=>{const row=event.target.closest('[data-treatment-id]');if(row)openSummary(row.dataset.treatmentId);});
document.querySelector('#editTreatmentButton').addEventListener('click',requestEditor);
document.querySelector('#resumeDraftDialog').addEventListener('close',event=>{const choice=event.target.returnValue;if(choice==='continue')startEditor(true);if(choice==='discard'){removeDraft(activeTreatmentId);startEditor(false);}});

// Editor protection and flow
document.querySelector('#treatmentEditorForm').addEventListener('input',()=>{
  editorDirty=true;
  setDraftStatus('Saving…');
  clearTimeout(draftTimer);
  draftTimer=setTimeout(()=>{writeDraft(currentRecord());editorDirty=true;},350);
});
document.querySelector('#editImage').addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;if(sessionImageUrl)URL.revokeObjectURL(sessionImageUrl);sessionImageUrl=URL.createObjectURL(file);const img=document.querySelector('#editorImagePreview');img.src=sessionImageUrl;img.hidden=false;editorDirty=true;setDraftStatus('Photo selected for this preview only');});
document.querySelector('#editorNextButton').addEventListener('click',()=>{if(validateStep()){flushDraft();editorDirty=true;editorStep=Math.min(4,editorStep+1);renderEditorStep();}});
document.querySelector('#editorPreviousButton').addEventListener('click',()=>{flushDraft();editorDirty=true;editorStep=Math.max(0,editorStep-1);renderEditorStep();});
document.querySelector('#editorSaveButton').addEventListener('click',()=>{writeDraft(currentRecord());editorDirty=true;});
document.querySelector('#editorPreviewButton').addEventListener('click',()=>{const record=currentRecord();writeDraft(record);editorDirty=true;if(sessionImageUrl)record.imageData=sessionImageUrl;document.querySelector('#treatmentPreview').innerHTML=summaryMarkup(record,{preview:true});showAppView('previewView');});
document.querySelector('#previewBackButton').addEventListener('click',()=>showAppView('editorView'));
document.querySelector('#editorLeaveButton').addEventListener('click',()=>requestLeave('summary'));
document.querySelector('#leaveDialog').addEventListener('close',event=>{const choice=event.target.returnValue;if(choice==='continue')return;if(choice==='save'){flushDraft();leaveEditor(pendingLeaveTarget||'summary');}if(choice==='discard'){removeDraft(activeTreatmentId);editorDirty=false;leaveEditor(pendingLeaveTarget||'summary');}});
window.addEventListener('pagehide',()=>{if(editorDirty)flushDraft();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&editorDirty)flushDraft();});
window.addEventListener('popstate',()=>{if(!document.querySelector('#editorView').hidden&&(editorDirty||readDraft(activeTreatmentId))){history.pushState({view:'editor'},'',`#edit-${activeTreatmentId}`);requestLeave('summary');}});
setInterval(refreshDraftTimes,30000);

// Authentication
document.querySelector('#recoveryRequestButton').addEventListener('click',async()=>{const emailInput=document.querySelector('#loginEmail');const message=document.querySelector('#recoveryRequestMessage');const email=emailInput.value.trim();if(!email){emailInput.focus();message.textContent='Enter your email address first, then select Forgotten your password?';message.hidden=false;return;}try{message.textContent='Sending password reset email…';message.hidden=false;await requestPasswordRecovery(email);message.textContent='Password reset email sent. Check your inbox and spam folder.';}catch(error){message.textContent=error?.message||'The password reset email could not be sent. Please try again.';}});
async function initialiseAuthentication(){const heading=document.querySelector('#loadingPanel h1');const message=document.querySelector('#loadingPanel p:last-child');try{heading.textContent='Checking your access…';message.textContent='Starting authentication…';const hasIdentityToken=/^#(?:invite_token|recovery_token|confirmation_token)=/.test(window.location.hash);let callback=null;if(hasIdentityToken){message.textContent='Processing the secure email link…';callback=await handleAuthCallback();}if(callback){switch(callback.type){case'invite':inviteToken=callback.token;showPanel('invite');return;case'recovery':clearIdentityCallbackUrl();showPanel('recovery');return;case'confirmation':case'email_change':case'oauth':clearIdentityCallbackUrl();showSuccess(callback.user);return;default:clearIdentityCallbackUrl();if(callback.user){showSuccess(callback.user);return;}}}const user=await getUser();user?showSuccess(user):showLogin();}catch(error){showError(error);}}
document.querySelector('#loginForm').addEventListener('submit',async event=>{event.preventDefault();showPanel('loading');try{showSuccess(await login(document.querySelector('#loginEmail').value.trim(),document.querySelector('#loginPassword').value));}catch(error){showError(error);}});
document.querySelector('#inviteForm').addEventListener('submit',async event=>{event.preventDefault();try{const password=document.querySelector('#invitePassword').value;passwordsMatch(password,document.querySelector('#invitePasswordConfirm').value);if(!inviteToken)throw new Error('The invitation token is missing or has expired. Request a new invitation and try again.');showPanel('loading');const user=await acceptInvite(inviteToken,password);inviteToken=null;clearIdentityCallbackUrl();showSuccess(user,'Your editor account is active.');}catch(error){showError(error);}});
document.querySelector('#recoveryForm').addEventListener('submit',async event=>{event.preventDefault();try{const password=document.querySelector('#recoveryPassword').value;passwordsMatch(password,document.querySelector('#recoveryPasswordConfirm').value);showPanel('loading');showSuccess(await updateUser({password}),'Your password has been updated.');}catch(error){showError(error);}});
document.querySelector('#logoutButton').addEventListener('click',async()=>{try{await logout();showLogin();}catch(error){showError(error);}});
document.querySelector('#retryButton').addEventListener('click',()=>{clearIdentityCallbackUrl();showLogin();});
initialiseAuthentication();
