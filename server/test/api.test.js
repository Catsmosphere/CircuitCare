// Tests the API's own logic (accounts, roles, ownership, ticket flow) against an in-memory fake database.
import test from "node:test"
import assert from "node:assert/strict"
import request from "supertest"
import bcrypt from "bcryptjs"
import { createApp } from "../src/app.js"
import { installFakeDb } from "./fake-db.js"

const db = installFakeDb()
const app = createApp({
    prod: false,
    port: 0,
    jwtSecret: "x".repeat(40),
    origins: ["http://localhost:5500"],
    trustProxy: 1,
    cookieName: "cc_token",
    cookie: { httpOnly: true, secure: false, sameSite: "lax", maxAge: 60000, path: "/" },
    limits: { global: 1000, auth: 1000, login: 1000, loginAccount: 1000, lookup: 1000 }
})
db.users.push({
    _id: "a".repeat(24),
    name: "Shop Owner",
    phone: "",
    email: "owner@example.com",
    passwordHash: bcrypt.hashSync("OwnerPass123!", 4),
    role: "owner"
})

const maria = { name: "Maria Santos", phone: "09171234567", email: "maria@example.com", password: "Str0ng-pass-1" }
const juan = { name: "Juan Cruz", phone: "09181234567", email: "juan@example.com", password: "Another-pass-2" }
const resetUser = {
    _id: "b".repeat(24),
    name: "Reset User",
    phone: "+639171234567",
    email: "reset@example.com",
    passwordHash: bcrypt.hashSync("Old-pass-123", 4),
    sessionVersion: 0,
    role: "customer"
}
db.users.push(resetUser)
const customer = request.agent(app),
    other = request.agent(app),
    owner = request.agent(app)

// Stand-in for the email provider: remembers each code so the tests can read it.
const sent = []
app.locals.sendOtp = async (cfg, to, code, purpose) => {
    sent.push({ to, code, purpose })
}
const signUp = async (agent, u) => {
    const a = await agent.post("/api/auth/register").send(u)
    if (a.status !== 202) return a
    return agent.post("/api/auth/register/verify").send({ email: u.email, code: sent.at(-1).code })
}
const CODE = /^[A-HJKMNP-Z2-9]{5}$/
let no1, no2

test("register emails a code first; the account exists only after the code is verified", async () => {
    const start = await customer.post("/api/auth/register").send(maria)
    assert.equal(start.status, 202)
    assert.equal(start.headers["set-cookie"], undefined) // not logged in yet
    assert.equal(sent.at(-1).to, maria.email)
    assert.match(sent.at(-1).code, /^[0-9]{6}$/)
    assert.equal(JSON.stringify(start.body).includes(sent.at(-1).code), false) // the code never travels in the API response
    assert.equal(db.users.find((u) => u.email === maria.email), undefined)
    const r = await customer.post("/api/auth/register/verify").send({ email: maria.email, code: sent.at(-1).code })
    assert.equal(r.status, 201)
    assert.equal(r.body.user.role, "customer")
    assert.equal(r.body.user.passwordHash, undefined)
    assert.match(r.headers["set-cookie"][0], /cc_token=.*HttpOnly/i)
    const stored = db.users.find((u) => u.email === maria.email)
    assert.notEqual(stored.passwordHash, maria.password)
    assert.match(stored.passwordHash, /^\$2[aby]\$12\$/)
    assert.equal(stored.phone, "+639171234567")
    assert.equal((await customer.get("/api/auth/me")).body.user.name, "Maria Santos")
})

test("password reset emails a one-time code, changes the password, and invalidates old sessions", async () => {
    const existingSession = request.agent(app)
    const loggedIn = await existingSession.post("/api/auth/login").send({ email: resetUser.email, password: "Old-pass-123" })
    assert.equal(loggedIn.status, 200)

    const start = await request(app).post("/api/auth/forgot-password").send({ email: resetUser.email })
    assert.equal(start.status, 202)
    assert.equal(JSON.stringify(start.body).includes(sent.at(-1).code), false)
    assert.equal(sent.at(-1).to, resetUser.email)
    assert.equal(sent.at(-1).purpose, "password-reset")
    const code = sent.at(-1).code
    assert.match(code, /^[0-9]{6}$/)

    const wrong = await request(app)
        .post("/api/auth/forgot-password/reset")
        .send({ email: resetUser.email, code: "000000" === code ? "000001" : "000000", password: "New-pass-123" })
    assert.equal(wrong.status, 400)

    const changed = await request(app)
        .post("/api/auth/forgot-password/reset")
        .send({ email: resetUser.email, code, password: "New-pass-123" })
    assert.equal(changed.status, 200)
    assert.equal((await existingSession.get("/api/auth/me")).status, 401)

    const reused = await request(app)
        .post("/api/auth/forgot-password/reset")
        .send({ email: resetUser.email, code, password: "Third-pass-123" })
    assert.equal(reused.status, 400)
    assert.equal((await request(app).post("/api/auth/login").send({ email: resetUser.email, password: "Old-pass-123" })).status, 401)
    assert.equal((await request(app).post("/api/auth/login").send({ email: resetUser.email, password: "New-pass-123" })).status, 200)
})

test("duplicate email is refused with a field error", async () => {
    const r = await request(app).post("/api/auth/register").send(maria)
    assert.equal(r.status, 409)
    assert.ok(r.body.fields.email)
})

test("login: wrong password and unknown email give the same answer", async () => {
    const a = await request(app).post("/api/auth/login").send({ email: maria.email, password: "wrong-password" })
    const b = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "wrong-password" })
    assert.equal(a.status, 401)
    assert.equal(b.status, 401)
    assert.deepEqual(a.body, b.body)
})

test("logout ends the session", async () => {
    const a = request.agent(app)
    assert.equal((await a.post("/api/auth/login").send({ email: maria.email, password: maria.password })).status, 200)
    assert.equal((await a.get("/api/auth/me")).status, 200)
    await a.post("/api/auth/logout").send({})
    assert.equal((await a.get("/api/auth/me")).status, 401)
})

test("customer creates tickets with random codes; bad input is rejected per field", async () => {
    const bad = await customer.post("/api/tickets").send({ device: "Toaster", issue: "short" })
    assert.equal(bad.status, 400)
    assert.ok(bad.body.fields.device && bad.body.fields.issue)
    const t1 = await customer
        .post("/api/tickets")
        .send({ device: "Phone", model: "Samsung A54", issue: "Cracked screen, does not respond to touch" })
    assert.equal(t1.status, 201)
    no1 = t1.body.ticket.no
    assert.match(no1, CODE)
    assert.equal(t1.body.ticket.status, "Received")
    assert.equal(t1.body.ticket.updates.length, 1)
    const t2 = await customer.post("/api/tickets").send({ device: "Laptop", issue: "Will not turn on at all" })
    no2 = t2.body.ticket.no
    assert.match(no2, CODE)
    assert.notEqual(no1, no2)
})

test("customers only ever see their own tickets", async () => {
    await signUp(other, juan)
    assert.deepEqual((await other.get("/api/tickets/mine")).body.tickets, [])
    assert.equal((await other.get(`/api/tickets/mine/${no1}`)).status, 404) // someone else's ticket looks like "not found"
    const mine = await customer.get("/api/tickets/mine")
    assert.equal(mine.body.tickets.length, 2)
    assert.equal((await customer.get(`/api/tickets/mine/${no1}`)).status, 200)
})

test("customers cannot use owner features; the owner cannot create customer tickets", async () => {
    assert.equal((await customer.get("/api/tickets")).status, 403)
    assert.equal((await customer.get(`/api/tickets/${no1}`)).status, 403)
    assert.equal((await customer.patch(`/api/tickets/${no1}`).send({ status: "Closed" })).status, 403)
    assert.equal(
        (await owner.post("/api/auth/login").send({ email: "owner@example.com", password: "OwnerPass123!" })).status,
        200
    )
    assert.equal(
        (await owner.post("/api/tickets").send({ device: "Phone", issue: "Owner should not do this" })).status,
        403
    )
})

test("owner lists, filters, searches and updates tickets; the customer sees the update", async () => {
    const all = await owner.get("/api/tickets")
    assert.equal(all.body.tickets.length, 2)
    assert.equal(all.body.tickets[0].customer.name, "Maria Santos")
    assert.equal((await owner.get("/api/tickets?status=Closed")).body.tickets.length, 0)
    assert.equal((await owner.get("/api/tickets?q=maria")).body.tickets.length, 2)
    assert.equal((await owner.get(`/api/tickets?q=${no1.toLowerCase()}`)).body.tickets.length, 1) // search by ticket code, any letter case
    assert.equal((await owner.get("/api/tickets?q=ZZZZZZ")).body.tickets.length, 0)
    assert.equal((await owner.get("/api/tickets?q[$ne]=x")).status, 400) // query-operator injection is rejected

    const bad = await owner.patch(`/api/tickets/${no1}`).send({ status: "Teleported" })
    assert.equal(bad.status, 400)
    const extra = await owner.patch(`/api/tickets/${no1}`).send({ status: "Ready", customer: "someone-else" })
    assert.equal(extra.status, 400)
    const ok = await owner
        .patch(`/api/tickets/${no1}`)
        .send({ status: "In progress", note: "Screen installed, testing.", estimatedCost: 1500 })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.ticket.status, "In progress")
    assert.equal(ok.body.ticket.updates.length, 2)

    const seen = await customer.get(`/api/tickets/mine/${no1}`)
    assert.equal(seen.body.ticket.status, "In progress")
    assert.equal(seen.body.ticket.estimatedCost, 1500)
    assert.equal(seen.body.ticket.updates[1].note, "Screen installed, testing.")
})

test("tickets cannot be looked up without logging in", async () => {
    assert.equal((await request(app).get("/api/tickets/lookup/00001")).status, 404)
    assert.equal((await request(app).get(`/api/tickets/${no1}`)).status, 401)
    assert.equal((await request(app).get(`/api/tickets/mine/${no1}`)).status, 401)
    assert.equal((await request(app).get("/api/tickets")).status, 401)
})

test("ticket codes are accepted in any letter case and rejected when malformed", async () => {
    assert.equal((await customer.get(`/api/tickets/mine/${no1.toLowerCase()}`)).status, 200)
    assert.equal((await customer.get("/api/tickets/mine/00001")).status, 400) // 0 and 1 are never used in codes
    assert.equal((await customer.get("/api/tickets/mine/ABCDEFG")).status, 400)
})

test("if a random code is already taken, the server draws another", async () => {
    const codes = [no1, no1, "ZZZZ9"]
    app.locals.newTicketNo = () => codes.shift()
    const r = await customer.post("/api/tickets").send({ device: "Tablet", issue: "Charging port is loose and slow" })
    delete app.locals.newTicketNo
    assert.equal(r.status, 201)
    assert.equal(r.body.ticket.no, "ZZZZ9")
})

// ---- sign-up email code (OTP) ----
const person = (n) => ({
    name: `Test Person ${n}`,
    phone: "09171234567",
    email: `person${n}@example.com`,
    password: `Str0ng-pass-${n}`
})
const wrongCode = (code) => (code === "000000" ? "111111" : "000000")
const verify = (email, code) => request(app).post("/api/auth/register/verify").send({ email, code })
const resend = (email) => request(app).post("/api/auth/register/resend").send({ email })
const pendingRow = (email) => db.pending.find((x) => x.email === email)

test("sign-up code: a wrong code is refused, only a hash is stored, and the right code still works", async () => {
    const p = person(1)
    assert.equal((await request(app).post("/api/auth/register").send(p)).status, 202)
    const code = sent.at(-1).code
    assert.notEqual(pendingRow(p.email).otpHash, code)
    const bad = await verify(p.email, wrongCode(code))
    assert.equal(bad.status, 400)
    assert.ok(bad.body.fields.code)
    assert.equal(db.users.find((u) => u.email === p.email), undefined)
    assert.equal((await verify(p.email, code)).status, 201)
    assert.equal(pendingRow(p.email), undefined) // the waiting sign-up is cleaned up
    assert.equal((await verify(p.email, code)).status, 400) // a code works only once
})

test("sign-up code: five wrong guesses cancel the sign-up, even if the right code follows", async () => {
    const p = person(2)
    await request(app).post("/api/auth/register").send(p)
    const code = sent.at(-1).code
    const statuses = []
    for (let i = 0; i < 5; i++) statuses.push((await verify(p.email, wrongCode(code))).status)
    assert.deepEqual(statuses, [400, 400, 400, 400, 429])
    assert.equal((await verify(p.email, code)).status, 400)
    assert.equal(db.users.find((u) => u.email === p.email), undefined)
})

test("sign-up code: an expired code is refused", async () => {
    const p = person(3)
    await request(app).post("/api/auth/register").send(p)
    const code = sent.at(-1).code
    pendingRow(p.email).expiresAt = new Date(Date.now() - 1000)
    assert.equal((await verify(p.email, code)).status, 400)
    assert.equal(db.users.find((u) => u.email === p.email), undefined)
})

test("sign-up code: asking again is slowed down, capped at 5 codes, and needs a started sign-up", async () => {
    const p = person(4)
    assert.equal((await resend(p.email)).status, 400) // nothing started yet
    await request(app).post("/api/auth/register").send(p)
    const fast = await resend(p.email)
    assert.equal(fast.status, 429)
    assert.match(fast.body.error, /wait/i)
    const waited = () => {
        pendingRow(p.email).lastSentAt = new Date(Date.now() - 61000)
    }
    const before = sent.length
    for (let i = 0; i < 4; i++) {
        waited()
        assert.equal((await resend(p.email)).status, 202)
    }
    assert.equal(sent.length, before + 4)
    waited()
    const capped = await resend(p.email)
    assert.equal(capped.status, 429)
    assert.match(capped.body.error, /too many codes/i)
})

test("sign-up code: verifying without a started sign-up, or with a malformed code, is refused", async () => {
    assert.equal((await verify("nobody@example.com", "123456")).status, 400)
    const malformed = await verify("nobody@example.com", "12ab56")
    assert.equal(malformed.status, 400)
    assert.ok(malformed.body.fields.code)
    const injected = await request(app).post("/api/auth/register/verify").send({ email: { $gt: "" }, code: { $gt: "" } })
    assert.equal(injected.status, 400)
})

test("sign-up code: if the email cannot be sent, nothing is kept and the user can try again", async () => {
    const p = person(5)
    const real = app.locals.sendOtp
    app.locals.sendOtp = async () => {
        throw new Error("provider down")
    }
    const r = await request(app).post("/api/auth/register").send(p)
    app.locals.sendOtp = real
    assert.equal(r.status, 502)
    assert.equal(pendingRow(p.email), undefined)
    assert.equal((await request(app).post("/api/auth/register").send(p)).status, 202)
})
