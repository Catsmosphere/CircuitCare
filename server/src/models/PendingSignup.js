import mongoose from "mongoose"

// A sign-up that is waiting for its email code. It becomes a real User only after the code is verified.
// MongoDB deletes it by itself once expiresAt passes (TTL index below), so unverified sign-ups never pile up.
const schema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 20, default: "" },
    passwordHash: { type: String, required: true },
    otpHash: { type: String, required: true }, // HMAC of the code, never the code itself
    attempts: { type: Number, default: 0 }, // wrong guesses on the current code
    sends: { type: Number, default: 1 }, // codes emailed during this sign-up
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
})
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const PendingSignup = mongoose.models.PendingSignup || mongoose.model("PendingSignup", schema)
