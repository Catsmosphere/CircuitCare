// Send signup and reset codes through Brevo's HTTPS API because our hosts may block SMTP ports.
export async function sendOtpMail(cfg, to, code, purpose = "signup") {
    // Use one email template for both flows so the verification message stays consistent.
    const reset = purpose === "password-reset"
    const heading = reset ? "Reset your password" : "Verify your email"
    const eyebrow = reset ? "Account recovery" : "New account"
    const intro = reset
        ? "Use this one-time code to choose a new password for your CircuitCare account."
        : "Use this one-time code to verify your email and finish creating your CircuitCare account."
    const notice = reset
        ? "If you didn’t request a password reset, you can ignore this email. Your password won’t change."
        : "If you didn’t try to create an account, you can ignore this email. Nothing will happen."
    const messageHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b0d10;color:#ece9e2;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b0d10;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#15181c;border:1px solid #2a2e32;">
        <tr><td style="padding:24px 32px;border-bottom:2px solid #ff5a1f;">
          <span style="display:inline-block;width:9px;height:9px;margin-right:10px;border-radius:50%;background:#ff5a1f;vertical-align:middle;"></span>
          <span style="color:#ece9e2;font-size:18px;font-weight:700;letter-spacing:-.3px;vertical-align:middle;">CircuitCare</span>
        </td></tr>
        <tr><td style="padding:36px 32px 18px;">
          <p style="margin:0 0 10px;color:#ff5a1f;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${eyebrow}</p>
          <h1 style="margin:0 0 14px;color:#ece9e2;font-size:28px;line-height:1.2;">${heading}</h1>
          <p style="margin:0;color:#b8bdc2;font-size:15px;line-height:1.6;">${intro}</p>
        </td></tr>
        <tr><td style="padding:12px 32px 22px;">
          <div style="padding:22px 16px;background:#1c2025;border:1px solid #3a3f44;text-align:center;">
            <p style="margin:0 0 8px;color:#9ea2a7;font-family:monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Verification code</p>
            <p style="margin:0;color:#ece9e2;font-family:monospace;font-size:34px;font-weight:700;letter-spacing:8px;">${code}</p>
          </div>
          <p style="margin:14px 0 0;color:#9ea2a7;font-size:13px;line-height:1.5;">Expires in 10 minutes. This code can be used once.</p>
        </td></tr>
        <tr><td style="padding:0 32px 30px;">
          <p style="margin:0;color:#b8bdc2;font-size:14px;line-height:1.6;">${notice}</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#737980;font-size:11px;line-height:1.5;">CircuitCare Repair · Account security notice</p>
    </td></tr>
  </table>
</body>
</html>`
    if (!cfg.mail) {
        if (cfg.prod) throw new Error("Mail is not configured (set BREVO_API_KEY and MAIL_FROM).")
        console.log(`[dev] ${reset ? "Password reset" : "Sign-up"} code for ${to}: ${code}`) // Print codes only during local testing.
        return
    }
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": cfg.mail.apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
            sender: { name: "CircuitCare", email: cfg.mail.from },
            to: [{ email: to }],
            subject: reset ? "Reset your CircuitCare password" : "Your CircuitCare verification code",
            textContent: reset
                ? `Your CircuitCare password reset code is ${code}.\nIt expires in 10 minutes and can only be used once.\n\nIf you didn't request a password reset, ignore this email. Your password will not change.`
                : `Your CircuitCare code is ${code}.\nIt expires in 10 minutes.\n\nIf you didn't try to create an account, ignore this email and nothing will happen.`,
            htmlContent: messageHtml
        }),
        signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) throw new Error(`Mail provider answered ${res.status}`) // Keep provider details out of logs so keys and email content stay private.
}
