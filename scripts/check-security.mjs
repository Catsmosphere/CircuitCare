// Run this from the project folder before deploys to catch frontend code the Content-Security-Policy blocks.
import { readdirSync, readFileSync, existsSync } from "node:fs"

const problems = [],
    notes = []
const html = readdirSync(".").filter((f) => f.endsWith(".html"))
for (const f of html) {
    const s = readFileSync(f, "utf8")
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(s))
        problems.push(`${f}: inline <script> (the CSP blocks it; move it into js/)`)
    if (/\sstyle\s*=/i.test(s)) problems.push(`${f}: inline style="" attribute (use a CSS class)`)
    if (/\son[a-z]+\s*=/i.test(s)) problems.push(`${f}: inline event handler such as onclick=`)
    if (/javascript:/i.test(s)) problems.push(`${f}: javascript: URL`)
    if (/(?:src|href)\s*=\s*"https?:\/\//i.test(s))
        problems.push(`${f}: loads something from another website (self-host it instead)`)
}
const files = readdirSync("js", { recursive: true })
    .filter((f) => f.endsWith(".js"))
    .map((f) => `js/${f}`)
for (const f of files) {
    const s = readFileSync(f, "utf8")
    if (/\beval\(|new Function\(|document\.write\(/.test(s)) problems.push(`${f}: eval / new Function / document.write`)
    if (/localStorage|sessionStorage|indexedDB/.test(s))
        problems.push(`${f}: uses browser storage (keep tokens and personal data out of it)`)
    if (/style="/.test(s)) problems.push(`${f}: inline style="" inside generated HTML`)
    if (/\son[a-z]+=\\?["']/.test(s)) problems.push(`${f}: inline event handler in generated HTML`)
}
for (const f of ["vercel.json", "netlify.toml"]) {
    if (!existsSync(f)) {
        problems.push(`${f} is missing`)
        continue
    }
    const s = readFileSync(f, "utf8")
    if (!s.includes("Content-Security-Policy")) problems.push(`${f}: no Content-Security-Policy header`)
    if (/unsafe-inline|unsafe-eval/.test(s)) problems.push(`${f}: CSP allows unsafe-inline/unsafe-eval`)
    if (s.includes("YOUR-API"))
        notes.push(`${f}: still contains the YOUR-API placeholder, replace it with your backend URL before deploying`)
}
console.log(`Checked ${html.length} pages and ${files.length} scripts.`)
notes.forEach((n) => console.log("NOTE:", n))
if (problems.length) {
    problems.forEach((p) => console.log("FAIL:", p))
    process.exit(1)
}
console.log("OK: nothing the strict CSP would block.")
