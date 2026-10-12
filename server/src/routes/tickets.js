import { Router } from "express"
import mongoose from "mongoose"
import { z } from "zod"
import { Ticket } from "../models/Ticket.js"
import { User } from "../models/User.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { HttpError, asyncHandler, parse, escapeRegex, newTicketNo } from "../util.js"
import { DEVICES, STATUSES, TICKET_NO } from "../constants.js"

const NO = z.string().trim().toUpperCase().regex(TICKET_NO, "Invalid ticket number.")
const createSchema = z
    .object({
        device: z.enum(DEVICES, { message: "Choose the type of device." }),
        model: z.string().trim().max(80).optional().default(""),
        issue: z.string().trim().min(10, "Add a little more detail (at least 10 characters).").max(1000)
    })
    .strict()
const updateSchema = z
    .object({
        status: z.enum(STATUSES, { message: "Choose a status." }),
        note: z.string().trim().max(500).optional().default(""),
        estimatedCost: z.number().min(0).max(10_000_000).optional()
    })
    .strict()
const listQuery = z.object({ status: z.enum(STATUSES).optional(), q: z.string().trim().max(60).optional() }).strict()

const out = (t, customer) => ({
    no: t.ticketNo,
    device: t.deviceType,
    model: t.deviceModel,
    issue: t.issue,
    status: t.status,
    estimatedCost: t.estimatedCost ?? null,
    createdAt: t.createdAt,
    updates: t.updates.map((u) => ({ status: u.status, note: u.note, at: u.at })),
    ...(customer ? { customer: { name: customer.name, phone: customer.phone, email: customer.email } } : {})
})

export const ticketRouter = Router()

// ---- customer ----
ticketRouter.post(
    "/",
    requireAuth,
    requireRole("customer"),
    asyncHandler(async (req, res) => {
        const d = parse(createSchema, req.body)
        const makeNo = req.app.locals.newTicketNo || newTicketNo // (tests can swap the generator)
        let t
        for (let attempt = 0; attempt < 5 && !t; attempt++) {
            try {
                t = await Ticket.create({
                    ticketNo: makeNo(),
                    customer: req.user._id,
                    deviceType: d.device,
                    deviceModel: d.model,
                    issue: d.issue,
                    updates: [{ status: "Received", note: "Ticket created from the online request.", by: req.user._id }]
                })
            } catch (e) {
                if (e && e.code === 11000 && e.keyPattern && e.keyPattern.ticketNo) continue // that code is taken, draw another
                throw e
            }
        }
        if (!t) throw new HttpError(503, "Could not create the ticket. Please try again.")
        res.status(201).json({ ticket: out(t) })
    })
)

ticketRouter.get(
    "/mine",
    requireAuth,
    requireRole("customer"),
    asyncHandler(async (req, res) => {
        const ts = await Ticket.find({ customer: req.user._id }).sort({ createdAt: -1 }).limit(100)
        res.json({ tickets: ts.map((t) => out(t)) })
    })
)

ticketRouter.get(
    "/mine/:no",
    requireAuth,
    requireRole("customer"),
    asyncHandler(async (req, res) => {
        const t = await Ticket.findOne({ ticketNo: parse(NO, req.params.no), customer: req.user._id }) // ownership check
        if (!t) throw new HttpError(404, "No ticket found with that number on your account.") // same answer for "not yours"
        res.json({ ticket: out(t) })
    })
)

// ---- owner ----
ticketRouter.get(
    "/",
    requireAuth,
    requireRole("owner"),
    asyncHandler(async (req, res) => {
        const { status, q } = parse(listQuery, req.query)
        const filter = {}
        if (status) filter.status = status
        if (q) {
            const rx = new RegExp(escapeRegex(q), "i")
            const ids = (await User.find({ name: rx }).select("_id").limit(50)).map((u) => u._id)
            filter.$or = [
                { ticketNo: new RegExp("^" + escapeRegex(q), "i") },
                { customer: mongoose.trusted({ $in: ids }) }
            ]
        }
        const ts = await Ticket.find(filter).sort({ createdAt: -1 }).limit(200).populate("customer", "name phone email")
        res.json({ tickets: ts.map((t) => out(t, t.customer)) })
    })
)

ticketRouter.get(
    "/:no",
    requireAuth,
    requireRole("owner"),
    asyncHandler(async (req, res) => {
        const t = await Ticket.findOne({ ticketNo: parse(NO, req.params.no) }).populate("customer", "name phone email")
        if (!t) throw new HttpError(404, "Ticket not found.")
        res.json({ ticket: out(t, t.customer) })
    })
)

ticketRouter.patch(
    "/:no",
    requireAuth,
    requireRole("owner"),
    asyncHandler(async (req, res) => {
        const no = parse(NO, req.params.no),
            d = parse(updateSchema, req.body)
        const t = await Ticket.findOne({ ticketNo: no })
        if (!t) throw new HttpError(404, "Ticket not found.")
        t.status = d.status
        if (d.estimatedCost !== undefined) t.estimatedCost = d.estimatedCost
        t.updates.push({ status: d.status, note: d.note || `Status changed to ${d.status}.`, by: req.user._id })
        await t.save()
        await t.populate("customer", "name phone email")
        res.json({ ticket: out(t, t.customer) })
    })
)
