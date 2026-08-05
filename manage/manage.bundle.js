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
var panels = Object.fromEntries(["loading", "login", "invite", "recovery", "success", "error"].map((name) => [name, document.querySelector(`#${name}Panel`)]));
var signedInAs = document.querySelector("#signedInAs");
var successMessage = document.querySelector("#successMessage");
var errorMessage = document.querySelector("#errorMessage");
var inviteToken = null;
var activeCategory = "signature";
var activeHomepageSection = null;
var homepageDirty = false;
var homepageDraftTimer = null;
var homepageDraftSaving = false;
var homepageDraftQueued = false;
var homepageSavedAt = null;
var homepagePublishing = false;
var activeTreatmentId = null;
var editorStep = 0;
var editorDirty = false;
var sessionImageUrl = "";
var draftTimer = null;
var initialPriceLinked = true;
var publishing = false;
var inactivityTimer = null;
var inactivityLocked = false;
var lastActivityAt = Date.now();
var resumeAfterLogin = false;
var lockContext = null;
var INACTIVITY_TIMEOUT_MS = 15 * 60 * 1e3;
var TREATMENTS_API = "/.netlify/functions/treatments";
var HOMEPAGE_DRAFT_API = "/.netlify/functions/homepage-draft";
var HOMEPAGE_API = "/.netlify/functions/homepage";
var treatments = [
  { id: "microblading", category: "signature", title: "Microblading", shortDescription: "Natural-looking brow enhancement using fine, hair-like strokes.", fullDescription: "Microblading is designed to create fuller, naturally defined brows using carefully placed hair-like strokes.", price: "\xA3100", duration: "2 hours", detailedPricing: "Initial treatment: \xA3100", followUpPricing: "Second session: \xA3100\nThird session: \xA375\nFourth session: Free", patchTest: true, visible: true },
  { id: "nano-brows", category: "signature", title: "Nano Brows", shortDescription: "Fine machine-created strokes for softly defined brows.", fullDescription: "Nano brows use a precision machine technique to create delicate, realistic-looking strokes.", price: "\xA3100", duration: "To be confirmed", detailedPricing: "", followUpPricing: "", patchTest: true, visible: true },
  { id: "blending", category: "signature", title: "Blending", shortDescription: "A blended brow treatment tailored to the desired finish.", fullDescription: "Blending combines techniques to create a balanced, softly defined result.", price: "\xA3100", duration: "To be confirmed", detailedPricing: "", followUpPricing: "", patchTest: true, visible: true },
  { id: "touch-up", category: "signature", title: "Touch-Up", shortDescription: "A refresh treatment to maintain colour and definition.", fullDescription: "Touch-up appointments refresh previous work and maintain the desired shape and colour.", price: "\xA350\u2013\xA3100", duration: "To be confirmed", detailedPricing: "", followUpPricing: "", patchTest: false, visible: true },
  { id: "removal-repair", category: "signature", title: "Removal / Repair", shortDescription: "Specialist correction or lightening of previous work.", fullDescription: "A consultation-led service for correcting or lightening existing work.", price: "\xA3200", duration: "3\u20134 hours", detailedPricing: "", followUpPricing: "", patchTest: true, visible: true },
  { id: "waxing", category: "beauty", title: "Waxing", shortDescription: "A selection of quick waxing treatments.", fullDescription: "Choose from a range of waxing services. Individual areas and prices can be listed in the detailed pricing.", price: "From \xA35", duration: "Varies", detailedPricing: "", followUpPricing: "", patchTest: false, visible: true },
  { id: "lash-brow", category: "beauty", title: "Lash & Brow", shortDescription: "A combined lash and brow treatment.", fullDescription: "A convenient combined appointment for lashes and brows.", price: "\xA320", duration: "To be confirmed", detailedPricing: "", followUpPricing: "", patchTest: true, visible: true },
  { id: "tinting", category: "beauty", title: "Tinting", shortDescription: "Enhance the appearance of brows or lashes with tint.", fullDescription: "Tinting adds colour and definition for a polished, low-maintenance finish.", price: "\xA310", duration: "To be confirmed", detailedPricing: "", followUpPricing: "", patchTest: true, visible: true },
  { id: "nail-art", category: "beauty", title: "Nail Art", shortDescription: "Creative nail designs tailored to your chosen style.", fullDescription: "Choose from simple accents through to detailed custom nail art.", price: "\xA310\u2013\xA365", duration: "Varies", detailedPricing: "", followUpPricing: "", patchTest: false, visible: true },
  { id: "ear-piercing", category: "beauty", title: "Ear Piercing", shortDescription: "A straightforward ear-piercing appointment.", fullDescription: "Ear piercing provided in a calm and welcoming setting.", price: "\xA310", duration: "To be confirmed", detailedPricing: "", followUpPricing: "", patchTest: false, visible: true },
  { id: "shellac-nails", category: "beauty", title: "Shellac Nails", shortDescription: "Long-lasting, glossy colour for natural nails.", fullDescription: "Shellac provides a durable and polished finish for natural nails.", price: "\xA325", duration: "To be confirmed", detailedPricing: "", followUpPricing: "", patchTest: false, visible: true },
  ...[
    ["skin-peeling", "Skin Peeling", "A skin-renewal treatment designed to improve texture and radiance."],
    ["vitamin-injections", "Vitamin Injections", "Targeted vitamin treatments, subject to consultation and suitability."],
    ["threading", "Threading", "Precise hair removal using a traditional threading technique."],
    ["cream-tanning", "Cream Tanning", "An even, sun-kissed finish applied using a professional tanning cream."],
    ["spray-tanning", "Spray Tanning", "A professionally applied tan for an even, natural-looking glow."]
  ].map(([id, title, shortDescription]) => ({ id, category: "coming-soon", title, shortDescription, fullDescription: shortDescription, price: "Coming soon", duration: "Coming soon", detailedPricing: "", followUpPricing: "", patchTest: false, visible: true }))
];
var views = ["sectionEditorView", "dashboardView", "homepageView", "homepageSummaryView", "homepageEditorView", "homepagePreviewView", "treatmentsView", "treatmentSummaryView", "editorView", "previewView"];
var homepageOriginal = {
  heroTitleFirst: "Effortless",
  heroTitleSecond: "Beauty",
  heroLine: "Enhance. Simplify.",
  heroLineEmphasis: "Feel beautiful.",
  intro: "Soft, natural-looking brows and permanent makeup designed to make everyday beauty feel effortless.",
  primaryButton: "Book online",
  secondaryButton: "Aftercare guide",
  sectionKicker: "Why clients choose us",
  sectionHeading: "Polished results, calm appointments, clear aftercare.",
  features: [
    { title: "Natural finish", text: "Designed to complement your face rather than overpower it." },
    { title: "Low-maintenance beauty", text: "Wake up with shape, definition and softness already in place." },
    { title: "Client-friendly care", text: "Aftercare is explained clearly, including the normal healing stages." }
  ]
};
var homepageWorking = JSON.parse(JSON.stringify(homepageOriginal));
function setHomepageDraftStatus(message) {
  const element = document.querySelector("#homepageDraftStatus");
  if (element) element.textContent = message;
}
function setHomepagePublishStatus(message = "", type = "") {
  const element = document.querySelector("#homepagePublishStatus");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", type === "error");
  element.classList.toggle("success", type === "success");
}
async function loadPublishedHomepage() {
  try {
    const response = await fetch(HOMEPAGE_API, { cache: "no-store" });
    if (response.status === 404) return;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Published homepage could not be loaded.");
    if (result?.data?.features) {
      homepageOriginal = clone(result.data);
      delete homepageOriginal.schemaVersion;
      delete homepageOriginal.updatedAt;
      homepageWorking = clone(homepageOriginal);
      updatePublishedDisplay(result.data.updatedAt);
    }
  } catch (error) {
    console.warn(error);
  }
}
async function loadHomepageDraft() {
  try {
    const response = await fetch(HOMEPAGE_DRAFT_API, { cache: "no-store", credentials: "same-origin" });
    if (response.status === 404) {
      homepageWorking = clone(homepageOriginal);
      homepageDirty = false;
      homepageSavedAt = null;
      return;
    }
    if (response.status === 401) return;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Homepage draft could not be loaded.");
    if (result?.data?.content) {
      homepageWorking = clone(result.data.content);
      homepageSavedAt = result.data.savedAt || null;
      homepageDirty = JSON.stringify(homepageWorking) !== JSON.stringify(homepageOriginal);
    }
  } catch (error) {
    console.warn(error);
  }
}
async function saveHomepageDraft() {
  clearTimeout(homepageDraftTimer);
  homepageDraftTimer = null;
  if (homepageDraftSaving) {
    homepageDraftQueued = true;
    return;
  }
  homepageDraftSaving = true;
  setHomepageDraftStatus("Saving online\u2026");
  try {
    const response = await fetch(HOMEPAGE_DRAFT_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ schemaVersion: 1, content: homepageWorking })
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setHomepageDraftStatus("Sign in again to save");
      lockManager();
      return;
    }
    if (!response.ok) throw new Error(result.error || "Homepage draft could not be saved.");
    homepageSavedAt = result.savedAt;
    setHomepageDraftStatus(`\u2713 Saved online \xB7 ${relativeTime(result.savedAt)}`);
  } catch (error) {
    setHomepageDraftStatus("Could not save online \u2014 changes remain on this screen");
    console.warn(error);
  } finally {
    homepageDraftSaving = false;
    if (homepageDraftQueued) {
      homepageDraftQueued = false;
      scheduleHomepageDraftSave();
    }
  }
}
function scheduleHomepageDraftSave() {
  clearTimeout(homepageDraftTimer);
  setHomepageDraftStatus("Saving online\u2026");
  homepageDraftTimer = setTimeout(saveHomepageDraft, 600);
}
var homepageSections = [
  { id: "hero", title: "Hero", description: "The main heading and opening message at the top of the website.", icon: "\u2302", fields: [
    { label: "First heading line", path: "heroTitleFirst", required: true, maxLength: 60 },
    { label: "Second heading line", path: "heroTitleSecond", required: true, maxLength: 60 },
    { label: "Supporting line", path: "heroLine", required: true, maxLength: 100 },
    { label: "Emphasised words", path: "heroLineEmphasis", required: true, maxLength: 100 },
    { label: "Primary button", path: "primaryButton", required: true, maxLength: 40 },
    { label: "Secondary button", path: "secondaryButton", required: true, maxLength: 40 }
  ] },
  { id: "introduction", title: "Introduction", description: "The short welcome message beneath the hero area.", icon: "\u2726", fields: [
    { label: "Introduction", path: "intro", required: true, multiline: true, maxLength: 500, help: "Keep this warm, clear and easy to scan on a phone." }
  ] },
  { id: "why-choose-us", title: "Why Choose Us", description: "The heading that introduces the reasons clients choose Effortless Beauty.", icon: "\u2661", fields: [
    { label: "Small heading", path: "sectionKicker", required: true, maxLength: 80 },
    { label: "Main heading", path: "sectionHeading", required: true, multiline: true, maxLength: 180 }
  ] },
  { id: "feature-cards", title: "Feature Cards", description: "The three reassurance cards shown on the homepage.", icon: "\u25C7", featureEditor: true }
];
var DRAFT_VERSION = 1;
var NEW_TREATMENTS_KEY = "eb-new-treatments-v1";
var newTreatmentIds = /* @__PURE__ */ new Set();
var draftKey = (id) => `eb-treatment-draft:${id}`;
var clone = (value) => JSON.parse(JSON.stringify(value));
var sameContent = (left, right) => JSON.stringify(left) === JSON.stringify(right);
var verifiedFetchUrl = (url) => `${url}${url.includes("?") ? "&" : "?"}verify=${Date.now()}`;
var findTreatment = (id) => treatments.find((item) => item.id === id);
var treatmentDocument = () => ({
  schemaVersion: 1,
  eyebrow: "Treatments",
  heading: "Treatment menu",
  intro: "Explore Effortless Beauty treatments, prices and appointment times.",
  items: treatments.map((item) => clone(readDraft(item.id)?.record || item))
});
function validateTreatmentDocument(document2) {
  const missingText = (value) => typeof value !== "string" || !value.trim();
  const invalid = document2.items.find((item) => !item?.id || !["signature", "beauty", "coming-soon"].includes(item.category) || missingText(item.title) || missingText(item.shortDescription) || missingText(item.price) || missingText(item.duration) || typeof item.patchTest !== "boolean" || typeof item.visible !== "boolean");
  if (!invalid) return null;
  const label = typeof invalid.title === "string" && invalid.title.trim() ? invalid.title.trim() : "an unnamed treatment";
  return `Complete ${label} before publishing: name, short description, price and treatment time are required.`;
}
function setPublishStatus(message = "", type = "") {
  const element = document.querySelector("#publishStatus");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", type === "error");
  element.classList.toggle("success", type === "success");
}
function formatPublishedAt(value) {
  if (!value) return "Not published yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Published";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function updatePublishedDisplay(value) {
  const element = document.querySelector("#lastPublishedValue");
  if (element) element.textContent = formatPublishedAt(value);
}
async function loadPublishedTreatments() {
  restoreNewTreatments();
  try {
    const response = await fetch(TREATMENTS_API, { cache: "no-store" });
    if (response.status === 404) {
      const fallbackResponse = await fetch("/content/treatments.json", { cache: "no-store" });
      if (!fallbackResponse.ok) return;
      const fallback = await fallbackResponse.json();
      if (Array.isArray(fallback?.items)) {
        treatments = fallback.items.map((item) => ({ ...item }));
        restoreNewTreatments();
        renderTreatments();
      }
      return;
    }
    if (!response.ok) throw new Error("Published treatments could not be loaded.");
    const result = await response.json();
    if (Array.isArray(result?.data?.items)) {
      treatments = result.data.items.map((item) => ({ ...item }));
      restoreNewTreatments();
      updatePublishedDisplay(result.data.updatedAt);
      renderTreatments();
    }
  } catch (error) {
    console.warn(error);
  }
}
async function publishTreatments() {
  if (publishing) return;
  let treatmentData;
  try {
    flushDraft();
    treatmentData = treatmentDocument();
    const validationError = validateTreatmentDocument(treatmentData);
    if (validationError) {
      setPublishStatus(validationError, "error");
      return;
    }
  } catch (error) {
    setPublishStatus(error.message || "Your treatment details could not be prepared for publishing.", "error");
    return;
  }
  publishing = true;
  const button = document.querySelector("#editorPublishButton");
  button.disabled = true;
  button.textContent = "Publishing\u2026";
  setPublishStatus("Publishing your changes\u2026");
  try {
    const response = await fetch(TREATMENTS_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(treatmentData)
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setPublishStatus("Your session has expired. Sign in again to publish.", "error");
      lockManager();
      return;
    }
    if (!response.ok) throw new Error(result.error || "Your changes could not be published.");
    const verificationResponse = await fetch(verifiedFetchUrl(TREATMENTS_API), { cache: "no-store", credentials: "same-origin" });
    const verification = await verificationResponse.json().catch(() => ({}));
    if (!verificationResponse.ok || !Array.isArray(verification?.data?.items) || !sameContent(verification.data.items, result?.data?.items)) {
      throw new Error("The publish could not be verified. Your drafts have been kept safely.");
    }
    treatments = verification.data.items.map((item) => ({ ...item }));
    treatments.forEach((item) => localStorage.removeItem(draftKey(item.id)));
    newTreatmentIds.clear();
    localStorage.removeItem(NEW_TREATMENTS_KEY);
    editorDirty = false;
    updatePublishedDisplay(result.updatedAt);
    setDraftStatus(`\u2713 Published \xB7 ${relativeTime(result.updatedAt)}`);
    setPublishStatus("\u2713 Published successfully. The live website now uses these changes.", "success");
    renderTreatments();
  } catch (error) {
    setPublishStatus(error.message || "Your changes could not be published.", "error");
  } finally {
    publishing = false;
    button.disabled = false;
    button.textContent = "Publish";
  }
}
function showPanel(name) {
  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== name;
  });
}
function showAppView(id) {
  views.forEach((viewId) => {
    document.querySelector(`#${viewId}`).hidden = viewId !== id;
  });
  window.scrollTo({ top: 0, behavior: "instant" });
}
function currentAppView() {
  return views.find((viewId) => !document.querySelector(`#${viewId}`).hidden) || "dashboardView";
}
function captureLockContext() {
  return { viewId: currentAppView(), activeTreatmentId, activeCategory, activeHomepageSection, activeSiteSection, editorStep };
}
function setAppInert(value) {
  views.forEach((viewId) => {
    document.querySelector(`#${viewId}`).inert = value;
  });
}
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (inactivityLocked || panels.success.hidden) return;
  const remaining = INACTIVITY_TIMEOUT_MS - (Date.now() - lastActivityAt);
  if (remaining <= 0) {
    lockManager();
    return;
  }
  inactivityTimer = setTimeout(checkInactivity, remaining);
}
function recordActivity() {
  if (inactivityLocked || panels.success.hidden) return;
  lastActivityAt = Date.now();
  resetInactivityTimer();
}
function checkInactivity() {
  if (inactivityLocked || panels.success.hidden) return;
  if (Date.now() - lastActivityAt >= INACTIVITY_TIMEOUT_MS) {
    lockManager();
    return;
  }
  resetInactivityTimer();
}
function lockManager() {
  if (inactivityLocked || panels.success.hidden) return;
  if (editorDirty && currentAppView() === "editorView") flushDraft();
  if (homepageDraftTimer) saveHomepageDraft();
  if (siteSectionSaveTimer) saveSiteSectionDraft();
  lockContext = captureLockContext();
  inactivityLocked = true;
  setAppInert(true);
  document.querySelector("#inactivityLock").hidden = false;
  clearTimeout(inactivityTimer);
}
function restoreLockedContext() {
  if (!lockContext) {
    showAppView("dashboardView");
    return;
  }
  activeTreatmentId = lockContext.activeTreatmentId;
  activeCategory = lockContext.activeCategory || "signature";
  activeHomepageSection = lockContext.activeHomepageSection || activeHomepageSection;
  editorStep = Math.max(0, Math.min(4, lockContext.editorStep || 0));
  if (lockContext.viewId === "homepageView") renderHomepageSections();
  if (lockContext.viewId === "homepageSummaryView" && activeHomepageSection) {
    const section = homepageSections.find((item) => item.id === activeHomepageSection);
    if (section) document.querySelector("#homepageSummary").innerHTML = homepageSummaryMarkup(section);
  }
  if (lockContext.viewId === "homepageEditorView" && activeHomepageSection) renderHomepageEditor();
  if (lockContext.viewId === "homepagePreviewView" && activeHomepageSection) renderHomepagePreview();
  if (lockContext.viewId === "sectionEditorView" && lockContext.activeSiteSection) {
    activeSiteSection = lockContext.activeSiteSection;
    renderSiteSectionEditor();
  }
  if (lockContext.viewId === "treatmentsView") renderTreatments();
  if (lockContext.viewId === "treatmentSummaryView" && activeTreatmentId) {
    const draft = readDraft(activeTreatmentId);
    const record = draft?.record || findTreatment(activeTreatmentId);
    document.querySelector("#treatmentSummary").innerHTML = summaryMarkup(record, { preview: Boolean(draft) });
  }
  if (lockContext.viewId === "editorView") renderEditorStep();
  showAppView(lockContext.viewId || "dashboardView");
}
function unlockManager() {
  inactivityLocked = false;
  document.querySelector("#inactivityLock").hidden = true;
  setAppInert(false);
  lastActivityAt = Date.now();
  resetInactivityTimer();
}
function clearIdentityCallbackUrl() {
  history.replaceState(null, document.title, "/manage/");
}
function showLogin() {
  signedInAs.textContent = "";
  successMessage.textContent = "You are securely signed in.";
  clearTimeout(inactivityTimer);
  showPanel("login");
}
function showSuccess(user, message = "Manage your Effortless Beauty website from one place.") {
  successMessage.textContent = message;
  signedInAs.textContent = user?.email || "Authenticated user";
  showPanel("success");
  lastActivityAt = Date.now();
  resetInactivityTimer();
  Promise.allSettled([loadPublishedTreatments(), loadPublishedHomepage().then(loadHomepageDraft)]).then(() => {
    if (resumeAfterLogin) {
      restoreLockedContext();
      resumeAfterLogin = false;
      unlockManager();
    } else {
      showAppView("dashboardView");
      unlockManager();
      lockContext = null;
    }
  });
}
function showError(error) {
  errorMessage.textContent = error?.message || error?.msg || "The login service could not complete that request.";
  showPanel("error");
}
function passwordsMatch(password, confirmation) {
  if (password !== confirmation) throw new Error("The two passwords do not match.");
  if (password.length < 8) throw new Error("Your password must contain at least 8 characters.");
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
function nl2br(value = "") {
  return escapeHtml(value).replace(/\n/g, "<br>");
}
function persistNewTreatments() {
  const records = treatments.filter((item) => newTreatmentIds.has(item.id)).map((item) => clone(readDraft(item.id)?.record || item));
  if (records.length) localStorage.setItem(NEW_TREATMENTS_KEY, JSON.stringify(records));
  else localStorage.removeItem(NEW_TREATMENTS_KEY);
}
function restoreNewTreatments() {
  try {
    const records = JSON.parse(localStorage.getItem(NEW_TREATMENTS_KEY) || "[]");
    if (!Array.isArray(records)) return;
    records.forEach((record) => {
      if (!record?.id || treatments.some((item) => item.id === record.id)) return;
      treatments.push({ ...record });
      newTreatmentIds.add(record.id);
    });
  } catch {
  }
}
function treatmentIdFromTitle(title) {
  const stem = String(title || "new-treatment").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-treatment";
  let id = stem;
  let suffix = 2;
  while (treatments.some((item) => item.id === id)) {
    id = `${stem}-${suffix++}`;
  }
  return id;
}
function addTreatment() {
  const categoryLabel = activeCategory === "signature" ? "Signature" : activeCategory === "beauty" ? "Beauty" : "Coming Soon";
  const record = {
    id: treatmentIdFromTitle(`new-${activeCategory}-treatment`),
    category: activeCategory,
    title: `New ${categoryLabel} treatment`,
    shortDescription: "Add a short description for this treatment.",
    fullDescription: "",
    price: activeCategory === "coming-soon" ? "Coming soon" : "",
    duration: "",
    detailedPricing: "",
    followUpPricing: "",
    patchTest: false,
    visible: false
  };
  treatments.push(record);
  newTreatmentIds.add(record.id);
  activeTreatmentId = record.id;
  writeDraft(record);
  persistNewTreatments();
  editorDirty = true;
  populateEditor(clone(record), 0);
  setDraftStatus("\u2713 New treatment started \xB7 hidden until you publish");
}
function readDraft(id) {
  try {
    const stored = JSON.parse(localStorage.getItem(draftKey(id)) || "null");
    if (!stored) return null;
    if (stored.record) return stored;
    const { savedAt, ...record } = stored;
    return { version: DRAFT_VERSION, treatmentId: id, savedAt: savedAt || (/* @__PURE__ */ new Date()).toISOString(), record };
  } catch {
    return null;
  }
}
function writeDraft(record) {
  const savedAt = (/* @__PURE__ */ new Date()).toISOString();
  const payload = { version: DRAFT_VERSION, treatmentId: record.id, savedAt, editorStep, record: clone(record) };
  localStorage.setItem(draftKey(record.id), JSON.stringify(payload));
  if (newTreatmentIds.has(record.id)) persistNewTreatments();
  setDraftStatus(`\u2713 Saved \xB7 ${relativeTime(savedAt)}`);
  renderTreatments();
  return payload;
}
function removeDraft(id) {
  localStorage.removeItem(draftKey(id));
  if (newTreatmentIds.has(id)) {
    newTreatmentIds.delete(id);
    treatments = treatments.filter((item) => item.id !== id);
    persistNewTreatments();
  }
  renderTreatments();
}
function relativeTime(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const seconds = Math.floor(elapsed / 1e3);
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function setDraftStatus(text) {
  document.querySelector("#draftStatus").textContent = text;
}
function currentRecord() {
  const base = clone(findTreatment(activeTreatmentId));
  const form = new FormData(document.querySelector("#treatmentEditorForm"));
  return { ...base, title: form.get("title")?.trim() || "", shortDescription: form.get("shortDescription")?.trim() || "", price: form.get("price")?.trim() || "", duration: form.get("duration")?.trim() || "", fullDescription: form.get("fullDescription")?.trim() || "", detailedPricing: form.get("detailedPricing")?.trim() || "", followUpPricing: form.get("followUpPricing")?.trim() || "", patchTest: document.querySelector("#editPatchTest").checked, visible: document.querySelector("#editVisible").checked, initialPriceLinked };
}
function flushDraft() {
  if (!activeTreatmentId || document.querySelector("#editorView").hidden) return null;
  clearTimeout(draftTimer);
  draftTimer = null;
  return writeDraft(currentRecord());
}
function renderTreatments() {
  document.querySelectorAll('.treatment-tabs [role="tab"]').forEach((btn) => btn.setAttribute("aria-selected", String(btn.dataset.category === activeCategory)));
  const items = treatments.filter((item) => item.category === activeCategory);
  document.querySelector("#treatmentList").innerHTML = items.map((item) => {
    const draft = readDraft(item.id);
    const displayItem = draft?.record || item;
    const draftLabel = draft ? `<em data-draft-time="${escapeHtml(draft.savedAt)}">Unpublished \xB7 ${escapeHtml(relativeTime(draft.savedAt))}</em>` : "";
    return `<button class="treatment-row" type="button" data-treatment-id="${item.id}"><span><strong>${escapeHtml(displayItem.title)}</strong><small>${escapeHtml(displayItem.price)} \xB7 ${escapeHtml(displayItem.duration)}</small></span><span class="row-meta">${draftLabel}<b aria-hidden="true">\u203A</b></span></button>`;
  }).join("");
  const addButton = document.querySelector("#addTreatmentButton");
  if (addButton) {
    const label = activeCategory === "signature" ? "Signature treatment" : activeCategory === "beauty" ? "Beauty treatment" : "Coming Soon treatment";
    addButton.querySelector("strong").textContent = `Add ${label}`;
  }
}
function refreshDraftTimes() {
  document.querySelectorAll("[data-draft-time]").forEach((el) => {
    el.textContent = `Unpublished \xB7 ${relativeTime(el.dataset.draftTime)}`;
  });
  const draft = activeTreatmentId && readDraft(activeTreatmentId);
  if (draft && !document.querySelector("#editorView").hidden) setDraftStatus(`\u2713 Saved \xB7 ${relativeTime(draft.savedAt)}`);
}
function summaryMarkup(record, { preview = false } = {}) {
  return `<div class="summary-hero"><div class="summary-image-placeholder" aria-hidden="true">${record.imageData ? `<img src="${record.imageData}" alt="">` : "\u2726"}</div><p class="eyebrow">${escapeHtml(record.category.replace("-", " "))}</p><h1>${escapeHtml(record.title)}</h1><p class="summary-intro">${escapeHtml(record.shortDescription)}</p><div class="summary-facts"><span><small>Price</small><strong>${escapeHtml(record.price || "Not set")}</strong></span><span><small>Treatment time</small><strong>${escapeHtml(record.duration || "Not set")}</strong></span></div></div><div class="summary-details"><h2>About this treatment</h2><p>${nl2br(record.fullDescription || "No full description has been added yet.")}</p>${record.detailedPricing ? `<h3>Detailed pricing</h3><p>${nl2br(record.detailedPricing)}</p>` : ""}${record.followUpPricing ? `<h3>Follow-up pricing</h3><p>${nl2br(record.followUpPricing)}</p>` : ""}<dl><div><dt>Patch test</dt><dd>${record.patchTest ? "Required" : "Not required"}</dd></div><div><dt>Website visibility</dt><dd>${record.visible ? "Visible" : "Hidden"}</dd></div></dl>${preview ? '<p class="preview-note">This is an unpublished preview. The live website has not changed.</p>' : ""}</div>`;
}
function openSummary(id) {
  activeTreatmentId = id;
  const draft = readDraft(id);
  const record = draft?.record || findTreatment(id);
  document.querySelector("#treatmentSummary").innerHTML = summaryMarkup(record, { preview: Boolean(draft) });
  showAppView("treatmentSummaryView");
  history.pushState({ view: "summary" }, "", `#treatment-${id}`);
}
function populateEditor(record, restoredStep = 0) {
  document.querySelector("#editTitle").value = record.title || "";
  document.querySelector("#editShortDescription").value = record.shortDescription || "";
  document.querySelector("#editPrice").value = record.price || "";
  document.querySelector("#editDuration").value = record.duration || "";
  document.querySelector("#editFullDescription").value = record.fullDescription || "";
  initialPriceLinked = record.initialPriceLinked ?? (!record.detailedPricing || record.detailedPricing === `Initial treatment: ${record.price || ""}`);
  document.querySelector("#editDetailedPricing").value = record.detailedPricing || (record.price ? `Initial treatment: ${record.price}` : "");
  document.querySelector("#initialPriceHint").textContent = initialPriceLinked ? "Uses the main price until you change this field." : "Custom pricing";
  document.querySelector("#editFollowUpPricing").value = record.followUpPricing || "";
  document.querySelector("#editPatchTest").checked = Boolean(record.patchTest);
  document.querySelector("#editVisible").checked = Boolean(record.visible);
  const img = document.querySelector("#editorImagePreview");
  img.hidden = true;
  img.removeAttribute("src");
  editorStep = Math.max(0, Math.min(4, restoredStep || 0));
  sessionImageUrl = "";
  renderEditorStep();
  showAppView("editorView");
  history.pushState({ view: "editor" }, "", `#edit-${activeTreatmentId}`);
}
function startEditor() {
  const draft = readDraft(activeTreatmentId);
  const record = draft ? clone(draft.record) : clone(findTreatment(activeTreatmentId));
  editorDirty = Boolean(draft);
  populateEditor(record, 0);
  setDraftStatus(draft ? `\u2713 Changes restored \xB7 ${relativeTime(draft.savedAt)}` : "\u2713 Autosave on");
}
function requestEditor() {
  startEditor();
}
function renderEditorStep() {
  document.querySelectorAll(".editor-step").forEach((step, index) => step.hidden = index !== editorStep);
  document.querySelector("#editorPreviousButton").hidden = editorStep === 0;
  document.querySelector("#editorNextButton").hidden = editorStep === 4;
  document.querySelector("#editorPreviewButton").hidden = editorStep !== 4;
  document.querySelector("#editorPublishButton").hidden = editorStep !== 4;
  document.querySelector("#editorProgressBar").style.width = `${(editorStep + 1) / 5 * 100}%`;
  if (editorStep !== 4) setPublishStatus("");
}
function validateStep() {
  const step = document.querySelector(`.editor-step[data-step="${editorStep}"]`);
  const invalid = [...step.querySelectorAll("[required]")].find((field) => !field.value.trim());
  if (invalid) {
    invalid.reportValidity();
    invalid.focus();
    return false;
  }
  return true;
}
function requestLeave(target) {
  if (editorDirty) flushDraft();
  leaveEditor(target);
}
function leaveEditor(target) {
  editorDirty = false;
  clearTimeout(draftTimer);
  if (target === "dashboard") showAppView("dashboardView");
  else if (target === "treatments") {
    renderTreatments();
    showAppView("treatmentsView");
  } else openSummary(activeTreatmentId);
}
function rememberPreviewReturn() {
  localStorage.setItem("eb-preview-return-url-v1", window.location.href);
}
function previewHomepageWebsite() {
  try {
    localStorage.setItem("eb-homepage-preview-v1", JSON.stringify(homepageWorking));
    rememberPreviewReturn();
    window.open("/?preview=homepage#home", "_blank", "noopener");
    setHomepagePublishStatus("Preview opened in a new tab. The live website has not changed.");
  } catch (error) {
    setHomepagePublishStatus("The website preview could not be opened.", "error");
  }
}
async function publishHomepage() {
  if (homepagePublishing) return;
  const user = await getUser().catch(() => null);
  if (!user) {
    setHomepagePublishStatus("Your session has expired. Sign in again to publish.", "error");
    lockManager();
    return;
  }
  if (homepageDraftTimer || homepageDraftSaving) await saveHomepageDraft();
  if (!confirm("Publish these Homepage changes to the live website?")) return;
  homepagePublishing = true;
  const button = document.querySelector("#homepagePublishButton");
  button.disabled = true;
  button.textContent = "Publishing\u2026";
  setHomepagePublishStatus("Publishing your homepage\u2026");
  try {
    const response = await fetch(HOMEPAGE_API, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ content: homepageWorking }) });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setHomepagePublishStatus("Your session has expired. Sign in again to publish.", "error");
      lockManager();
      return;
    }
    if (!response.ok) throw new Error(result.error || "Your homepage could not be published.");
    const verificationResponse = await fetch(verifiedFetchUrl(HOMEPAGE_API), { cache: "no-store", credentials: "same-origin" });
    const verification = await verificationResponse.json().catch(() => ({}));
    if (!verificationResponse.ok || !verification?.data || verification.data.updatedAt !== result?.data?.updatedAt) {
      throw new Error("The publish could not be verified. Your homepage draft has been kept safely.");
    }
    homepageOriginal = clone(verification.data);
    delete homepageOriginal.schemaVersion;
    delete homepageOriginal.updatedAt;
    homepageWorking = clone(homepageOriginal);
    homepageDirty = false;
    homepageSavedAt = null;
    updatePublishedDisplay(result.updatedAt);
    setHomepageDraftStatus(`\u2713 Published \xB7 ${relativeTime(result.updatedAt)}`);
    setHomepagePublishStatus("\u2713 Published successfully. The live homepage now uses these changes.", "success");
    renderHomepageSections();
  } catch (error) {
    setHomepagePublishStatus(error.message || "Your homepage could not be published.", "error");
  } finally {
    homepagePublishing = false;
    button.disabled = false;
    button.textContent = "Publish homepage";
  }
}
function renderHomepageSections() {
  document.querySelector("#homepageSectionList").innerHTML = homepageSections.map((section) => `<button class="homepage-section-row" type="button" data-homepage-section="${escapeHtml(section.id)}"><span class="homepage-section-icon" aria-hidden="true">${escapeHtml(section.icon)}</span><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.description)}</small></span><b aria-hidden="true">\u203A</b></button>`).join("");
}
function homepageSectionValues(section) {
  if (section.featureEditor) return homepageWorking.features.map((feature) => [feature.title, feature.text]);
  return section.fields.map((field) => [field.label, homepageWorking[field.path]]);
}
function homepageSummaryMarkup(section, { preview = false } = {}) {
  const values = homepageSectionValues(section);
  const fields = section.featureEditor ? "" : values.map(([label, value]) => `<div class="homepage-content-field"><small>${escapeHtml(label)}</small><p>${escapeHtml(value)}</p></div>`).join("");
  const features = section.featureEditor ? values.map(([title, text]) => `<div class="homepage-feature-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`).join("") : "";
  const note = preview ? "This is a private section preview. The live website has not changed." : homepageDirty ? "Unpublished changes are saved safely online. Preview the whole website before publishing." : "This section matches the live homepage. Choose Edit section to update it.";
  return `<div class="homepage-summary-heading"><span class="homepage-section-icon" aria-hidden="true">${escapeHtml(section.icon)}</span><p class="eyebrow">${preview ? "Homepage preview" : "Homepage section"}</p><h1>${escapeHtml(section.title)}</h1><p>${escapeHtml(section.description)}</p></div><div class="homepage-summary-content">${fields}${features ? `<div class="homepage-feature-grid">${features}</div>` : ""}<p class="read-only-note">${escapeHtml(note)}</p></div>`;
}
function openHomepageSummary(id) {
  const section = homepageSections.find((item) => item.id === id);
  if (!section) return;
  activeHomepageSection = id;
  document.querySelector("#homepageSummary").innerHTML = homepageSummaryMarkup(section);
  showAppView("homepageSummaryView");
  history.pushState({ view: "homepage-summary", section: id }, "", `#homepage-${id}`);
}
function homepageFieldMarkup(field, value) {
  const attrs = `data-homepage-path="${escapeHtml(field.path)}" maxlength="${field.maxLength || 500}" ${field.required ? "required" : ""}`;
  const control = field.multiline ? `<textarea ${attrs} rows="5">${escapeHtml(value)}</textarea>` : `<input ${attrs} type="text" value="${escapeHtml(value)}" />`;
  return `<label><span>${escapeHtml(field.label)}</span>${control}${field.help ? `<small>${escapeHtml(field.help)}</small>` : ""}</label>`;
}
function renderHomepageEditor() {
  const section = homepageSections.find((item) => item.id === activeHomepageSection);
  if (!section) return;
  let fields = "";
  if (section.featureEditor) {
    fields = homepageWorking.features.map((feature, index) => `<fieldset class="homepage-feature-editor"><legend>Card ${index + 1}</legend><label><span>Title</span><input data-homepage-feature="${index}" data-feature-key="title" maxlength="80" required type="text" value="${escapeHtml(feature.title)}" /></label><label><span>Description</span><textarea data-homepage-feature="${index}" data-feature-key="text" maxlength="300" required rows="4">${escapeHtml(feature.text)}</textarea></label></fieldset>`).join("");
  } else fields = section.fields.map((field) => homepageFieldMarkup(field, homepageWorking[field.path])).join("");
  document.querySelector("#homepageEditorFields").innerHTML = `<p class="eyebrow">Homepage editor</p><h1>${escapeHtml(section.title)}</h1><p>${escapeHtml(section.description)}</p>${fields}`;
  setHomepageDraftStatus(homepageSavedAt ? `\u2713 Saved online \xB7 ${relativeTime(homepageSavedAt)}` : "\u2713 Autosave on");
}
function startHomepageEditor() {
  renderHomepageEditor();
  showAppView("homepageEditorView");
  history.pushState({ view: "homepage-editor", section: activeHomepageSection }, "", `#homepage-${activeHomepageSection}-edit`);
}
function updateHomepageWorking(target) {
  if (target.dataset.homepagePath) homepageWorking[target.dataset.homepagePath] = target.value;
  if (target.dataset.homepageFeature != null) {
    const feature = homepageWorking.features[Number(target.dataset.homepageFeature)];
    if (feature) feature[target.dataset.featureKey] = target.value;
  }
  homepageDirty = true;
  scheduleHomepageDraftSave();
}
function validateHomepageEditor() {
  const invalid = [...document.querySelectorAll("#homepageEditorForm [required]")].find((field) => !field.value.trim());
  if (invalid) {
    invalid.reportValidity();
    invalid.focus();
    return false;
  }
  return true;
}
function resetHomepageSection() {
  const section = homepageSections.find((item) => item.id === activeHomepageSection);
  if (!section) return;
  if (section.featureEditor) homepageWorking.features = clone(homepageOriginal.features);
  else section.fields.forEach((field) => {
    homepageWorking[field.path] = homepageOriginal[field.path];
  });
  homepageDirty = JSON.stringify(homepageWorking) !== JSON.stringify(homepageOriginal);
  renderHomepageEditor();
  scheduleHomepageDraftSave();
}
function renderHomepagePreview() {
  const section = homepageSections.find((item) => item.id === activeHomepageSection);
  if (section) document.querySelector("#homepagePreview").innerHTML = homepageSummaryMarkup(section, { preview: true });
}
document.querySelector("#openHomepageButton").addEventListener("click", () => {
  renderHomepageSections();
  showAppView("homepageView");
  history.pushState({ view: "homepage" }, "", "#homepage");
});
document.querySelector("#homepageBackButton").addEventListener("click", () => showAppView("dashboardView"));
document.querySelector("#homepageWebsitePreviewButton").addEventListener("click", previewHomepageWebsite);
document.querySelector("#homepagePublishButton").addEventListener("click", publishHomepage);
document.querySelector("#homepageSummaryBackButton").addEventListener("click", () => {
  renderHomepageSections();
  showAppView("homepageView");
});
document.querySelector("#homepageSectionList").addEventListener("click", (event) => {
  const row = event.target.closest("[data-homepage-section]");
  if (row) openHomepageSummary(row.dataset.homepageSection);
});
document.querySelector("#editHomepageSectionButton").addEventListener("click", startHomepageEditor);
document.querySelector("#homepageEditorForm").addEventListener("input", (event) => {
  if (event.target.matches("input,textarea")) updateHomepageWorking(event.target);
});
document.querySelector("#homepageEditorLeaveButton").addEventListener("click", () => {
  if (homepageDraftTimer) saveHomepageDraft();
  openHomepageSummary(activeHomepageSection);
});
document.querySelector("#homepageDoneButton").addEventListener("click", () => {
  if (!validateHomepageEditor()) return;
  if (homepageDraftTimer) saveHomepageDraft();
  openHomepageSummary(activeHomepageSection);
});
document.querySelector("#homepagePreviewButton").addEventListener("click", () => {
  if (!validateHomepageEditor()) return;
  if (homepageDraftTimer) saveHomepageDraft();
  renderHomepagePreview();
  showAppView("homepagePreviewView");
});
document.querySelector("#homepagePreviewBackButton").addEventListener("click", () => {
  renderHomepageEditor();
  showAppView("homepageEditorView");
});
document.querySelector("#discardHomepageChangesButton").addEventListener("click", () => {
  const section = homepageSections.find((item) => item.id === activeHomepageSection);
  if (!section || !confirm(`Discard changes to ${section.title}?`)) return;
  resetHomepageSection();
  setHomepageDraftStatus("Saving restored content\u2026");
});
document.querySelector("#openTreatmentsButton").addEventListener("click", () => {
  activeCategory = "signature";
  renderTreatments();
  showAppView("treatmentsView");
  history.pushState({ view: "treatments" }, "", "#treatments");
});
document.querySelector("#treatmentsBackButton").addEventListener("click", () => showAppView("dashboardView"));
document.querySelector("#summaryBackButton").addEventListener("click", () => {
  renderTreatments();
  showAppView("treatmentsView");
});
document.querySelectorAll('.treatment-tabs [role="tab"]').forEach((btn) => btn.addEventListener("click", () => {
  activeCategory = btn.dataset.category;
  renderTreatments();
}));
document.querySelector("#treatmentList").addEventListener("click", (event) => {
  const row = event.target.closest("[data-treatment-id]");
  if (row) openSummary(row.dataset.treatmentId);
});
document.querySelector("#addTreatmentButton").addEventListener("click", addTreatment);
document.querySelector("#editTreatmentButton").addEventListener("click", requestEditor);
document.querySelector("#treatmentEditorForm").addEventListener("input", () => {
  editorDirty = true;
  setDraftStatus("Saving\u2026");
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    writeDraft(currentRecord());
    editorDirty = true;
  }, 350);
});
document.querySelector("#editPrice").addEventListener("input", (event) => {
  if (!initialPriceLinked) return;
  const value = event.target.value.trim();
  document.querySelector("#editDetailedPricing").value = value ? `Initial treatment: ${value}` : "";
  document.querySelector("#initialPriceHint").textContent = "Uses the main price until you change this field.";
});
document.querySelector("#editDetailedPricing").addEventListener("input", (event) => {
  const price = document.querySelector("#editPrice").value.trim();
  initialPriceLinked = event.target.value.trim() === (price ? `Initial treatment: ${price}` : "");
  document.querySelector("#initialPriceHint").textContent = initialPriceLinked ? "Uses the main price until you change this field." : "Custom pricing";
});
document.querySelector("#editImage").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (sessionImageUrl) URL.revokeObjectURL(sessionImageUrl);
  sessionImageUrl = URL.createObjectURL(file);
  const img = document.querySelector("#editorImagePreview");
  img.src = sessionImageUrl;
  img.hidden = false;
  editorDirty = true;
  setDraftStatus("Photo selected for this preview only");
});
document.querySelector("#editorNextButton").addEventListener("click", () => {
  if (validateStep()) {
    flushDraft();
    editorDirty = true;
    editorStep = Math.min(4, editorStep + 1);
    renderEditorStep();
  }
});
document.querySelector("#editorPreviousButton").addEventListener("click", () => {
  flushDraft();
  editorDirty = true;
  editorStep = Math.max(0, editorStep - 1);
  renderEditorStep();
});
document.querySelector("#discardChangesButton").addEventListener("click", () => {
  const treatment = findTreatment(activeTreatmentId);
  if (!treatment) return;
  const isNew = newTreatmentIds.has(activeTreatmentId);
  if (!confirm(isNew ? `Discard this new treatment?` : `Discard unpublished changes to ${treatment.title}?`)) return;
  removeDraft(activeTreatmentId);
  editorDirty = false;
  if (isNew) {
    activeTreatmentId = null;
    renderTreatments();
    showAppView("treatmentsView");
    setDraftStatus("\u2713 New treatment discarded");
    return;
  }
  populateEditor(clone(treatment), 0);
  setDraftStatus("\u2713 Unpublished changes discarded");
});
document.querySelector("#editorPreviewButton").addEventListener("click", () => {
  const record = currentRecord();
  writeDraft(record);
  editorDirty = true;
  if (sessionImageUrl) record.imageData = sessionImageUrl;
  document.querySelector("#treatmentPreview").innerHTML = summaryMarkup(record, { preview: true });
  showAppView("previewView");
});
document.querySelector("#editorPublishButton").addEventListener("click", publishTreatments);
document.querySelector("#previewBackButton").addEventListener("click", () => showAppView("editorView"));
document.querySelector("#editorLeaveButton").addEventListener("click", () => requestLeave("summary"));
window.addEventListener("pagehide", () => {
  if (editorDirty) flushDraft();
  if (homepageDraftTimer) saveHomepageDraft();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (editorDirty) flushDraft();
    if (homepageDraftTimer) saveHomepageDraft();
  } else checkInactivity();
});
window.addEventListener("focus", checkInactivity);
window.addEventListener("pageshow", checkInactivity);
window.addEventListener("popstate", () => {
  if (!document.querySelector("#editorView").hidden) {
    flushDraft();
    leaveEditor("summary");
  }
});
setInterval(refreshDraftTimes, 3e4);
document.querySelector("#continueSecurelyButton").addEventListener("click", () => {
  resumeAfterLogin = true;
  const email = signedInAs.textContent.trim();
  if (email && email.includes("@")) document.querySelector("#loginEmail").value = email;
  document.querySelector("#loginPassword").value = "";
  showPanel("login");
  setTimeout(() => document.querySelector("#loginPassword").focus(), 0);
});
["pointerdown", "keydown", "touchstart", "input", "change"].forEach((eventName) => {
  document.addEventListener(eventName, recordActivity, { passive: true });
});
document.querySelector("#recoveryRequestButton").addEventListener("click", async () => {
  const emailInput = document.querySelector("#loginEmail");
  const message = document.querySelector("#recoveryRequestMessage");
  const email = emailInput.value.trim();
  if (!email) {
    emailInput.focus();
    message.textContent = "Enter your email address first, then select Forgotten your password?";
    message.hidden = false;
    return;
  }
  try {
    message.textContent = "Sending password reset email\u2026";
    message.hidden = false;
    await requestPasswordRecovery(email);
    message.textContent = "Password reset email sent. Check your inbox and spam folder.";
  } catch (error) {
    message.textContent = error?.message || "The password reset email could not be sent. Please try again.";
  }
});
async function initialiseAuthentication() {
  const heading = document.querySelector("#loadingPanel h1");
  const message = document.querySelector("#loadingPanel p:last-child");
  try {
    heading.textContent = "Checking your access\u2026";
    message.textContent = "Starting authentication\u2026";
    const hasIdentityToken = /^#(?:invite_token|recovery_token|confirmation_token)=/.test(window.location.hash);
    let callback = null;
    if (hasIdentityToken) {
      message.textContent = "Processing the secure email link\u2026";
      callback = await handleAuthCallback();
    }
    if (callback) {
      switch (callback.type) {
        case "invite":
          inviteToken = callback.token;
          showPanel("invite");
          return;
        case "recovery":
          clearIdentityCallbackUrl();
          showPanel("recovery");
          return;
        case "confirmation":
        case "email_change":
        case "oauth":
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
    const user = await getUser();
    user ? showSuccess(user) : showLogin();
  } catch (error) {
    showError(error);
  }
}
document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  showPanel("loading");
  try {
    showSuccess(await login(document.querySelector("#loginEmail").value.trim(), document.querySelector("#loginPassword").value));
  } catch (error) {
    showError(error);
  }
});
document.querySelector("#inviteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const password = document.querySelector("#invitePassword").value;
    passwordsMatch(password, document.querySelector("#invitePasswordConfirm").value);
    if (!inviteToken) throw new Error("The invitation token is missing or has expired. Request a new invitation and try again.");
    showPanel("loading");
    const user = await acceptInvite(inviteToken, password);
    inviteToken = null;
    clearIdentityCallbackUrl();
    showSuccess(user, "Your editor account is active.");
  } catch (error) {
    showError(error);
  }
});
document.querySelector("#recoveryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const password = document.querySelector("#recoveryPassword").value;
    passwordsMatch(password, document.querySelector("#recoveryPasswordConfirm").value);
    showPanel("loading");
    showSuccess(await updateUser({ password }), "Your password has been updated.");
  } catch (error) {
    showError(error);
  }
});
document.querySelector("#logoutButton").addEventListener("click", async () => {
  try {
    if (editorDirty && currentAppView() === "editorView") flushDraft();
    if (homepageDraftTimer) await saveHomepageDraft();
    clearTimeout(inactivityTimer);
    resumeAfterLogin = false;
    lockContext = null;
    inactivityLocked = false;
    document.querySelector("#inactivityLock").hidden = true;
    setAppInert(false);
    await logout();
    showLogin();
  } catch (error) {
    showError(error);
  }
});
document.querySelector("#retryButton").addEventListener("click", () => {
  clearIdentityCallbackUrl();
  showLogin();
});
var SECTION_API = "/.netlify/functions/site-section";
var activeSiteSection = null;
var siteSectionOriginal = null;
var siteSectionWorking = null;
var siteSectionSaveTimer = null;
var siteSectionSaving = false;
var sectionDefinitions = {
  aftercare: { title: "Aftercare", description: "Update the healing guide wording while keeping the approved artwork.", publicTab: "aftercare", fields: [
    { path: "eyebrow", label: "Small heading", required: true },
    { path: "heading", label: "Main heading", required: true },
    { path: "intro", label: "Introduction", type: "textarea", required: true },
    { path: "stages", label: "Healing stages", type: "stages", help: "One line per stage: Day | Description" }
  ] },
  gallery: { title: "Gallery", description: "Manage approved gallery entries. Image paths can be connected now; direct uploads remain a later enhancement.", publicTab: "gallery", fields: [
    { path: "eyebrow", label: "Small heading", required: true },
    { path: "heading", label: "Main heading", required: true },
    { path: "intro", label: "Introduction", type: "textarea", required: true },
    { path: "items", label: "Gallery entries", type: "gallery", help: "One line per image: Title | Caption | Image path | Alt text | Show yes/no" }
  ] },
  merchandise: { title: "Merchandise", description: "Update merchandise details, image paths and the display order.", publicTab: "merchandise", fields: [
    { path: "eyebrow", label: "Small heading", required: true },
    { path: "heading", label: "Main heading", required: true },
    { path: "intro", label: "Introduction", type: "textarea", required: true },
    { path: "categories", label: "Merchandise items", type: "categories", help: "One line per item, in display order: Title | Description | Price or availability | Image path or URL | Image alt text | Show yes/no" }
  ] },
  booking: { title: "Booking", description: "Update Square booking details and the client eligibility wording.", publicTab: "booking", fields: [
    { path: "eyebrow", label: "Small heading", required: true },
    { path: "heading", label: "Main heading", required: true },
    { path: "intro", label: "Introduction", type: "textarea", required: true },
    { path: "studioNote", label: "Studio note", type: "textarea" },
    { path: "bookingUrl", label: "Square booking link", required: true },
    { path: "eligibilityHeading", label: "Eligibility heading" },
    { path: "clientTypeQuestion", label: "Client question", type: "textarea" },
    { path: "newClientMessage", label: "New-client message", type: "textarea" },
    { path: "returningClientMessage", label: "Returning-client message", type: "textarea" },
    { path: "ageConfirmation", label: "Age confirmation", type: "textarea" },
    { path: "patchConfirmation", label: "Patch-test confirmation", type: "textarea" },
    { path: "newClientButtonText", label: "New-client button" },
    { path: "returningClientButtonText", label: "Returning-client button" },
    { path: "complianceNote", label: "Compliance note", type: "textarea" },
    { path: "securityNote", label: "Security note", type: "textarea" }
  ] },
  contact: { title: "Contact", description: "Update contact details and opening hours.", publicTab: "contact", fields: [
    { path: "eyebrow", label: "Small heading", required: true },
    { path: "heading", label: "Main heading", required: true },
    { path: "intro", label: "Introduction", type: "textarea", required: true },
    { path: "contact.heading", label: "Contact card heading" },
    { path: "contact.email", label: "Email address", required: true },
    { path: "contact.phone", label: "Phone number" },
    { path: "contact.instagram", label: "Instagram" },
    { path: "hours.heading", label: "Hours heading" },
    { path: "hours.lines", label: "Opening hours", type: "lines", help: "One line for each opening-hours message." }
  ] },
  privacy: { title: "Policies", description: "Update privacy, suitability and cancellation information.", publicTab: "privacy", fields: [
    { path: "eyebrow", label: "Small heading", required: true },
    { path: "heading", label: "Main heading", required: true },
    { path: "intro", label: "Introduction", type: "textarea", required: true },
    { path: "sections", label: "Policy sections", type: "policies", help: "One line per section: Heading | Policy wording" }
  ] },
  site: { title: "Settings", description: "Update website-wide title, description and footer details.", publicTab: "home", fields: [
    { path: "businessName", label: "Business name", required: true },
    { path: "pageTitle", label: "Browser page title", required: true },
    { path: "metaDescription", label: "Search description", type: "textarea", required: true },
    { path: "footerText", label: "Footer wording", required: true }
  ] }
};
function getPath(obj, path) {
  return path.split(".").reduce((value, key) => value?.[key], obj);
}
function setPath(obj, path, value) {
  const parts = path.split(".");
  let target = obj;
  parts.slice(0, -1).forEach((key) => target = target[key] ??= {});
  target[parts.at(-1)] = value;
}
function serializeSectionField(field, value) {
  if (field.type === "lines") return (value || []).join("\n");
  if (field.type === "stages") return (value || []).map((item) => `${item.day || ""} | ${item.text || ""}`).join("\n");
  if (field.type === "priceGroups") return (value || []).flatMap((group) => (group.items || []).map((item) => `${group.title || ""} | ${item.name || ""} | ${item.price || ""} | ${item.time || ""}`)).join("\n");
  if (field.type === "gallery") return (value || []).map((item) => `${item.title || ""} | ${item.caption || ""} | ${item.image || ""} | ${item.alt || ""} | ${item.visible === false ? "no" : "yes"}`).join("\n");
  if (field.type === "categories") return (value || []).map((item) => `${item.title || ""} | ${item.description || ""} | ${item.price || ""} | ${item.image || ""} | ${item.alt || item.imageAlt || ""} | ${item.visible === false ? "no" : "yes"}`).join("\n");
  if (field.type === "policies") return (value || []).map((item) => `${item.heading || ""} | ${item.text || ""}`).join("\n");
  return value ?? "";
}
function splitParts(line, count) {
  const parts = line.split("|").map((part) => part.trim());
  while (parts.length < count) parts.push("");
  return parts;
}
function parseSectionField(field, value, current) {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (field.type === "lines") return lines;
  if (field.type === "stages") return lines.map((line, index) => {
    const [day, text] = splitParts(line, 2);
    return { ...current?.[index] || {}, day, text };
  });
  if (field.type === "priceGroups") {
    const groups = [];
    lines.forEach((line) => {
      const [groupTitle, name, price, time] = splitParts(line, 4);
      let group = groups.find((item) => item.title === groupTitle);
      if (!group) {
        group = { title: groupTitle, items: [] };
        groups.push(group);
      }
      group.items.push({ name, price, time });
    });
    return groups;
  }
  if (field.type === "gallery") return lines.map((line) => {
    const [title, caption, image, alt, visible] = splitParts(line, 5);
    return { title, caption, image, alt, visible: visible.toLowerCase() !== "no" };
  });
  if (field.type === "categories") return lines.map((line, index) => {
    const previous = current?.[index] || {};
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length <= 3) {
      const [title2, description2, visible2] = splitParts(line, 3);
      return { ...previous, title: title2, description: description2, visible: visible2.toLowerCase() !== "no", order: index };
    }
    const [title, description, price, image, alt, visible] = splitParts(line, 6);
    return { ...previous, title, description, price, image, alt, visible: visible.toLowerCase() !== "no", order: index };
  });
  if (field.type === "policies") return lines.map((line) => {
    const [heading, text] = splitParts(line, 2);
    return { heading, text };
  });
  return value;
}
function sectionFieldMarkup(field) {
  const value = serializeSectionField(field, getPath(siteSectionWorking, field.path));
  const multiline = field.type === "textarea" || ["lines", "stages", "priceGroups", "gallery", "categories", "policies"].includes(field.type);
  return `<label><span>${escapeHtml(field.label)}</span>${multiline ? `<textarea data-section-path="${escapeHtml(field.path)}" rows="${field.type === "textarea" ? 5 : 8}" ${field.required ? "required" : ""}>${escapeHtml(value)}</textarea>` : `<input data-section-path="${escapeHtml(field.path)}" type="text" value="${escapeHtml(value)}" ${field.required ? "required" : ""} />`}${field.help ? `<small>${escapeHtml(field.help)}</small>` : ""}</label>`;
}
function renderSiteSectionEditor() {
  const def = sectionDefinitions[activeSiteSection];
  document.querySelector("#sectionEditorTitle").textContent = def.title;
  document.querySelector("#sectionEditorDescription").textContent = def.description;
  const addMerchandise = activeSiteSection === "merchandise" ? '<button id="addMerchandiseItemButton" class="add-section-item-button" type="button"><span aria-hidden="true">+</span><strong>Add merchandise item</strong></button>' : "";
  document.querySelector("#sectionEditorFields").innerHTML = def.fields.map(sectionFieldMarkup).join("") + addMerchandise;
  setSectionStatus("\u2713 Autosave on");
}
function setSectionStatus(message, type = "") {
  const el = document.querySelector("#sectionEditorStatus");
  el.textContent = message;
  el.classList.toggle("error", type === "error");
  el.classList.toggle("success", type === "success");
}
async function fetchSection(section, draft = false) {
  const response = await fetch(`${SECTION_API}?section=${encodeURIComponent(section)}${draft ? "&draft=1" : ""}`, { cache: "no-store", credentials: "same-origin" });
  if (response.status === 404) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "This section could not be loaded.");
  return result.data;
}
async function openSiteSection(section) {
  activeSiteSection = section;
  setSectionStatus("Loading\u2026");
  try {
    const published = await fetchSection(section, false).catch(() => null) || await fetch(`/content/${section}.json`, { cache: "no-store" }).then((r) => r.json());
    siteSectionOriginal = clone(published);
    delete siteSectionOriginal.schemaVersion;
    delete siteSectionOriginal.updatedAt;
    const draft = await fetchSection(section, true).catch(() => null);
    siteSectionWorking = clone(draft?.content || siteSectionOriginal);
    renderSiteSectionEditor();
    showAppView("sectionEditorView");
    history.pushState({ view: "section-editor", section }, "", `#manage-${section}`);
  } catch (error) {
    setSectionStatus(error.message, "error");
  }
}
function updateSiteSectionFromForm() {
  const def = sectionDefinitions[activeSiteSection];
  def.fields.forEach((field) => {
    const input = document.querySelector(`[data-section-path="${field.path}"]`);
    setPath(siteSectionWorking, field.path, parseSectionField(field, input.value, getPath(siteSectionWorking, field.path)));
  });
}
function validateSiteSection() {
  const invalid = [...document.querySelectorAll("#sectionEditorForm [required]")].find((field) => !field.value.trim());
  if (invalid) {
    invalid.focus();
    setSectionStatus("Please complete the highlighted field.", "error");
    return false;
  }
  return true;
}
async function saveSiteSectionDraft() {
  clearTimeout(siteSectionSaveTimer);
  siteSectionSaveTimer = null;
  if (siteSectionSaving) return;
  siteSectionSaving = true;
  updateSiteSectionFromForm();
  setSectionStatus("Saving online\u2026");
  try {
    const response = await fetch(`${SECTION_API}?section=${encodeURIComponent(activeSiteSection)}&draft=1`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ content: siteSectionWorking }) });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      lockManager();
      return;
    }
    if (!response.ok) throw new Error(result.error || "Draft could not be saved.");
    setSectionStatus(`\u2713 Saved online \xB7 ${relativeTime(result.savedAt)}`, "success");
  } catch (error) {
    setSectionStatus("Could not save online \u2014 your changes remain on this screen.", "error");
  } finally {
    siteSectionSaving = false;
  }
}
function scheduleSiteSectionSave() {
  clearTimeout(siteSectionSaveTimer);
  setSectionStatus("Saving online\u2026");
  siteSectionSaveTimer = setTimeout(saveSiteSectionDraft, 650);
}
function addMerchandiseItem() {
  if (activeSiteSection !== "merchandise") return;
  updateSiteSectionFromForm();
  const items = Array.isArray(siteSectionWorking.categories) ? siteSectionWorking.categories : [];
  items.push({ title: "New merchandise item", description: "Add a short description for this item.", price: "", image: "", alt: "", visible: false, order: items.length });
  siteSectionWorking.categories = items;
  renderSiteSectionEditor();
  scheduleSiteSectionSave();
  document.querySelector('[data-section-path="categories"]')?.focus();
}
function previewSiteSection() {
  if (!validateSiteSection()) return;
  updateSiteSectionFromForm();
  localStorage.setItem(`eb-section-preview:${activeSiteSection}`, JSON.stringify(siteSectionWorking));
  rememberPreviewReturn();
  const tab = sectionDefinitions[activeSiteSection].publicTab;
  window.open(`/?preview=${encodeURIComponent(activeSiteSection)}#${tab}`, "_blank", "noopener");
}
async function publishSiteSection() {
  if (!validateSiteSection()) return;
  updateSiteSectionFromForm();
  if (siteSectionSaveTimer) await saveSiteSectionDraft();
  if (!confirm(`Publish ${sectionDefinitions[activeSiteSection].title} to the live website?`)) return;
  const button = document.querySelector("#sectionPublishButton");
  button.disabled = true;
  button.textContent = "Publishing\u2026";
  setSectionStatus("Publishing\u2026");
  try {
    const endpoint = `${SECTION_API}?section=${encodeURIComponent(activeSiteSection)}`;
    const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ content: siteSectionWorking }) });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      lockManager();
      return;
    }
    if (!response.ok) throw new Error(result.error || "This section could not be published.");
    const verificationResponse = await fetch(verifiedFetchUrl(endpoint), { cache: "no-store", credentials: "same-origin" });
    const verification = await verificationResponse.json().catch(() => ({}));
    if (!verificationResponse.ok || !verification?.data || verification.data.updatedAt !== result?.data?.updatedAt) {
      throw new Error("The publish could not be verified. Your draft has been kept safely.");
    }
    siteSectionOriginal = clone(verification.data);
    delete siteSectionOriginal.schemaVersion;
    delete siteSectionOriginal.updatedAt;
    siteSectionWorking = clone(siteSectionOriginal);
    setSectionStatus("\u2713 Published and verified. The live website now uses these changes.", "success");
  } catch (error) {
    setSectionStatus(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Publish";
  }
}
document.querySelectorAll("[data-open-section]").forEach((button) => button.addEventListener("click", () => openSiteSection(button.dataset.openSection)));
document.querySelector("#sectionEditorForm").addEventListener("input", scheduleSiteSectionSave);
document.querySelector("#sectionEditorForm").addEventListener("click", (event) => {
  if (event.target.closest("#addMerchandiseItemButton")) addMerchandiseItem();
});
document.querySelector("#sectionBackButton").addEventListener("click", () => {
  if (siteSectionSaveTimer) saveSiteSectionDraft();
  showAppView("dashboardView");
});
document.querySelector("#sectionPreviewButton").addEventListener("click", previewSiteSection);
document.querySelector("#sectionPublishButton").addEventListener("click", publishSiteSection);
initialiseAuthentication();
