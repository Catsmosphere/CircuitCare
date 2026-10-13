/* Keep the API address in one place so local testing and deployed pages can use different routes.
   Locally, use port 3000 on this page's host so the login cookie works across requests.
   In production, leave the address empty and let vercel.json or netlify.toml proxy /api. */
window.CC_CONFIG = {
    apiBase: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
        ? location.protocol + "//" + location.hostname + ":3000"
        : ""
}
