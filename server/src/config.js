import "dotenv/config"

export function loadConfig(env = process.env) {
    // Fail at startup when required settings are missing, instead of letting a half-configured API run.
    const need = (k) => {
        if (!env[k]) throw new Error(`Missing required environment variable ${k}`)
        return env[k]
    }
    const prod = env.NODE_ENV === "production"
    const jwtSecret = need("JWT_SECRET")
    if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.")

    // Set this to the number of trusted proxies so rate limits see the visitor's IP without trusting spoofed headers.
    const trustProxy = env.TRUST_PROXY === undefined ? 1 : Number(env.TRUST_PROXY)
    if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5)
        throw new Error("TRUST_PROXY must be a whole number from 0 to 5.")

    const sameSite = (env.COOKIE_SAMESITE || "lax").toLowerCase()
    if (!["lax", "strict", "none"].includes(sameSite)) throw new Error("COOKIE_SAMESITE must be lax, strict or none.")
    if (sameSite === "none" && !prod)
        throw new Error("COOKIE_SAMESITE=none needs NODE_ENV=production (it requires HTTPS).")

    // Allow local testing without Brevo, but production must be able to email signup and reset codes.
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
        // Use a host-only secure cookie in production so a sibling subdomain cannot replace the login cookie.
        cookieName: prod ? "__Host-cc_token" : "cc_token",
        cookie: { httpOnly: true, secure: prod, sameSite, maxAge: 8 * 60 * 60 * 1000, path: "/" },
        limits: { global: 300, auth: 10, login: 20, loginAccount: 5, otpVerify: 10, otpVerifyIp: 30 } // requests per 15 minutes
    }
}
