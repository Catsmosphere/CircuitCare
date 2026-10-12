import mongoose from "mongoose"

const schema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        phone: { type: String, trim: true, maxlength: 20, default: "" },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
        passwordHash: { type: String, required: true, select: false }, // never returned unless explicitly requested
        role: { type: String, enum: ["customer", "owner"], default: "customer" }
    },
    { timestamps: true }
)

export const User = mongoose.models.User || mongoose.model("User", schema)
