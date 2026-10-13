import { randomInt } from "node:crypto"

export class HttpError extends Error {
    constructor(status, message, fields) {
        super(message)
        this.status = status
        this.fields = fields
    }
}
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// Validate untrusted input. Zod only lets through the exact types we declare, so objects like {"$gt": ""} are rejected.
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
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const TICKET_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
// Random, unguessable ticket code (uses the secure random generator, not Math.random).
export const newTicketNo = () =>
    Array.from({ length: 5 }, () => TICKET_ALPHABET[randomInt(TICKET_ALPHABET.length)]).join("")
