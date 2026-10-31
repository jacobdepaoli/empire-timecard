// ─── Tiny hash router: #/tool/sub/path ───────────────────────────────────────
// Hash routes work on any static host and keep the phone's back gesture working.
import { useEffect, useState } from "react"

const read = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent)

export function useRoute() {
  const [parts, setParts] = useState(read)
  useEffect(() => {
    const onChange = () => { setParts(read()); window.scrollTo(0, 0) }
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return parts
}

export const go = (path = "") => { location.hash = "/" + path }
