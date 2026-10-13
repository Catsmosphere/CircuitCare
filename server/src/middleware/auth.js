import jwt from "jsonwebtoken"
import { User } from "../models/User.js"
import { HttpError } from "../util.js"

// Include the session version so password resets can invalidate every older login token.
export const signToken = (cfg, user) =>
    jwt.sign({ sub: String(user._id), ver: user.sessionVersion || 0 }, cfg.jwtSecret, { algorithm: "HS256", expiresIn: "8h" })

export async function requireAuth(req, res, next) {
    // Verify the signed cookie, then reload the account so deleted users and stale sessions lose access.
    try {
        const token = req.cookies && req.cookies[req.app.locals.cfg.cookieName]
        if (typeof token !== "string") throw new HttpError(401, "Please log in.")
        let payload
        try {
            payload = jwt.verify(token, req.app.locals.cfg.jwtSecret, { algorithms: ["HS256"] })
        } catch {
            // Accept only the signing algorithm used by signToken.
            throw new HttpError(401, "Please log in again.")
        }
        if (typeof payload.sub !== "string") throw new HttpError(401, "Please log in again.")
        const user = await User.findById(payload.sub) // Read the current role from MongoDB instead of trusting a token claim.
        if (!user) throw new HttpError(401, "Please log in again.")
        if ((payload.ver || 0) !== (user.sessionVersion || 0)) throw new HttpError(401, "Please log in again.")
        req.user = user
        next()
    } catch (e) {
        next(e)
    }
}

// Keep role checks beside authentication so every protected route uses the same rule.
export const requireRole = (role) => (req, res, next) =>
    req.user && req.user.role === role ? next() : next(new HttpError(403, "You do not have access to this."))
