import mongoose from "mongoose"

const schema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        phone: { type: String, trim: true, maxlength: 20, default: "" },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
        passwordHash: { type: String, required: true, select: false }, // Hide hashes from queries unless authentication needs one.
        role: { type: String, enum: ["customer", "owner"], default: "customer" },
        sessionVersion: { type: Number, default: 0 }
    },
    { timestamps: true }
)

export const User = mongoose.models.User || mongoose.model("User", schema)
