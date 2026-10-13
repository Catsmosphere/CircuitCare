import { Router } from "express"
import bcrypt from "bcryptjs"
import { createHmac, randomInt, timingSafeEqual } from "node:crypto"
import mongoose from "mongoose"
import { z } from "zod"
import { User } from "../models/User.js"
import { PendingSignup } from "../models/PendingSignup.js"
import { PasswordReset } from "../models/PasswordReset.js"
import { signToken, requireAuth } from "../middleware/auth.js"
import { sendOtpMail } from "../mailer.js"
import { HttpError, asyncHandler, parse } from "../util.js"

const email = z.string().trim().toLowerCase().email("Enter a valid email.").max(120)
const COMMON = new Set([
    "password",
    "password1",
    "password123",
    "password1234",
    "passw0rd",
    "p@ssw0rd",
    "12345678",
    "123456789",
    "1234567890",
    "11111111",
    "00000000",
    "qwerty123",
    "qwertyuiop",
    "qwerty12",
    "1q2w3e4r",
    "iloveyou",
    "admin123",
    "welcome1",
    "welcome123",
    "letmein123",
    "abc12345",
    "dragon123",
    "monkey123",
    "football1",
    "superman1"
])
const password = z
    .string()
    .min(8, "Use at least 8 characters.")
    .refine((v) => Buffer.byteLength(v) <= 72, "Password is too long.")
    .refine((v) => !COMMON.has(v.toLowerCase()), "That password is too common. Choose another.")
// Reject fields the page does not support, so a signup request cannot choose its own role.
const registerSchema = z
    .object({
        name: z.string().trim().min(2, "Enter your full name.").max(80),
        phone: z
            .string()
            .trim()
            .transform((v) => v.replace(/[\s()-]/g, ""))
            .refine(
                (v) => /^(?:09[0-9]{9}|\+639[0-9]{9}|639[0-9]{9})$/.test(v),
                "Enter a Philippine mobile number: 09XX XXX XXXX or +63 9XX XXX XXXX."
            )
            .transform((v) => (v.startsWith("09") ? `+63${v.slice(1)}` : v.startsWith("639") ? `+${v}` : v)),
        email,
        password
    })
    .strict()
const loginSchema = z.object({ email, password: z.string().min(1).max(72) }).strict()
const resendSchema = z.object({ email }).strict()
const verifySchema = z
    .object({ email, code: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code.") })
    .strict()
const resetSchema = z
    .object({ email, code: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code."), password })
    .strict()

// Keep email-code timing and attempt limits together so signup and reset follow the same policy.
const OTP_TTL_MS = 10 * 60 * 1000 // a code works for 10 minutes
const OTP_COOLDOWN_MS = 60 * 1000 // at least 60 seconds between two emails to the same address
const OTP_MAX_SENDS = 5 // codes emailed per sign-up
const OTP_MAX_TRIES = 5 // wrong guesses per code, then the sign-up is cancelled
const BAD_CODE = "That code is wrong or has expired."
const RESET_MESSAGE = "If an account exists for that email, a verification code will arrive shortly."

// Store keyed hashes so a database leak does not reveal codes that are waiting to be used.
const hashCode = (cfg, mail, code) => createHmac("sha256", cfg.jwtSecret).update(`${mail}|${code}`).digest("hex")
const hashResetCode = (cfg, mail, code) =>
    createHmac("sha256", cfg.jwtSecret).update(`password-reset|${mail}|${code}`).digest("hex")
const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12) // Spend similar time checking unknown emails to reduce account discovery by timing.
const pub = (u) => ({ id: String(u._id), name: u.name, email: u.email, phone: u.phone, role: u.role })
const setCookie = (req, res, user) => {
    const c = req.app.locals.cfg
    res.cookie(c.cookieName, signToken(c, user), c.cookie)
}

export const authRouter = Router()

// Start or resend signup verification, saving only a hash and enforcing the expiry, cooldown, and send limit.
async function issueCode(req, mail, data) {
    const cfg = req.app.locals.cfg,
        now = Date.now()
    const old = await PendingSignup.findOne({ email: mail })
    const live = old && old.expiresAt.getTime() > now ? old : null
    if (!data && !live) throw new HttpError(400, "Your sign-up expired. Please start again.")
    if (live) {
        const wait = Math.ceil((live.lastSentAt.getTime() + OTP_COOLDOWN_MS - now) / 1000)
        if (wait > 0) throw new HttpError(429, `Please wait ${wait} seconds before asking for a new code.`)
        if (live.sends >= OTP_MAX_SENDS)
            throw new HttpError(429, "Too many codes requested. Please try again in a few minutes.")
    }
    const code = String(randomInt(0, 1000000)).padStart(6, "0") // Use secure randomness so codes are hard to predict.
    await PendingSignup.findOneAndUpdate(
        { email: mail },
        {
            $set: {
                ...data,
                otpHash: hashCode(cfg, mail, code),
                attempts: 0,
                sends: live ? live.sends + 1 : 1,
                lastSentAt: new Date(now),
                expiresAt: new Date(now + OTP_TTL_MS)
            }
        },
        { upsert: true }
    )
    try {
        await (req.app.locals.sendOtp || sendOtpMail)(cfg, mail, code)
    } catch (e) {
        console.error(e && e.message) // Log only the error message, never the code, key, or email content.
        await PendingSignup.deleteOne({ email: mail })
        throw new HttpError(502, "We couldn't send the code. Please try again in a moment.")
    }
}

// Email reset codes only to known accounts while returning the same response for known and unknown emails.
async function issueResetCode(req, mail) {
    if (!(await User.exists({ email: mail }))) return
    const cfg = req.app.locals.cfg,
        now = new Date(),
        cutoff = new Date(now.getTime() - OTP_COOLDOWN_MS)
    const code = String(randomInt(0, 1000000)).padStart(6, "0")
    const fields = {
        otpHash: hashResetCode(cfg, mail, code),
        attempts: 0,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS)
    }
    // Check the cooldown and send cap in the same database write so parallel requests cannot issue competing codes.
    let claimed = await PasswordReset.findOneAndUpdate(
        {
            email: mail,
            expiresAt: mongoose.trusted({ $gt: now }),
            lastSentAt: mongoose.trusted({ $lte: cutoff }),
            sends: mongoose.trusted({ $lt: OTP_MAX_SENDS })
        },
        { $set: fields, $inc: { sends: 1 } },
        { new: true }
    )
    if (!claimed) {
        // Restart an expired request atomically instead of racing another resend.
        claimed = await PasswordReset.findOneAndUpdate(
            { email: mail, expiresAt: mongoose.trusted({ $lte: now }) },
            { $set: { ...fields, sends: 1 } },
            { new: true }
        )
    }
    if (!claimed) {
        // Create the first reset row only once; the unique email index prevents concurrent requests sending competing codes.
        try {
            const created = await PasswordReset.updateOne(
                { email: mail },
                { $setOnInsert: { email: mail, ...fields, sends: 1 } },
                { upsert: true }
            )
            if (!created.upsertedCount) return // Leave an active request alone while it is cooling down or capped.
        } catch (e) {
            if (e && e.code === 11000) return
            throw e
        }
    }
    Promise.resolve()
        .then(() => (req.app.locals.sendOtp || sendOtpMail)(cfg, mail, code, "password-reset"))
        .catch(async (e) => {
            console.error(e && e.message)
            await PasswordReset.deleteOne({ email: mail, otpHash: hashResetCode(cfg, mail, code) })
        })
}

// Hold signup details as pending until the customer proves they can read the email code.
authRouter.post(
    "/register",
    asyncHandler(async (req, res) => {
        const d = parse(registerSchema, req.body)
        if (await User.exists({ email: d.email }))
            throw new HttpError(409, "An account with this email already exists.", {
                email: "An account with this email already exists."
            })
        await issueCode(req, d.email, {
            name: d.name,
            phone: d.phone,
            passwordHash: await bcrypt.hash(d.password, 12)
        })
        res.status(202).json({ ok: true, resendAfter: OTP_COOLDOWN_MS / 1000 })
    })
)

authRouter.post(
    "/register/resend",
    asyncHandler(async (req, res) => {
        const d = parse(resendSchema, req.body)
        await issueCode(req, d.email)
        res.status(202).json({ ok: true, resendAfter: OTP_COOLDOWN_MS / 1000 })
    })
)

// Create a customer account and sign them in only after their email code checks out.
authRouter.post(
    "/register/verify",
    asyncHandler(async (req, res) => {
        const d = parse(verifySchema, req.body)
        const cfg = req.app.locals.cfg
        const bad = new HttpError(400, BAD_CODE, { code: BAD_CODE }) // Use one message for unknown, expired, and incorrect codes.
        // Count the guess atomically before checking it so parallel requests cannot bypass the limit.
        const p = await PendingSignup.findOneAndUpdate({ email: d.email }, { $inc: { attempts: 1 } }, { new: true })
        if (!p || p.expiresAt.getTime() <= Date.now() || p.attempts > OTP_MAX_TRIES) throw bad
        if (!sameHash(p.otpHash, hashCode(cfg, d.email, d.code))) {
            if (p.attempts >= OTP_MAX_TRIES) {
                await PendingSignup.deleteOne({ email: d.email })
                throw new HttpError(429, "Too many wrong codes. Please sign up again.")
            }
            throw bad
        }
        if (await User.exists({ email: d.email }))
            throw new HttpError(409, "An account with this email already exists.", {
                email: "An account with this email already exists."
            })
        const user = await User.create({
            name: p.name,
            phone: p.phone,
            email: d.email,
            passwordHash: p.passwordHash
        })
        await PendingSignup.deleteOne({ email: d.email })
        setCookie(req, res, user)
        res.status(201).json({ user: pub(user) })
    })
)

authRouter.post(
    "/login",
    asyncHandler(async (req, res) => {
        const d = parse(loginSchema, req.body)
        const user = await User.findOne({ email: d.email }).select("+passwordHash")
        const ok = await bcrypt.compare(d.password, user ? user.passwordHash : DUMMY_HASH)
        if (!user || !ok) throw new HttpError(401, "Email or password is incorrect.") // Do not reveal whether the email exists.
        setCookie(req, res, user)
        res.json({ user: pub(user) })
    })
)

authRouter.post(
    "/forgot-password",
    asyncHandler(async (req, res) => {
        const d = parse(resendSchema, req.body)
        await issueResetCode(req, d.email)
        res.status(202).json({ ok: true, message: RESET_MESSAGE, resendAfter: OTP_COOLDOWN_MS / 1000 })
    })
)

authRouter.post(
    "/forgot-password/resend",
    asyncHandler(async (req, res) => {
        const d = parse(resendSchema, req.body)
        await issueResetCode(req, d.email)
        res.status(202).json({ ok: true, message: RESET_MESSAGE, resendAfter: OTP_COOLDOWN_MS / 1000 })
    })
)

authRouter.post(
    "/forgot-password/reset",
    asyncHandler(async (req, res) => {
        const d = parse(resetSchema, req.body)
        const bad = new HttpError(400, BAD_CODE, { code: BAD_CODE })
        const p = await PasswordReset.findOneAndUpdate({ email: d.email }, { $inc: { attempts: 1 } }, { new: true })
        if (!p || p.expiresAt.getTime() <= Date.now() || p.attempts > OTP_MAX_TRIES) throw bad
        if (!sameHash(p.otpHash, hashResetCode(req.app.locals.cfg, d.email, d.code))) {
            if (p.attempts >= OTP_MAX_TRIES) {
                await PasswordReset.deleteOne({ _id: p._id })
                throw new HttpError(429, "Too many wrong codes. Please request a new code.")
            }
            throw bad
        }
        const passwordHash = await bcrypt.hash(d.password, 12)
        // Remove the matching code atomically so two reset requests cannot both reuse it.
        const consumed = await PasswordReset.findOneAndDelete({ _id: p._id, otpHash: p.otpHash, attempts: p.attempts })
        if (!consumed) throw bad
        const changed = await User.updateOne(
            { email: d.email },
            { $set: { passwordHash }, $inc: { sessionVersion: 1 } }
        )
        if (!changed.matchedCount) throw bad
        res.json({ ok: true })
    })
)

authRouter.post("/logout", (req, res) => {
    const c = req.app.locals.cfg,
        { maxAge, ...opts } = c.cookie
    res.clearCookie(c.cookieName, opts)
    res.json({ ok: true })
})

authRouter.get("/me", requireAuth, (req, res) => res.json({ user: pub(req.user) }))
