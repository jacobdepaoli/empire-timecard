// Converts the <text> elements in the Empire Electric logo SVGs into <path>
// outlines so the logo renders identically everywhere (no Inter font needed).
// Usage: node tools/outline-logo.cjs <fontsource-inter-files-dir> <in.svg> <out.svg>
const fs = require("fs")
const path = require("path")
const opentype = require("opentype.js")

const [fontDir, inFile, outFile] = process.argv.slice(2)
const fonts = {}
const font = (w) => (fonts[w] ||= opentype.loadSync(path.join(fontDir, `inter-latin-${w}-normal.woff`)))

const src = fs.readFileSync(inFile, "utf8")
const attr = (s, name) => (s.match(new RegExp(`${name}="([^"]*)"`)) || [])[1]
const decode = (t) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")

const out = src.replace(/<text([^>]*)>([^<]*)<\/text>/g, (_, attrs, raw) => {
  const text = decode(raw)
  const x0 = Number(attr(attrs, "x")), y = Number(attr(attrs, "y"))
  const size = Number(attr(attrs, "font-size"))
  const ls = Number(attr(attrs, "letter-spacing") || 0)
  const weight = attr(attrs, "font-weight") || "500"
  const fill = attr(attrs, "fill")
  const f = font(weight)
  const scale = size / f.unitsPerEm
  let x = x0, d = ""
  const glyphs = f.stringToGlyphs(text)
  glyphs.forEach((g, i) => {
    d += g.getPath(x, y, size).toPathData(2)
    let adv = g.advanceWidth * scale
    if (i < glyphs.length - 1) adv += f.getKerningValue(g, glyphs[i + 1]) * scale
    x += adv + ls
  })
  return `<path fill="${fill}" d="${d}"/>`
})
fs.writeFileSync(outFile, out)
console.log(`${path.basename(outFile)}: ${(out.match(/<text/g) || []).length} text elements left`)
