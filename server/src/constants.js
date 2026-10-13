export const DEVICES = ["Laptop", "Desktop", "Phone", "Tablet", "Other"]
export const STATUSES = ["Received", "Diagnosing", "In progress", "Ready", "Closed"]
// Leave out look-alike characters so customers can read a five-character ticket code over the phone.
export const TICKET_NO = /^[A-HJKMNP-Z2-9]{5}$/
export const COOKIE = "cc_token"
