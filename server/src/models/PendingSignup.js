import mongoose from "mongoose"

// Keep unverified signup details separate from real accounts and let MongoDB remove expired attempts.
const schema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 20, default: "" },
    passwordHash: { type: String, required: true },
    otpHash: { type: String, required: true }, // Save the keyed hash, never the emailed code.
    attempts: { type: Number, default: 0 }, // Count guesses against the current code.
    sends: { type: Number, default: 1 }, // Cap how many codes can be sent for this signup.
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
})
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const PendingSignup = mongoose.models.PendingSignup || mongoose.model("PendingSignup", schema)
