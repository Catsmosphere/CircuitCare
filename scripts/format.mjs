// Formats the whole project in your coding style:
// 4-space indentation, every nesting level indented (html > head/body, section > h2, ...),
// CSS written as "selector{" with one declaration per line and a blank line between rules,
// JS with double quotes, no semicolons, and "function(){" (no spaces), like your jQuery and Promise code.
//
// Usage, from the project folder (the one that contains index.html):   node scripts/format.mjs
// Tip: make a copy of the folder (or commit to git) first, so you can compare before and after.
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const targets = [
    '"*.html"',
    '"css/**/*.css"',
    '"js/**/*.js"',
    '"scripts/**/*.mjs"',
    '"server/src/**/*.js"',
    '"server/test/**/*.js"'
]
execSync(`npx --yes prettier@3 --write ${targets.join(" ")}`, { stdio: "inherit" })

// Prettier prints "<!doctype html>" and "<meta ... />". Match your style instead.
for (const f of readdirSync(".").filter((n) => n.endsWith(".html"))) {
    const s = readFileSync(f, "utf8")
        .replace(/<!doctype html>/i, "<!DOCTYPE html>")
        .replace(/\s*\/>/g, ">")
    writeFileSync(f, s)
}

// Prettier prints "a {". Match your style: "a{", and a blank line between rules.
for (const f of readdirSync("css").filter((n) => n.endsWith(".css"))) {
    const lines = readFileSync(`css/${f}`, "utf8").replace(/ \{\n/g, "{\n").split("\n")
    const out = []
    lines.forEach((line, i) => {
        out.push(line)
        const next = lines[i + 1]
        if (/^\s*\}$/.test(line) && next !== undefined && next.trim() !== "" && !/^\s*\}$/.test(next)) out.push("")
    })
    writeFileSync(`css/${f}`, out.join("\n"))
}

// Prettier prints "function(){". Match your style: "function(){" (anonymous functions only).
function walk(dir) {
    return readdirSync(dir).flatMap((n) => {
        if (n === "node_modules") return []
        const p = join(dir, n)
        return statSync(p).isDirectory() ? walk(p) : [p]
    })
}
for (const dir of ["js", "scripts", "server/src", "server/test"]) {
    for (const f of walk(dir).filter((p) => /\.(js|mjs)$/.test(p))) {
        const s = readFileSync(f, "utf8").replace(/\bfunction \(([^()]*)\) \{/g, "function($1){")
        writeFileSync(f, s)
    }
}

console.log("Done: the project now follows your coding style.")
