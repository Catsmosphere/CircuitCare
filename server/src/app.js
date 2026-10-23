import express from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"
import mongoose from "mongoose"
import { authRouter } from "./routes/auth.js"
import { accountRouter } from "./routes/accounts.js"
import { ticketRouter } from "./routes/tickets.js"
import { HttpError } from "./util.js"

// Make Mongoose treat user-provided query objects as values, not MongoDB operators.
mongoose.set("sanitizeFilter", true)

export function createApp(cfg) {
    // Keep security checks, body parsing, rate limits, and routes in this order for every server instance.
    const app = express()
    app.disable("x-powered-by")
    // Trust only the configured proxy hops so request IP limits use the right address.
    app.set("trust proxy", cfg.trustProxy ?? 1)
    app.locals.cfg = cfg

    app.use(helmet()) // Set the standard security headers before handling any route.
    // Use one rate-limit setup so every route returns the same retry response and headers.
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

    // Reject unknown origins on the server too; CORS alone only stops browsers from reading a response.
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

    // Stop browsers and shared caches from keeping API responses that contain personal data.
    app.use("/api", (req, res, next) => {
        res.set("Cache-Control", "no-store")
        next()
    })
    // Allow one resized customer photo on a repair request while keeping other JSON bodies small.
    app.post("/api/tickets", express.json({ limit: "1.3mb" }))
    app.use(express.json({ limit: "10kb" }))
    // Require JSON for writes so cross-site forms cannot submit these requests without a CORS preflight.
    app.use((req, res, next) => {
        if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && !req.is("application/json"))
            return next(new HttpError(415, "Send JSON with Content-Type: application/json."))
        next()
    })
    app.use(cookieParser())

    app.get("/api/health", (req, res) => res.json({ ok: true }))
    const L = cfg.limits
    // Count failed logins only, so successful sign-ins do not use up the visitor's retry allowance.
    app.use("/api/auth/login", limiter(L.login ?? L.auth, { skipSuccessfulRequests: true })) // Limit attempts per IP across all accounts.
    app.use(
        "/api/auth/login",
        limiter(L.loginAccount ?? L.auth, {
            // Also limit attempts per IP and account so one address cannot target one user repeatedly.
            skipSuccessfulRequests: true,
            keyGenerator: (req) =>
                `${req.ip}|${typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 120) : ""}`
        })
    )
    // Limit starting signup, resending a code, and guessing a code separately.
    app.post("/api/auth/register", limiter(L.auth))
    app.post("/api/auth/register/resend", limiter(L.auth))
    app.use("/api/auth/register/verify", limiter(L.otpVerifyIp ?? L.auth, { skipSuccessfulRequests: true })) // Limit code guesses per IP.
    app.use(
        "/api/auth/register/verify",
        limiter(L.otpVerify ?? L.auth, {
            // Also limit guesses for each email address.
            skipSuccessfulRequests: true,
            keyGenerator: (req) =>
                `${req.ip}|${typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 120) : ""}`
        })
    )
    // Apply the same per-IP and per-email guess limits to password reset codes.
    app.post("/api/auth/forgot-password", limiter(L.auth))
    app.post("/api/auth/forgot-password/resend", limiter(L.auth))
    app.use("/api/auth/forgot-password/reset", limiter(L.otpVerifyIp ?? L.auth, { skipSuccessfulRequests: true }))
    app.use(
        "/api/auth/forgot-password/reset",
        limiter(L.otpVerify ?? L.auth, {
            skipSuccessfulRequests: true,
            keyGenerator: (req) =>
                `${req.ip}|${typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 120) : ""}`
        })
    )
    app.use("/api/auth", authRouter)
    app.use("/api/accounts", accountRouter)
    app.use("/api/tickets", ticketRouter)

    app.use((req, res) => res.status(404).json({ error: "Not found." }))
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." })
        if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." })
        if (err instanceof HttpError)
            return res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) })
        if (err && err.code === 11000) return res.status(409).json({ error: "That value is already in use." })
        console.error(err && err.message) // Log the message only, not request bodies or secrets.
        res.status(500).json({ error: "Something went wrong." }) // Keep internal stack traces out of API responses.
    })
    return app
}
