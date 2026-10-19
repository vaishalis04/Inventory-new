import { useSyncExternalStore } from "react";
import { extractList } from "../api/http";
import {
  listBoxes, listCategories, listItems, listPrinters, listSuppliers, listUsers, listWarehouses,
} from "../api/inventory.api";

/** id -> display name maps for every master-data entity, so the UI never has to show raw ids. */
let maps = {};
let version = 0;
let lastLoad = 0;
let inflight = null;
const subs = new Set();

const label = {
  warehouse: (r) => r.name,
  category: (r) => r.name,
  supplier: (r) => r.name,
  printer: (r) => r.name,
  user: (r) => r.name || r.full_name || r.email || r.username,
  item: (r) => (r.model && r.model !== r.name ? `${r.name} (${r.model})` : r.name),
  box: (r) => r.code ?? r.box_code,
};

const loaders = {
  warehouse: () => listWarehouses(),
  category: () => listCategories(),
  supplier: () => listSuppliers(),
  printer: () => listPrinters(),
  user: () => listUsers(), // may be 403 for non-admins — handled below
  item: () => listItems({ limit: 500 }),
  box: () => listBoxes({ limit: 500 }),
};

export function loadLookups(force = false) {
  if (inflight) return inflight;
  if (!force && Date.now() - lastLoad < 20_000) return Promise.resolve();
  const names = Object.keys(loaders);
  inflight = Promise.allSettled(names.map((n) => loaders[n]()))
    .then((results) => {
      const next = { ...maps };
      results.forEach((res, i) => {
        if (res.status !== "fulfilled") return;
        const name = names[i];
        const map = {};
        extractList(res.value).forEach((r) => {
          const text = label[name](r);
          if (r.id != null && text) map[String(r.id)] = text;
        });
        next[name] = map;
      });
      maps = next;
      lastLoad = Date.now();
      version++;
      subs.forEach((f) => f());
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function clearLookups() {
  maps = {}; lastLoad = 0; version++; subs.forEach((f) => f());
}

/** Subscribe a component so it re-renders when names finish loading. */
export function useLookups() {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => version,
    () => version
  );
}

const USER_KEY = /^(user|created_by|updated_by|performed_by|counted_by|received_by|approved_by|assigned_to)(_id)?$/;

/** Which entity does a field like "to_warehouse_id" or "created_by" point to? */
export function entityFor(key) {
  const k = String(key).toLowerCase().replace(/^(from|to|source|destination|dest|new|old|target)_/, "");
  if (USER_KEY.test(k)) return "user";
  return k.match(/^(warehouse|category|supplier|printer|item|box)_id$/)?.[1] ?? null;
}

export function resolveName(key, value) {
  const e = entityFor(key);
  if (!e || value === null || value === undefined || value === "") return null;
  return maps[e]?.[String(value)] ?? null;
}

/** Should this scalar field be shown at all? Ids that can't be turned into a name are hidden. */
export function showField(key, value, siblings = {}) {
  const k = String(key).toLowerCase();
  if (k === "id" || /^(company|tenant|organization|org)_id$/.test(k)) return false;
  const base = k.replace(/_id$/, "");
  if (k.endsWith("_id") && siblings[base] && typeof siblings[base] === "object") return false; // object already shows the name
  if (k.endsWith("_id") || (entityFor(k) === "user" && typeof value === "number")) {
    return resolveName(key, value) !== null;
  }
  return true;
}
