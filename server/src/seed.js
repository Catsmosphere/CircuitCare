// Creates (or resets) the shop owner's account. Run once:  npm run seed
import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import { loadConfig } from "./config.js"
import { User } from "./models/User.js"

const cfg = loadConfig()
const email = (process.env.OWNER_EMAIL || "").trim().toLowerCase()
const password = process.env.OWNER_PASSWORD || ""
if (!email || password.length < 12) {
    console.error("Set OWNER_EMAIL and OWNER_PASSWORD (at least 12 characters) in .env first.")
    process.exit(1)
}
await mongoose.connect(cfg.mongoUri)
await User.init() // make sure the unique email index exists
await User.findOneAndUpdate(
    { email },
    {
        $set: {
            name: process.env.OWNER_NAME || "Shop Owner",
            passwordHash: await bcrypt.hash(password, 12),
            role: "owner"
        }
    },
    { upsert: true, setDefaultsOnInsert: true }
)
console.log("Owner account ready:", email)
await mongoose.disconnect()
