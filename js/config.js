/* Where the API lives.
   - Local testing: the API runs on port 3000 of the same host name as this page (cookies need the same host name).
   - Deployed: leave empty. vercel.json / netlify.toml proxy /api to the backend, so the browser only talks to one site. */
window.CC_CONFIG = {
    apiBase: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
        ? location.protocol + "//" + location.hostname + ":3000"
        : ""
}
