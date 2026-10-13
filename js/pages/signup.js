/* Page script for signup.html (kept in a file so the Content-Security-Policy can forbid inline scripts). */
CC.ready.then(function(){
    var u = CC.me()
    if (u) location.replace(CC.home(u))

    var step1 = document.getElementById("step1"),
        step2 = document.getElementById("step2"),
        resend = document.getElementById("resend"),
        email = "",
        timer = null

    function show(el, on){
        el.hidden = !on
        el.style.display = on ? "" : "none"
    }

    /* The "send a new code" button waits out the server's cooldown, so people don't hammer it. */
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

    /* Step 1: details. The server checks them and emails a code. No account exists yet. */
    CC.form(
        document.getElementById("f"),
        {
            name: [CC.V.req("Enter your full name.")],
            phone: [CC.V.req("Enter your phone number."), CC.V.phone],
            email: [CC.V.req("Enter your email."), CC.V.email],
            password: [CC.V.req("Choose a password."), CC.V.pw]
        },
        function(d){
            return CC.api.signup(d).then(function(j){
                email = d.email
                document.getElementById("sent-to").textContent = "We sent a 6-digit code to " + email + "."
                show(step1, false)
                show(step2, true)
                document.getElementById("code").focus()
                cooldown(j.resendAfter || 60)
            })
        }
    )

    /* Step 2: the code. Only a correct code creates the account and logs the user in. */
    CC.form(
        document.getElementById("v"),
        {
            code: [
                CC.V.req("Enter the 6-digit code."),
                function(v){
                    return /^[0-9]{6}$/.test(v) ? "" : "The code has 6 digits."
                }
            ]
        },
        function(d){
            return CC.api.verifyEmail(email, d.code).then(function(){
                location.href = "dashboard.html?welcome=1"
            })
        }
    )

    resend.addEventListener("click", function(){
        resend.disabled = true
        CC.api
            .resendCode(email)
            .then(function(j){
                CC.toast("A new code is on its way.")
                cooldown(j.resendAfter || 60)
            })
            .catch(function(e){
                CC.toast(e.message)
                cooldown(10)
            })
    })
})
