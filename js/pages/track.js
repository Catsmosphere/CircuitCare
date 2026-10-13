/* Page script for track.html (kept in a file so the Content-Security-Policy can forbid inline scripts). */
CC.ready.then(function(){
    var u = CC.guard("customer")
    if (u) {
        var out = document.getElementById("out"),
            inp = document.getElementById("ticket")
        var show = function(no){
            return CC.api.myTicket(no).then(function(t){
                if (!t) {
                    out.innerHTML =
                        '<p class="card muted">No ticket found with that number on your account. Check the number and try again.</p>'
                    return
                }
                history.replaceState(null, "", "?ticket=" + encodeURIComponent(t.no))
                out.innerHTML =
                    CC.tag(t) +
                    (t.cost != null
                        ? '<p class="card"><span class="mono muted">ESTIMATED COST</span><br><strong class="mono">' +
                          CC.money(t.cost) +
                          "</strong></p>"
                        : "") +
                    '<section class="card" aria-labelledby="hist"><h2 id="hist" class="eyebrow card-title">History</h2>' +
                    CC.timeline(t) +
                    "</section>"
            })
        }
        CC.form(
            document.getElementById("f"),
            { ticket: [CC.V.req("Enter your ticket number, like A3N4K.")] },
            function(d){
                return show(d.ticket)
            }
        )
        var q = new URLSearchParams(location.search).get("ticket")
        if (q) {
            inp.value = q
            show(q)
        } else
            CC.api.myTickets().then(function(ts){
                var t =
                    ts.filter(function(x){
                        return x.status !== "Closed"
                    })[0] || ts[0]
                if (t) {
                    inp.value = t.no
                    show(t.no)
                }
            })
    }
})
