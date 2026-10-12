// Sends the sign-up code by email through Brevo's HTTPS API (free plan: 300 emails a day).
// Why an API and not SMTP: many free hosts (Render included) block the SMTP ports, but HTTPS always works.
export async function sendOtpMail(cfg, to, code) {
    if (!cfg.mail) {
        if (cfg.prod) throw new Error("Mail is not configured (set BREVO_API_KEY and MAIL_FROM).")
        console.log(`[dev] Sign-up code for ${to}: ${code}`) // local testing only: never happens in production
        return
    }
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": cfg.mail.apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
            sender: { name: "CircuitCare", email: cfg.mail.from },
            to: [{ email: to }],
            subject: "Your CircuitCare verification code",
            textContent: `Your CircuitCare code is ${code}.\nIt expires in 10 minutes.\n\nIf you didn't try to create an account, ignore this email and nothing will happen.`
        }),
        signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) throw new Error(`Mail provider answered ${res.status}`) // status only: never log the key or the body
}
