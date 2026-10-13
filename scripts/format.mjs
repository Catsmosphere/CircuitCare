// Format the project in the established style: four-space indentation, one CSS declaration per line,
// double quotes, no JavaScript semicolons, and compact anonymous functions.
//
// Run this from the project folder (the one with index.html) using node scripts/format.mjs.
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

// Undo Prettier's HTML casing and self-closing slash changes to keep the project's markup style.
for (const f of readdirSync(".").filter((n) => n.endsWith(".html"))) {
    const s = readFileSync(f, "utf8")
        .replace(/<!doctype html>/i, "<!DOCTYPE html>")
        .replace(/\s*\/>/g, ">")
    writeFileSync(f, s)
}

// Restore the compact selector style and blank space between CSS rules after Prettier runs.
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

// Remove Prettier's space before anonymous function parentheses to match the existing JavaScript style.
function walk(dir) {
    // Collect files recursively while skipping dependencies so the style fix reaches project code only.
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
