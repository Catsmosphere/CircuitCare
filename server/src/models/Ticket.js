import mongoose from "mongoose"
import { DEVICES, STATUSES, TICKET_NO } from "../constants.js"

// Keep each status update inside its ticket because it has no meaning without that ticket.
const updateSchema = new mongoose.Schema(
    {
        status: { type: String, enum: STATUSES, required: true },
        note: { type: String, maxlength: 500, default: "" },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now }
    },
    { _id: false }
)

const feedbackSchema = new mongoose.Schema(
    {
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, trim: true, maxlength: 1000, default: "" },
        submittedAt: { type: Date, required: true }
    },
    { _id: false }
)

const schema = new mongoose.Schema(
    {
        ticketNo: { type: String, required: true, unique: true, match: TICKET_NO },
        customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // Reference the account so its contact details stay current.
        deviceType: { type: String, enum: DEVICES, required: true },
        deviceModel: { type: String, trim: true, maxlength: 80, default: "" },
        issue: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
        photoData: { type: Buffer, select: false },
        status: { type: String, enum: STATUSES, default: "Received", index: true },
        estimatedCost: { type: Number, min: 0 },
        updates: { type: [updateSchema], default: [] },
        feedback: { type: feedbackSchema, default: undefined }
    },
    { timestamps: true }
)

export const Ticket = mongoose.models.Ticket || mongoose.model("Ticket", schema)
