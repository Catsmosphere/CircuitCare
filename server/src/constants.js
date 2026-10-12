export const DEVICES = ["Laptop", "Desktop", "Phone", "Tablet", "Other"]
export const STATUSES = ["Received", "Diagnosing", "In progress", "Ready", "Closed"]
// Ticket codes: 5 random characters, no I, L, O, 0 or 1 (easy to read aloud). 31^5 is about 28 million codes.
export const TICKET_NO = /^[A-HJKMNP-Z2-9]{5}$/
export const COOKIE = "cc_token"
