// ─── Photo helpers: shrink on the phone before upload, signed links to view ───
import { supabase } from "./supabase.js"

// Phone photos are 3–8 MB. Resize to max 1600px and re-encode as JPEG (~300 KB).
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    const c = document.createElement("canvas"); c.width = w; c.height = h
    c.getContext("2d").drawImage(img, 0, 0, w, h)
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", quality))
    return { blob, w, h }
  } finally { URL.revokeObjectURL(url) }
}

// Upload one photo to a private bucket; returns { path, w, h }.
export async function uploadPhoto(bucket, folder, file) {
  const { blob, w, h } = await compressImage(file)
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: "image/jpeg" })
  if (error) throw error
  return { path, w, h }
}

// Signed links last an hour; cache them so scrolling doesn't re-request.
// A "path" that is already a full https link (sample/demo photos) is used as-is.
const cache = new Map()
export const isLink = (p) => /^https?:\/\//.test(p || "")
export async function signedUrls(bucket, paths) {
  const now = Date.now()
  paths.filter(isLink).forEach((p) => cache.set(bucket + p, { url: p, exp: Infinity }))
  const need = paths.filter((p) => !isLink(p) && !(cache.get(bucket + p)?.exp > now))
  if (need.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(need, 3600)
    ;(data || []).forEach((d) => d.signedUrl && cache.set(bucket + d.path, { url: d.signedUrl, exp: now + 3300 * 1000 }))
  }
  return Object.fromEntries(paths.map((p) => [p, cache.get(bucket + p)?.url]))
}

export const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" })
}
