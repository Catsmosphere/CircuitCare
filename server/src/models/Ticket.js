import mongoose from "mongoose"
import { DEVICES, STATUSES, TICKET_NO } from "../constants.js"

// Embedded status history: a StatusUpdate only exists as part of its ticket (composition in the class diagram).
const updateSchema = new mongoose.Schema(
    {
        status: { type: String, enum: STATUSES, required: true },
        note: { type: String, maxlength: 500, default: "" },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now }
    },
    { _id: false }
)

const schema = new mongoose.Schema(
    {
        ticketNo: { type: String, required: true, unique: true, match: TICKET_NO },
        customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // referenced
        deviceType: { type: String, enum: DEVICES, required: true },
        deviceModel: { type: String, trim: true, maxlength: 80, default: "" },
        issue: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
        status: { type: String, enum: STATUSES, default: "Received", index: true },
        estimatedCost: { type: Number, min: 0 },
        updates: { type: [updateSchema], default: [] }
    },
    { timestamps: true }
)

export const Ticket = mongoose.models.Ticket || mongoose.model("Ticket", schema)
