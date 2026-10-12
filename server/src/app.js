import express from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"
import mongoose from "mongoose"
import { authRouter } from "./routes/auth.js"
import { ticketRouter } from "./routes/tickets.js"
import { HttpError } from "./util.js"

mongoose.set("sanitizeFilter", true) // extra NoSQL-injection defence: query operators in user data are neutralised

export function createApp(cfg) {
    const app = express()
    app.disable("x-powered-by")
    app.set("trust proxy", cfg.trustProxy ?? 1) // so rate limits see the real client IP, not the proxy's
    app.locals.cfg = cfg

    app.use(helmet()) // security headers
    const limiter = (limit, opts = {}) =>
        rateLimit({
            windowMs: 15 * 60 * 1000,
            limit,
            standardHeaders: true,
            legacyHeaders: false,
            message: { error: "Too many requests. Please try again later." },
            ...opts
        })
    app.use(limiter(cfg.limits.global))

    // CORS is a browser rule, not a firewall: it only controls which sites may READ responses.
    // So we also refuse any request that arrives with an Origin we don't know (blocks cross-site form/fetch abuse).
    app.use((req, res, next) => {
        const o = req.headers.origin
        if (o && !cfg.origins.includes(o)) return res.status(403).json({ error: "Origin not allowed." })
        next()
    })
    app.use(
        cors({
            origin: cfg.origins,
            credentials: true,
            methods: ["GET", "POST", "PATCH"],
            allowedHeaders: ["Content-Type"],
            maxAge: 600
        })
    )

    // Personal data must never be stored by browsers or shared caches.
    app.use("/api", (req, res, next) => {
        res.set("Cache-Control", "no-store")
        next()
    })
    app.use(express.json({ limit: "10kb" }))
    // JSON-only writes: a plain HTML form can't send this content type cross-site without a CORS preflight (a CSRF defence).
    app.use((req, res, next) => {
        if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && !req.is("application/json"))
            return next(new HttpError(415, "Send JSON with Content-Type: application/json."))
        next()
    })
    app.use(cookieParser())

    app.get("/api/health", (req, res) => res.json({ ok: true }))
    const L = cfg.limits
    // Brute-force protection. Only FAILED logins count, so real users aren't locked out by their own successful logins.
    app.use("/api/auth/login", limiter(L.login ?? L.auth, { skipSuccessfulRequests: true })) // per IP, any account
    app.use(
        "/api/auth/login",
        limiter(L.loginAccount ?? L.auth, {
            // per IP and per account
            skipSuccessfulRequests: true,
            keyGenerator: (req) =>
                `${req.ip}|${typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 120) : ""}`
        })
    )
    // Sign-up emails a code, so each step has its own limit (separate counters): starting, asking again, and guessing.
    app.post("/api/auth/register", limiter(L.auth))
    app.post("/api/auth/register/resend", limiter(L.auth))
    app.use("/api/auth/register/verify", limiter(L.otpVerifyIp ?? L.auth, { skipSuccessfulRequests: true })) // per IP
    app.use(
        "/api/auth/register/verify",
        limiter(L.otpVerify ?? L.auth, {
            // per IP and per email being verified
            skipSuccessfulRequests: true,
            keyGenerator: (req) =>
                `${req.ip}|${typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 120) : ""}`
        })
    )
    app.use("/api/auth", authRouter)
    app.use("/api/tickets", ticketRouter)

    app.use((req, res) => res.status(404).json({ error: "Not found." }))
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." })
        if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." })
        if (err instanceof HttpError)
            return res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) })
        if (err && err.code === 11000) return res.status(409).json({ error: "That value is already in use." })
        console.error(err && err.message) // log the message only, never request bodies or secrets
        res.status(500).json({ error: "Something went wrong." }) // never leak stack traces
    })
    return app
}
