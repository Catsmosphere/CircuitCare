import mongoose from "mongoose"
import { loadConfig } from "./config.js"
import { createApp } from "./app.js"

const cfg = loadConfig() // fails fast if a required secret is missing
await mongoose.connect(cfg.mongoUri, { serverSelectionTimeoutMS: 8000 })
const server = createApp(cfg).listen(cfg.port, () => console.log(`CircuitCare API listening on port ${cfg.port}`))
const stop = () => server.close(() => mongoose.disconnect().then(() => process.exit(0)))
process.on("SIGTERM", stop)
process.on("SIGINT", stop)
