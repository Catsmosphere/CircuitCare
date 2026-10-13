/* Keep login behavior here so the Content-Security-Policy can block inline scripts. */
CC.ready.then(function(){
    var u = CC.me()
    if (u) location.replace(CC.home(u))
    CC.form(
        document.getElementById("f"),
        { email: [CC.V.req("Enter your email."), CC.V.email], password: [CC.V.req("Enter your password.")] },
        function(d){
            return CC.api.login(d.email, d.password).then(function(u){
                // Only honor a simple local HTML page as the next link, never an external URL.
                var n = new URLSearchParams(location.search).get("next")
                location.href = /^[a-z]+\.html$/.test(n || "") ? n : CC.home(u)
            })
        }
    )
})
