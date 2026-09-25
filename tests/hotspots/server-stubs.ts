/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated test adapters; never included in the production app. */
export const getSql = () => (globalThis as any).__sql;
export const ensureSchema = async () => {};
export const getCurrentAdmin = async () => (globalThis as any).__admin;
export const withAdminTracking = (fn:any) => fn;
