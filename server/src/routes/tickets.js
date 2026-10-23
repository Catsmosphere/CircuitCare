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
        issue: z
            .string()
            .trim()
            .min(10, "Add a little more detail (at least 10 characters).")
            .max(1000)
            .refine((s) => /\p{L}/u.test(s), "Describe the problem using words, not numbers alone."),
    })
    .strict()
const updateSchema = z
    .object({
        status: z.enum(STATUSES, { message: "Choose a status." }),
        note: z.string().trim().max(500).optional().default(""),
        estimatedCost: z.number().min(0).max(10_000_000).optional()
    })
    .strict()
const feedbackSchema = z
    .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(1000).optional().default("")
    })
    .strict()
const listQuery = z.object({ status: z.enum(STATUSES).optional(), q: z.string().trim().max(60).optional() }).strict()

// Shape database tickets into the smaller response used by both customer and owner pages.
const out = (t, customer) => ({
    no: t.ticketNo,
    device: t.deviceType,
    model: t.deviceModel,
    issue: t.issue,
    status: t.status,
    estimatedCost: t.estimatedCost ?? null,
    feedback: t.feedback
        ? { rating: t.feedback.rating, comment: t.feedback.comment, submittedAt: t.feedback.submittedAt }
        : null,
    createdAt: t.createdAt,
    updates: t.updates.map((u) => ({ status: u.status, note: u.note, at: u.at })),
    ...(customer ? { customer: { name: customer.name, phone: customer.phone, email: customer.email } } : {})
})

export const ticketRouter = Router()

// Customer routes only return tickets owned by the signed-in customer.
ticketRouter.post(
    "/",
    requireAuth,
    requireRole("customer"),
    asyncHandler(async (req, res) => {
        const d = parse(createSchema, req.body)
        const makeNo = req.app.locals.newTicketNo || newTicketNo // Let tests provide predictable numbers without changing production generation.
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
                if (e && e.code === 11000 && e.keyPattern && e.keyPattern.ticketNo) continue // Try another number only when this ticket code is already taken.
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
        const t = await Ticket.findOne({ ticketNo: parse(NO, req.params.no), customer: req.user._id }) // Include the account in the query so customers cannot fetch someone else's ticket.
        if (!t) throw new HttpError(404, "No ticket found with that number on your account.") // Use the same response for missing and other people's tickets.
        res.json({ ticket: out(t) })
    })
)

ticketRouter.post(
    "/mine/:no/feedback",
    requireAuth,
    requireRole("customer"),
    asyncHandler(async (req, res) => {
        const no = parse(NO, req.params.no),
            d = parse(feedbackSchema, req.body)
        const t = await Ticket.findOneAndUpdate(
            {
                ticketNo: no,
                customer: req.user._id,
                status: "Closed",
                "feedback.submittedAt": mongoose.trusted({ $exists: false })
            },
            { $set: { feedback: { ...d, submittedAt: new Date() } } },
            { new: true, runValidators: true }
        )
        if (!t) {
            const owned = await Ticket.findOne({ ticketNo: no, customer: req.user._id })
            if (!owned) throw new HttpError(404, "No ticket found with that number on your account.")
            if (owned.status !== "Closed") throw new HttpError(409, "You can leave feedback after the repair is closed.")
            throw new HttpError(409, "Feedback has already been submitted and cannot be changed.")
        }
        res.status(201).json({ ticket: out(t) })
    })
)

// Owner routes can search and update any ticket after the role check passes.
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
        if (STATUSES.indexOf(d.status) < STATUSES.indexOf(t.status))
            throw new HttpError(409, "A ticket cannot move back to an earlier status.", { status: "Choose the current status or a later step." })
        t.status = d.status
        if (d.estimatedCost !== undefined) t.estimatedCost = d.estimatedCost
        t.updates.push({ status: d.status, note: d.note || `Status changed to ${d.status}.`, by: req.user._id })
        await t.save()
        await t.populate("customer", "name phone email")
        res.json({ ticket: out(t, t.customer) })
    })
)
