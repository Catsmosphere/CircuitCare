import "dotenv/config"

export function loadConfig(env = process.env) {
    const need = (k) => {
        if (!env[k]) throw new Error(`Missing required environment variable ${k}`)
        return env[k]
    }
    const prod = env.NODE_ENV === "production"
    const jwtSecret = need("JWT_SECRET")
    if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.")

    // How many reverse proxies sit in front of this app (Render/Railway = 1; add 1 if Vercel/Netlify also proxies /api).
    // Too low: every visitor shares one IP and one rate limit. Too high: attackers can fake their IP. See SECURITY.md.
    const trustProxy = env.TRUST_PROXY === undefined ? 1 : Number(env.TRUST_PROXY)
    if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5)
        throw new Error("TRUST_PROXY must be a whole number from 0 to 5.")

    const sameSite = (env.COOKIE_SAMESITE || "lax").toLowerCase()
    if (!["lax", "strict", "none"].includes(sameSite)) throw new Error("COOKIE_SAMESITE must be lax, strict or none.")
    if (sameSite === "none" && !prod)
        throw new Error("COOKIE_SAMESITE=none needs NODE_ENV=production (it requires HTTPS).")

    // Email for sign-up codes (Brevo API). Optional on your computer (codes are printed in the terminal), required in production.
    const mail = env.BREVO_API_KEY ? { apiKey: env.BREVO_API_KEY, from: need("MAIL_FROM") } : null
    if (prod && !mail) throw new Error("Production needs BREVO_API_KEY and MAIL_FROM so sign-up codes can be emailed.")

    return {
        prod,
        mail,
        port: Number(env.PORT) || 3000,
        mongoUri: need("MONGODB_URI"),
        jwtSecret,
        origins: need("CLIENT_ORIGINS")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        trustProxy,
        // "__Host-" cookies must be Secure, path "/", and have no Domain, so another subdomain can never overwrite them.
        cookieName: prod ? "__Host-cc_token" : "cc_token",
        cookie: { httpOnly: true, secure: prod, sameSite, maxAge: 8 * 60 * 60 * 1000, path: "/" },
        limits: { global: 300, auth: 10, login: 20, loginAccount: 5, otpVerify: 10, otpVerifyIp: 30 } // requests per 15 minutes
    }
}
