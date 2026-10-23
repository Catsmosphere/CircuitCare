/* Keep repair-request behavior here so the Content-Security-Policy can block inline scripts. */
CC.ready.then(function(){
    var u = CC.guard("customer")
    if (u) {
        document.getElementById("who").textContent = u.name + (u.phone ? " (" + u.phone + ")" : "")
        var f = document.getElementById("f"),
            dirty = false
        // Warn customers before they leave a request they have started filling in.
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
                        if (v.length < 10) return "Add a little more detail (at least 10 characters)."
                        return /\p{L}/u.test(v) ? "" : "Describe the problem using words, not numbers alone."
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
