// Security tests that need no database: they exercise the protections that run BEFORE any query.
import test from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import jwt from "jsonwebtoken"
import { createApp } from "../src/app.js"
import { loadConfig } from "../src/config.js"

const ORIGIN = "http://localhost:5500"
const cfg = (limits = {}) => ({
    prod: false,
    port: 0,
    jwtSecret: "x".repeat(40),
    origins: [ORIGIN],
    trustProxy: 1,
    cookieName: "cc_token",
    cookie: { httpOnly: true, secure: false, sameSite: "lax", maxAge: 1000, path: "/" },
    limits: { global: 1000, auth: 1000, lookup: 1000, ...limits }
})
const app = createApp(cfg())
const json = (r) => r.set("Content-Type", "application/json")

test("sends security headers and hides the framework", async () => {
    const r = await request(app).get("/api/health")
    assert.equal(r.status, 200)
    assert.equal(r.headers["x-content-type-options"], "nosniff")
    assert.ok(r.headers["content-security-policy"])
    assert.equal(r.headers["x-powered-by"], undefined)
})

test("CORS: allowed origin is echoed with credentials", async () => {
    const r = await request(app).get("/api/health").set("Origin", ORIGIN)
    assert.equal(r.headers["access-control-allow-origin"], ORIGIN)
    assert.equal(r.headers["access-control-allow-credentials"], "true")
})

test("CORS: preflight from the allowed origin succeeds", async () => {
    const r = await request(app)
        .options("/api/tickets")
        .set("Origin", ORIGIN)
        .set("Access-Control-Request-Method", "POST")
    assert.equal(r.status, 204)
    assert.equal(r.headers["access-control-allow-origin"], ORIGIN)
})

test("unknown origins are refused outright, not just hidden from the browser", async () => {
    const r = await request(app).get("/api/health").set("Origin", "https://evil.example")
    assert.equal(r.status, 403)
    assert.equal(r.headers["access-control-allow-origin"], undefined)
    const w = await json(request(app).post("/api/auth/login").set("Origin", "https://evil.example")).send({
        email: "a@b.co",
        password: "x"
    })
    assert.equal(w.status, 403)
})

test("writes must be JSON (blocks plain cross-site form posts)", async () => {
    const r = await request(app).post("/api/auth/login").set("Content-Type", "text/plain").send("email=a@b.co")
    assert.equal(r.status, 415)
})

test("oversized and malformed bodies are rejected", async () => {
    const big = await json(request(app).post("/api/auth/login")).send({ email: "a".repeat(20000) })
    assert.equal(big.status, 413)
    const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{bad json")
    assert.equal(bad.status, 400)
})

test("NoSQL injection payloads never reach the database", async () => {
    const r = await json(request(app).post("/api/auth/login")).send({ email: { $gt: "" }, password: { $gt: "" } })
    assert.equal(r.status, 400)
    assert.ok(r.body.fields)
})

test("registration cannot choose a role or send extra fields", async () => {
    const r = await json(request(app).post("/api/auth/register")).send({
        name: "Eve Mallory",
        phone: "09171234567",
        email: "eve@example.com",
        password: "password123",
        role: "owner"
    })
    assert.equal(r.status, 400)
})

test("registration validates input on the server", async () => {
    const r = await json(request(app).post("/api/auth/register")).send({
        name: "E",
        phone: "abc",
        email: "nope",
        password: "short"
    })
    assert.equal(r.status, 400)
    for (const k of ["name", "phone", "email", "password"]) assert.ok(r.body.fields[k], `missing error for ${k}`)
})

test("protected routes need a login", async () => {
    assert.equal((await request(app).get("/api/auth/me")).status, 401)
    assert.equal((await request(app).get("/api/tickets")).status, 401)
    assert.equal((await request(app).get("/api/tickets/mine")).status, 401)
    assert.equal((await json(request(app).patch("/api/tickets/00001")).send({ status: "Closed" })).status, 401)
})

test("forged, unsigned and wrongly signed tokens are rejected", async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "000000000000000000000001" })}.`
    const wrong = jwt.sign({ sub: "000000000000000000000001" }, "a-different-secret-that-is-long-enough!!")
    for (const t of [unsigned, wrong, "garbage"]) {
        const r = await request(app).get("/api/auth/me").set("Cookie", `cc_token=${t}`)
        assert.equal(r.status, 401)
    }
})

test("there is no public way to look up a ticket", async () => {
    assert.equal((await request(app).get("/api/tickets/lookup/00001")).status, 404)
    assert.equal((await request(app).get("/api/tickets/00001")).status, 401)
    assert.equal((await request(app).get("/api/tickets/mine/00001")).status, 401)
})

test("login is rate limited against brute force", async () => {
    const limited = createApp(cfg({ auth: 3 }))
    const codes = []
    for (let i = 0; i < 5; i++)
        codes.push((await json(request(limited).post("/api/auth/login")).send({ email: "x" })).status)
    assert.deepEqual(codes, [400, 400, 400, 429, 429])
})

test("unknown routes return a plain JSON 404", async () => {
    const r = await request(app).get("/api/nope")
    assert.equal(r.status, 404)
    assert.deepEqual(r.body, { error: "Not found." })
})

test("API responses are never cacheable", async () => {
    const r = await request(app).get("/api/health")
    assert.equal(r.headers["cache-control"], "no-store")
})

test("common passwords are refused", async () => {
    const r = await json(request(app).post("/api/auth/register")).send({
        name: "Maria Santos",
        phone: "09171234567",
        email: "maria@example.com",
        password: "password123"
    })
    assert.equal(r.status, 400)
    assert.match(r.body.fields.password, /too common/)
})

test("rate limit cannot be dodged by faking X-Forwarded-For", async () => {
    const limited = createApp(cfg({ auth: 3 }))
    const codes = []
    for (let i = 0; i < 5; i++) {
        codes.push(
            (
                await json(request(limited).post("/api/auth/login"))
                    .set("X-Forwarded-For", `10.0.0.${i}, 203.0.113.9`)
                    .send({ email: "x" })
            ).status
        )
    }
    assert.deepEqual(codes, [400, 400, 400, 429, 429])
})

test("sign-up codes are rate limited: starting, asking again, and guessing", async () => {
    const limited = createApp(cfg({ auth: 2, otpVerify: 3, otpVerifyIp: 100 }))
    const hit = (path, body) => json(request(limited).post(path)).send(body)
    const start = [],
        again = [],
        guess = []
    for (let i = 0; i < 3; i++) start.push((await hit("/api/auth/register", { email: "x" })).status)
    for (let i = 0; i < 3; i++) again.push((await hit("/api/auth/register/resend", { email: "x" })).status)
    for (let i = 0; i < 5; i++) guess.push((await hit("/api/auth/register/verify", { email: "x", code: "1" })).status)
    assert.deepEqual(start, [400, 400, 429])
    assert.deepEqual(again, [400, 400, 429])
    assert.deepEqual(guess, [400, 400, 400, 429, 429])
})

test("config: unsafe or invalid settings fail at startup", () => {
    const base = { JWT_SECRET: "x".repeat(40), MONGODB_URI: "mongodb://localhost/x", CLIENT_ORIGINS: ORIGIN }
    assert.throws(() => loadConfig({ ...base, JWT_SECRET: "short" }), /JWT_SECRET/)
    assert.throws(() => loadConfig({ ...base, TRUST_PROXY: "abc" }), /TRUST_PROXY/)
    assert.throws(() => loadConfig({ ...base, COOKIE_SAMESITE: "none" }), /production/)
    assert.throws(() => loadConfig({ ...base, NODE_ENV: "production" }), /BREVO_API_KEY/) // production must be able to email codes
    assert.throws(() => loadConfig({ ...base, BREVO_API_KEY: "k" }), /MAIL_FROM/)
    const prod = loadConfig({ ...base, NODE_ENV: "production", BREVO_API_KEY: "k", MAIL_FROM: "shop@example.com" })
    assert.equal(prod.cookieName, "__Host-cc_token")
    assert.equal(prod.cookie.secure, true)
    assert.equal(prod.cookie.httpOnly, true)
    assert.equal(prod.cookie.sameSite, "lax")
})
