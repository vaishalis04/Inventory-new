
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5900/api";

const TOKEN_KEY = "inventory_token";

export const apiBaseUrl = API_BASE_URL;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest(path, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.body !== undefined
      ? { "Content-Type": "application/json" }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Check that the backend is running and CORS allows this origin."
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (
    !response.ok ||
    (body && typeof body === "object" && body.success === false)
  ) {
    const message =
      (body && body.message) ||
      (typeof body === "string" && body.slice(0, 200)) ||
      `Request failed (${response.status})`;

    const error = new Error(message);
    error.status = response.status;
    error.details = body?.details;

    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("auth:logout"));
    }

    throw error;
  }

  return body;
}

export const get = (path) => apiRequest(path);

export const post = (path, data) =>
  apiRequest(path, {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });

export const put = (path, data) =>
  apiRequest(path, {
    method: "PUT",
    body: JSON.stringify(data ?? {}),
  });

export const patch = (path, data) =>
  apiRequest(path, {
    method: "PATCH",
    body: JSON.stringify(data ?? {}),
  });

export const del = (path) =>
  apiRequest(path, {
    method: "DELETE",
  });

/**
 * Stock adjustment API.
 * Sends performed_by explicitly and preserves other fields.
 */
export async function postStockAdjustment(path, payload) {
  const performedBy = String(
    payload?.performed_by ?? ""
  ).trim();

  if (!performedBy) {
    throw new Error(
      "Please enter the name of the person performing this adjustment."
    );
  }

  const requestBody = {
    ...payload,
    performed_by: performedBy,
  };

  return post(path, requestBody);
}

/** Build a query string, skipping empty values. */
export function qs(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== "" &&
      value !== null &&
      value !== undefined
    ) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();

  return query ? `?${query}` : "";
}

/**
 * Accept supported list response formats:
 * array
 * { data: [] }
 * { data: { items: [] } }
 * { data: { rows: [] } }
 * { data: { results: [] } }
 */
export function extractList(result) {
  const data = result?.data ?? result;

  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object") {
    for (const key of [
      "items",
      "rows",
      "results",
      "records",
    ]) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }

    const firstArray = Object.values(data).find(
      Array.isArray
    );

    if (firstArray) {
      return firstArray;
    }
  }

  return [];
}

/** Find a displayable QR image in a response object. */
export function findQrImage(obj) {
  if (!obj) return null;

  if (typeof obj === "string") {
    return obj.startsWith("data:image/") ? obj : null;
  }

  if (typeof obj !== "object") {
    return null;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "string") {
      continue;
    }

    if (value.startsWith("data:image/")) {
      return value;
    }

    if (
      /qr|image|base64|png/i.test(key) &&
      value.length > 100 &&
      /^[A-Za-z0-9+/=\s]+$/.test(value)
    ) {
      return `data:image/png;base64,${value}`;
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findQrImage(value);

      if (found) {
        return found;
      }
    }
  }

  return null;
}
