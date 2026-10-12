// A tiny in-memory stand-in for MongoDB, so the API's own logic (roles, ownership, validation, ticket flow)
// can be tested without a database. It replaces the model methods the routes use. It is NOT a MongoDB replacement.
import { User } from "../src/models/User.js"
import { Ticket } from "../src/models/Ticket.js"
import { PendingSignup } from "../src/models/PendingSignup.js"

class Query {
    constructor(fn) {
        this.fn = fn
        this.pop = false
    }
    select() {
        return this
    }
    sort() {
        return this
    }
    limit() {
        return this
    }
    populate() {
        this.pop = true
        return this
    }
    then(a, b) {
        return Promise.resolve()
            .then(() => this.fn(this))
            .then(a, b)
    }
}

export function installFakeDb() {
    const db = { users: [], tickets: [], pending: [] }
    let n = 0
    const oid = () => (++n).toString(16).padStart(24, "0")

    const makeTicket = (d) => {
        const t = { _id: oid(), ...d, createdAt: new Date(), updatedAt: new Date() }
        let populated = false
        const cid = String(d.customer)
        const updates = []
        updates.push = function(u){
            Array.prototype.push.call(this, { note: "", at: new Date(), ...u })
            return this.length
        }
        ;(d.updates || []).forEach((u) => updates.push(u))
        Object.defineProperty(t, "updates", { value: updates, writable: true, enumerable: true })
        Object.defineProperty(t, "customer", {
            enumerable: true,
            get: () => (populated ? db.users.find((u) => u._id === cid) || null : cid)
        })
        Object.defineProperty(t, "_cid", { value: cid })
        Object.defineProperty(t, "_pop", {
            value: () => {
                populated = true
            }
        })
        Object.defineProperty(t, "populate", {
            value: async function(){
                populated = true
                return this
            }
        })
        Object.defineProperty(t, "save", {
            value: async function(){
                this.updatedAt = new Date()
                return this
            }
        })
        return t
    }
    const match = (t, f) => {
        if (f.ticketNo !== undefined && t.ticketNo !== f.ticketNo) return false
        if (f.customer !== undefined && t._cid !== String(f.customer)) return false
        if (f.status !== undefined && t.status !== f.status) return false
        if (
            f.$or &&
            !f.$or.some(
                (c) =>
                    (c.ticketNo instanceof RegExp && c.ticketNo.test(t.ticketNo)) ||
                    (c.customer && c.customer.$in && c.customer.$in.map(String).includes(t._cid))
            )
        )
            return false
        return true
    }

    User.exists = async (f) => (db.users.find((u) => u.email === f.email) ? { _id: "x" } : null)
    User.create = async (d) => {
        const u = { _id: oid(), role: "customer", phone: "", createdAt: new Date(), ...d }
        db.users.push(u)
        return u
    }
    User.findOne = (f) => new Query(() => db.users.find((u) => u.email === f.email) || null)
    User.findById = async (id) => db.users.find((u) => u._id === String(id)) || null
    // Sign-ups waiting for their email code. Supports only the $set / $inc / upsert forms the routes use.
    PendingSignup.findOne = (f) => new Query(() => db.pending.find((p) => p.email === f.email) || null)
    PendingSignup.findOneAndUpdate = async (f, u, o = {}) => {
        let p = db.pending.find((x) => x.email === f.email)
        if (!p) {
            if (!o.upsert) return null
            p = { _id: oid(), email: f.email, attempts: 0, sends: 1 }
            db.pending.push(p)
        }
        Object.assign(p, u.$set || {})
        for (const [k, v] of Object.entries(u.$inc || {})) p[k] = (p[k] || 0) + v
        return p
    }
    PendingSignup.deleteOne = async (f) => {
        const i = db.pending.findIndex((p) => p.email === f.email)
        if (i >= 0) db.pending.splice(i, 1)
        return { deletedCount: i >= 0 ? 1 : 0 }
    }
    User.find = (f) => new Query(() => db.users.filter((u) => (f.name instanceof RegExp ? f.name.test(u.name) : true)))
    Ticket.create = async (d) => {
        if (db.tickets.some((x) => x.ticketNo === d.ticketNo))
            throw Object.assign(new Error("E11000 duplicate key"), { code: 11000, keyPattern: { ticketNo: 1 } })
        const t = makeTicket({ status: "Received", deviceModel: "", ...d })
        db.tickets.push(t)
        return t
    }
    Ticket.find = (f = {}) =>
        new Query((q) => {
            const r = db.tickets.filter((t) => match(t, f)).sort((a, b) => b._id.localeCompare(a._id))
            if (q.pop) r.forEach((t) => t._pop())
            return r
        })
    Ticket.findOne = (f) =>
        new Query((q) => {
            const t = db.tickets.find((x) => match(x, f)) || null
            if (t && q.pop) t._pop()
            return t
        })
    return db
}
