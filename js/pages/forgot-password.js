/* Page script for forgot-password.html. */
CC.ready.then(function(){
    var email = "",
        timer = null,
        step1 = document.getElementById("step1"),
        step2 = document.getElementById("step2"),
        complete = document.getElementById("complete"),
        resend = document.getElementById("resend")

    function show(el, on){
        el.hidden = !on
    }

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
