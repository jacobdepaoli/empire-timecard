import { useEffect, useState } from "react"

// True on phone-width screens; inventory swaps tables for touch-friendly lists there.
const QUERY = "(max-width: 640px)"
export default function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches)
  useEffect(() => {
    const m = window.matchMedia(QUERY), f = () => setNarrow(m.matches)
    m.addEventListener("change", f); return () => m.removeEventListener("change", f)
  }, [])
  return narrow
}
