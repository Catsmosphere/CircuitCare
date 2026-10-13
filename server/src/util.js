import { randomInt } from "node:crypto"

export class HttpError extends Error {
    constructor(status, message, fields) {
        super(message)
        this.status = status
        this.fields = fields
    }
}
// Forward rejected async route handlers to Express's error handler.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// Only pass validated fields to routes, which also blocks payloads that try to sneak in MongoDB operators.
export function parse(schema, data) {
    const r = schema.safeParse(data)
    if (r.success) return r.data
    const fields = {}
    for (const i of r.error.issues) {
        const k = i.path.join(".") || "_"
        if (!fields[k]) fields[k] = i.message
    }
    throw new HttpError(400, "Please check the highlighted fields.", fields)
}
// Escape search text before using it in a regular expression, so users cannot change the query pattern.
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const TICKET_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
// Use a cryptographic random source and skip look-alike characters to make ticket codes easier to read.
export const newTicketNo = () =>
    Array.from({ length: 5 }, () => TICKET_ALPHABET[randomInt(TICKET_ALPHABET.length)]).join("")
