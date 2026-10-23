import { Router } from "express"
import { z } from "zod"
import { User } from "../models/User.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { HttpError, asyncHandler, parse } from "../util.js"

const idSchema = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid account ID.")
const stateSchema = z.object({ enabled: z.boolean() }).strict()
const account = (u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    phone: u.phone,
    createdAt: u.createdAt,
    enabled: u.active !== false
})

export const accountRouter = Router()

accountRouter.get(
    "/",
    requireAuth,
    requireRole("owner"),
    asyncHandler(async (req, res) => {
        const users = await User.find({ role: "customer" }).select("name email phone createdAt active").sort({ createdAt: -1 })
        res.json({ accounts: users.map(account) })
    })
)

accountRouter.patch(
    "/:id",
    requireAuth,
    requireRole("owner"),
    asyncHandler(async (req, res) => {
        const id = parse(idSchema, req.params.id),
            d = parse(stateSchema, req.body)
        const result = await User.updateOne(
            { _id: id, role: "customer" },
            { $set: { active: d.enabled }, $inc: { sessionVersion: 1 } }
        )
        if (!result.matchedCount) throw new HttpError(404, "Customer account not found.")
        res.json({ account: account(await User.findById(id)) })
    })
)
