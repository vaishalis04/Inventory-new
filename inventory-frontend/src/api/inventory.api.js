
import {
  get,
  post,
  put,
  patch,
  del,
  getToken,
  apiBaseUrl,
  qs,
} from "./http";

export const health = () => get("/health");
export const dashboard = () => get("/dashboard");

// Items
export const listItems = (params) => get(`/items${qs(params)}`);
export const getItem = (id) => get(`/items/${id}`);
export const createItem = (payload) => post("/items", payload);
export const updateItem = (id, payload) => put(`/items/${id}`, payload);
export const deleteItem = (id) => del(`/items/${id}`);
export const getItemQr = (id) => get(`/items/${id}/qr`);
export const printItemLabels = (id, payload) =>
  post(`/items/${id}/print`, payload);

// Inventory
export const receiveStock = (payload) =>
  post("/inventory/receive", payload);

export const getStock = (params) =>
  get(`/inventory/stock${qs(params)}`);

export const getMovements = (params) =>
  get(`/inventory/movements${qs(params)}`);

// Edit a movement (quantity / note / reference). Stock, box, units and
// later balances are recalculated by the server.
export const updateMovement = (id, payload) =>
  put(`/inventory/movements/${id}`, payload);

// Delete a movement and reverse its effect everywhere.
export const deleteMovement = (id) =>
  del(`/inventory/movements/${id}`);

// Delete a stock record with its boxes, units and movements.
export const deleteStock = (id) => del(`/inventory/stock/${id}`);

export const getLowStock = () => get("/inventory/low-stock");

export const transferStock = (payload) =>
  post("/inventory/transfer", payload);

export const countStock = (payload) =>
  post("/inventory/count", payload);

// Scan and adjustment
export const scanCode = (code) =>
  get(`/scan/${encodeURIComponent(code)}`);

export const adjustScannedCode = async (code, payload) => {
  const requestId = `adjust-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const requestPayload = {
    ...payload,
    performed_by: String(payload?.performed_by ?? "").trim(),
    _debug_request_id: requestId,
  };

  const url = `/scan/${encodeURIComponent(code)}/adjust`;

  console.log("ADJUSTMENT REQUEST SENT:", {
    requestId,
    url,
    payload: requestPayload,
    serializedBody: JSON.stringify(requestPayload),
  });

  return post(url, requestPayload);
};

// Boxes
export const listBoxes = (params) => get(`/boxes${qs(params)}`);

export const updateBox = (code, payload) =>
  patch(`/boxes/${encodeURIComponent(code)}`, payload);

export const deleteBox = (code) =>
  del(`/boxes/${encodeURIComponent(code)}`);

export const getBoxQr = (code) =>
  get(`/boxes/${encodeURIComponent(code)}/qr`);

export const printBoxLabels = (code, payload) =>
  post(`/boxes/${encodeURIComponent(code)}/print`, payload);

// Warehouses
export const listWarehouses = (params) =>
  get(`/warehouses${qs(params)}`);

export const createWarehouse = (payload) =>
  post("/warehouses", payload);

export const updateWarehouse = (id, payload) =>
  put(`/warehouses/${id}`, payload);

// cascade=true also deletes the warehouse's stock, boxes, units and movements.
export const deleteWarehouse = (id, cascade = false) =>
  del(`/warehouses/${id}${cascade ? "?cascade=true" : ""}`);

// Categories
const extractCategoryRows = (response) => {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.data?.data)) {
    return response.data.data;
  }

  if (Array.isArray(response?.categories)) {
    return response.categories;
  }

  return [];
};

const extractCategoryMeta = (response) => {
  return (
    response?.meta ||
    response?.data?.meta ||
    response?.pagination ||
    response?.data?.pagination ||
    {}
  );
};

/**
 * Fetch all categories across every pagination page.
 *
 * Supports API responses such as:
 * {
 *   success: true,
 *   data: [...],
 *   meta: { total: 78, page: 1, limit: 20 }
 * }
 *
 * Returns a response compatible with extractList(response).
 */
export const listCategories = async () => {
  const requestedLimit = 200;

  const firstResponse = await get(
    `/categories${qs({ page: 1, limit: requestedLimit })}`
  );

  const firstRows = extractCategoryRows(firstResponse);
  const firstMeta = extractCategoryMeta(firstResponse);

  const total = Number(firstMeta.total ?? firstMeta.count ?? firstRows.length);
  const pageLimit = Math.max(
    1,
    Number(firstMeta.limit ?? requestedLimit)
  );

  const reportedPage = Math.max(1, Number(firstMeta.page ?? 1));
  const totalPages = Math.max(
    1,
    Math.ceil(total / pageLimit)
  );

  // If pagination metadata is missing, return the response as received.
  if (!Number.isFinite(total) || !firstMeta.total) {
    return {
      ...firstResponse,
      data: firstRows,
    };
  }

  const allCategories = [...firstRows];

  // Fetch the remaining pages sequentially.
  for (
    let page = reportedPage + 1;
    page <= totalPages;
    page += 1
  ) {
    const response = await get(
      `/categories${qs({ page, limit: pageLimit })}`
    );

    const rows = extractCategoryRows(response);

    if (rows.length === 0) {
      break;
    }

    allCategories.push(...rows);
  }

  return {
    ...firstResponse,
    data: allCategories,
    meta: {
      ...firstMeta,
      total: allCategories.length,
      page: 1,
      limit: allCategories.length,
      totalPages: 1,
    },
  };
};

export const createCategory = (payload) =>
  post("/categories", payload);

export const updateCategory = (id, payload) =>
  put(`/categories/${id}`, payload);

export const deleteCategory = (id) => del(`/categories/${id}`);

// Suppliers
export const listSuppliers = (params) =>
  get(`/suppliers${qs(params)}`);

export const createSupplier = (payload) =>
  post("/suppliers", payload);

export const updateSupplier = (id, payload) =>
  put(`/suppliers/${id}`, payload);

export const deleteSupplier = (id) => del(`/suppliers/${id}`);

// Printers
export const listPrinters = () => get("/printers");

export const createPrinter = (payload) =>
  post("/printers", payload);

export const updatePrinter = (id, payload) =>
  put(`/printers/${id}`, payload);

export const deletePrinter = (id) => del(`/printers/${id}`);

// Print jobs
export const listPrintJobs = () => get("/print/jobs");

// Users
export const listUsers = (params) =>
  get(`/users${qs(params)}`);

export const createUser = (payload) =>
  post("/users", payload);

export const updateUser = (id, payload) =>
  put(`/users/${id}`, payload);

export const deleteUser = (id) => del(`/users/${id}`);

/**
 * Fetch the protected HTML label sheet and open it in a new tab.
 */
export async function openPrintSheet(jobId) {
  const win = window.open("", "_blank");

  try {
    const token = getToken();

    const response = await fetch(
      `${apiBaseUrl}/print/jobs/${jobId}/sheet`,
      {
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {},
      }
    );

    if (!response.ok) {
      throw new Error(
        `Unable to load print sheet (${response.status})`
      );
    }

    const html = await response.text();

    const url = URL.createObjectURL(
      new Blob([html], { type: "text/html" })
    );

    if (win) {
      win.location.href = url;
    } else {
      window.open(url, "_blank");
    }

    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    if (win) {
      win.close();
    }

    throw err;
  }
}
