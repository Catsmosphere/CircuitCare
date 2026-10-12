/* Page script for request.html (kept in a file so the Content-Security-Policy can forbid inline scripts). */
CC.ready.then(function(){
    var u = CC.guard("customer")
    if (u) {
        document.getElementById("who").textContent = u.name + (u.phone ? " (" + u.phone + ")" : "")
        var f = document.getElementById("f"),
            dirty = false
        f.addEventListener("input", function(){
            dirty = true
        })
        window.addEventListener("beforeunload", function(e){
            if (dirty) {
                e.preventDefault()
                e.returnValue = ""
            }
        })
        CC.form(
            f,
            {
                device: [CC.V.req("Choose the type of device.")],
                model: [],
                issue: [
                    CC.V.req("Describe what’s wrong."),
                    function(v){
                        return v.length >= 10 ? "" : "Add a little more detail (at least 10 characters)."
                    }
                ]
            },
            function(d){
                return CC.api.createTicket(d).then(function(t){
                    dirty = false
                    f.hidden = true
                    document.getElementById("done-no").textContent = t.no
                    document.getElementById("done-track").href = "track.html?ticket=" + encodeURIComponent(t.no)
                    var s = document.getElementById("done")
                    s.hidden = false
                    document.getElementById("done-title").focus()
                    CC.toast("Request sent. Your ticket is " + t.no + ".")
                })
            }
        )
    }
})
