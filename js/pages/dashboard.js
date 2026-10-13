/* Page script for dashboard.html (kept in a file so the Content-Security-Policy can forbid inline scripts). */
CC.ready.then(function(){
    var u = CC.guard("customer")
    if (u) {
        var e = CC.esc
        document.getElementById("hi").textContent = "Hi, " + u.name.split(" ")[0] + "."
        if (location.search.indexOf("welcome=1") > -1)
            CC.toast("Account created. Welcome, " + u.name.split(" ")[0] + "!")
        var title = function(t){
            return e(t.device + (t.model ? " (" + t.model + ")" : ""))
        }
        var card = function(t){
            return CC.tag(t, { link: true })
        }
        var row = function(t){
            return (
                '<li><span class="mono">' +
                t.no +
                "</span><span>" +
                e(t.device) +
                '</span><span class="muted">' +
                e(t.issue) +
                "</span>" +
                CC.badge(t.status) +
                '<span class="mono muted">' +
                CC.date(t.updates[t.updates.length - 1].at) +
                "</span></li>"
            )
        }
        CC.api.myTickets().then(function(ts){
            var act = ts.filter(function(t){
                    return t.status !== "Closed"
                }),
                past = ts.filter(function(t){
                    return t.status === "Closed"
                }),
                h = ""
            if (!ts.length)
                h =
                    '<div class="card empty"><h2>No repairs yet</h2><p class="muted">When you send a request, it shows up here with a ticket number.</p><a class="btn btn-primary" href="request.html">Request a repair</a></div>'
            else {
                h =
                    '<section aria-labelledby="cur"><h2 id="cur">Current repairs</h2><div class="stack">' +
                    (act.length
                        ? act.map(card).join("")
                        : '<div class="card muted">No repairs in progress right now.</div>') +
                    "</div></section>"
                if (past.length)
                    h +=
                        '<section aria-labelledby="past"><h2 id="past">Past repairs</h2><ul class="rows">' +
                        past.map(row).join("") +
                        "</ul></section>"
            }
            document.getElementById("out").innerHTML = h
        })
    }
})
