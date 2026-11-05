/** Client-side pagination for lists the server returns in full (Low Stock, Users, Categories). */
export const pageSlice = (rows, page, limit) => rows.slice((page - 1) * limit, page * limit);
