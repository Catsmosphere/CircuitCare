/* Page script for login.html (kept in a file so the Content-Security-Policy can forbid inline scripts). */
CC.ready.then(function(){
    var u = CC.me()
    if (u) location.replace(CC.home(u))
    CC.form(
        document.getElementById("f"),
        { email: [CC.V.req("Enter your email."), CC.V.email], password: [CC.V.req("Enter your password.")] },
        function(d){
            return CC.api.login(d.email, d.password).then(function(u){
                var n = new URLSearchParams(location.search).get("next")
                location.href = /^[a-z]+\.html$/.test(n || "") ? n : CC.home(u)
            })
        }
    )
})
