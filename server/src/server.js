import mongoose from "mongoose"
import { loadConfig } from "./config.js"
import { createApp } from "./app.js"

const cfg = loadConfig() // Stop startup early if a required secret or setting is missing.
// Connect before opening the port so API requests never arrive before the database is ready.
await mongoose.connect(cfg.mongoUri, { serverSelectionTimeoutMS: 8000 })
const server = createApp(cfg).listen(cfg.port, () => console.log(`CircuitCare API listening on port ${cfg.port}`))
// Close the listener and database cleanly when the host asks this process to stop.
const stop = () => server.close(() => mongoose.disconnect().then(() => process.exit(0)))
process.on("SIGTERM", stop)
process.on("SIGINT", stop)
