const SESSION_KEY = "pm_session";

export const checkCredentials = (username: string, password: string) =>
  username === "user" && password === "password";

export const getSession = (): boolean => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SESSION_KEY) === "1";
};

export const setSession = (): void => localStorage.setItem(SESSION_KEY, "1");

export const clearSession = (): void => localStorage.removeItem(SESSION_KEY);
