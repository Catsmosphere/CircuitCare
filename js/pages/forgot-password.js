/* Keep reset steps here so the page can request, verify, and finish a password reset. */
CC.ready.then(function(){
    var email = "",
        timer = null,
        step1 = document.getElementById("step1"),
        step2 = document.getElementById("step2"),
        complete = document.getElementById("complete"),
        resend = document.getElementById("resend")

    // Switch between the email, code, and confirmation panels without losing the entered email.
    function show(el, on){
        el.hidden = !on
    }

    // Keep resend disabled until the server's cooldown has elapsed.
    function cooldown(seconds){
        var left = seconds
        clearInterval(timer)
        resend.disabled = true
        resend.textContent = "Send a new code (" + left + "s)"
        timer = setInterval(function(){
            left -= 1
            if (left <= 0) {
                clearInterval(timer)
                resend.disabled = false
                resend.textContent = "Send a new code"
                return
            }
            resend.textContent = "Send a new code (" + left + "s)"
        }, 1000)
    }

    // Request a code first; the server uses the same response whether or not the email has an account.
    CC.form(
        document.getElementById("request-form"),
        { email: [CC.V.req("Enter your email."), CC.V.email] },
        function(d){
            email = d.email
            return CC.api.requestPasswordReset(email).then(function(j){
                document.getElementById("sent-to").textContent = j.message
                show(step1, false)
                show(step2, true)
                document.getElementById("code").focus()
                cooldown(j.resendAfter || 60)
            })
        }
    )

    // Send the code and new password only after the customer reaches the verification step.
    CC.form(
        document.getElementById("reset-form"),
        {
            code: [
                CC.V.req("Enter the 6-digit code."),
                function(v){
                    return /^[0-9]{6}$/.test(v) ? "" : "The code has 6 digits."
                }
            ],
            password: [CC.V.req("Choose a new password."), CC.V.pw]
        },
        function(d){
            return CC.api.resetPassword(email, d.code, d.password).then(function(){
                clearInterval(timer)
                show(step2, false)
                show(complete, true)
                complete.querySelector("h2").focus()
            })
        }
    )

    resend.addEventListener("click", function(){
        resend.disabled = true
        CC.api
            .resendPasswordReset(email)
            .then(function(j){
                CC.toast("If an account exists for that email, a new code will arrive shortly.")
                cooldown(j.resendAfter || 60)
            })
            .catch(function(e){
                CC.toast(e.message)
                cooldown(10)
            })
    })
})
