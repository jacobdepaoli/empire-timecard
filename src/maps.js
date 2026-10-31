// ─── Google Maps JS loader ───────────────────────────────────────────────────
// Restrict this key by HTTP referrer in the Google Cloud console for production.
const KEY =
  import.meta.env.VITE_GOOGLE_MAPS_KEY || "AIzaSyCvleAlfV65M9bL5XQ3yrb-6hYPglKCGUA"

let _promise = null

export function loadGoogleMaps() {
  if (typeof window !== "undefined" && window.google?.maps) {
    return Promise.resolve(window.google.maps)
  }
  if (_promise) return _promise
  _promise = new Promise((resolve, reject) => {
    const cb = "__tcMapsReady"
    window[cb] = () => resolve(window.google.maps)
    const s = document.createElement("script")
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&callback=${cb}`
    s.async = true
    s.defer = true
    s.onerror = () => reject(new Error("Failed to load Google Maps"))
    document.head.appendChild(s)
  })
  return _promise
}

// Reno, NV — default map center
export const DEFAULT_CENTER = { lat: 39.5296, lng: -119.8138 }
