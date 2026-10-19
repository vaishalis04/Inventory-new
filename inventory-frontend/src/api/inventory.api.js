import { get, post, put, patch, del, getToken, apiBaseUrl, qs } from "./http";

export const health = () => get("/health");
export const dashboard = () => get("/dashboard");

export const listItems = (params) => get(`/items${qs(params)}`);
export const getItem = (id) => get(`/items/${id}`);
export const createItem = (payload) => post("/items", payload);
export const updateItem = (id, payload) => put(`/items/${id}`, payload);
export const getItemQr = (id) => get(`/items/${id}/qr`);
export const printItemLabels = (id, payload) => post(`/items/${id}/print`, payload);

export const receiveStock = (payload) => post("/inventory/receive", payload);
export const getStock = (params) => get(`/inventory/stock${qs(params)}`);
export const getMovements = (params) => get(`/inventory/movements${qs(params)}`);
export const getLowStock = () => get("/inventory/low-stock");
export const transferStock = (payload) => post("/inventory/transfer", payload);
export const countStock = (payload) => post("/inventory/count", payload);

export const scanCode = (code) => get(`/scan/${encodeURIComponent(code)}`);
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

export const listBoxes = (params) => get(`/boxes${qs(params)}`);
export const updateBox = (code, payload) => patch(`/boxes/${encodeURIComponent(code)}`, payload);
export const getBoxQr = (code) => get(`/boxes/${encodeURIComponent(code)}/qr`);
export const printBoxLabels = (code, payload) =>
  post(`/boxes/${encodeURIComponent(code)}/print`, payload);

export const listWarehouses = (params) => get(`/warehouses${qs(params)}`);
export const createWarehouse = (payload) => post("/warehouses", payload);
export const updateWarehouse = (id, payload) => put(`/warehouses/${id}`, payload);
export const deactivateWarehouse = (id) => del(`/warehouses/${id}`);

export const listCategories = () => get("/categories");
export const createCategory = (payload) => post("/categories", payload);
export const listSuppliers = (params) => get(`/suppliers${qs(params)}`);
export const createSupplier = (payload) => post("/suppliers", payload);
export const listPrinters = () => get("/printers");
export const createPrinter = (payload) => post("/printers", payload);

export const listPrintJobs = () => get("/print/jobs");

export const listUsers = () => get("/users");
export const createUser = (payload) => post("/users", payload);


/** Fetch the (possibly protected) HTML label sheet and open it in a new tab. */
export async function openPrintSheet(jobId) {
  const win = window.open("", "_blank"); // open synchronously to avoid popup blockers
  try {
    const token = getToken();
    const response = await fetch(`${apiBaseUrl}/print/jobs/${jobId}/sheet`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(`Unable to load print sheet (${response.status})`);
    const html = await response.text();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    if (win) win.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}
