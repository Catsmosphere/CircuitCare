import mongoose from "mongoose"

// Store only a keyed hash of the reset code; MongoDB removes expired requests using the TTL index.
const schema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    otpHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    sends: { type: Number, default: 1 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
})
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const PasswordReset = mongoose.models.PasswordReset || mongoose.model("PasswordReset", schema)
