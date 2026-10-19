import { get, post } from "./http";

export const register = (payload) => post("/auth/register", payload);
export const login = (payload) => post("/auth/login", payload);
export const getMe = () => get("/auth/me");
