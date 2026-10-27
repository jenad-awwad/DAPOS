const PRODUCTION_API = "https://dapos.up.railway.app";

export const API_URL = (() => {
  if (__DEV__ && typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? "http://127.0.0.1:3000" : PRODUCTION_API);
})();
