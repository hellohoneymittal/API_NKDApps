const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/script.send_mail",
  "https://www.googleapis.com/auth/script.external_request",
];

export const GOOGLE_REDIRECT_URI =
  "https://natures-api.nkd-community-gzb.workers.dev/oauth/callback";

export async function READ_SECRET(env, name) {
  const value = env[name];

  if (typeof value === "string") {
    return value;
  }

  const binding = env[`${name}_STORE`] || value;

  if (binding && typeof binding.get === "function") {
    const value = await binding.get();

    if (typeof value === "string") {
      return value;
    }
  }

  if (binding == null) {
    return undefined;
  }

  throw new Error(
    `${name} must be a string or a readable Secrets Store binding`,
  );
}

export async function getGoogleOAuthUrls(env, state) {
  const clientId = await READ_SECRET(env, "APP_CLIENT_ID");
  const clientSecret = await READ_SECRET(env, "APP_CLIENT_SECRET");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "select_account consent",
    scope: GOOGLE_SCOPES.join(" "),
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function createOAuthState() {
  return crypto.randomUUID();
}

export async function getGoogleAccessTokenAppscript(env) {
  const clientId = await READ_SECRET(env, "APP_CLIENT_ID");
  const clientSecret = await READ_SECRET(env, "APP_CLIENT_SECRET");
  const refreshToken = await READ_SECRET(env, "APP_REFRESH_TOKEN");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      `Google access token refresh failed: ${JSON.stringify(data)}`,
    );
  }

  return data.access_token;
}

export async function exchangeGoogleCode(code, env) {
  const clientId = await READ_SECRET(env, "APP_CLIENT_ID");
  const clientSecret = await READ_SECRET(env, "APP_CLIENT_SECRET");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${JSON.stringify(data)}`);
  }

  return data;
}
