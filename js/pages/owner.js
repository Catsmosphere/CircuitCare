/* Page script for owner.html (kept in a file so the Content-Security-Policy can forbid inline scripts). */
CC.ready.then(function(){
    var u = CC.guard("owner")
    if (u) {
        var e = CC.esc,
            all = [],
            P = new URLSearchParams(location.search),
            state = { status: P.get("status") || "All", q: P.get("q") || "" }
        var el = function(id){
            return document.getElementById(id)
        }
        el("q").value = state.q
        var fb = ["All"].concat(CC.STATUSES)
        el("filters").innerHTML = fb
            .map(function(s){
                return (
                    '<button class="chip-btn" type="button" data-s="' +
                    e(s) +
                    '" aria-pressed="false">' +
                    e(s) +
                    "</button>"
                )
            })
            .join("")
        var count = function(a){
            return all.filter(function(t){
                return a.indexOf(t.status) > -1
            }).length
        }
        function render() {
            var p = new URLSearchParams()
            if (state.status !== "All") p.set("status", state.status)
            if (state.q) p.set("q", state.q)
            history.replaceState(null, "", p.toString() ? "?" + p : location.pathname)
            ;[].forEach.call(el("filters").children, function(b){
                b.setAttribute("aria-pressed", String(b.dataset.s === state.status))
            })
            el("stats").innerHTML = [
                ["New requests", count(["Received"])],
                ["In repair", count(["Diagnosing", "In progress"])],
                ["Ready for pickup", count(["Ready"])],
                ["Closed", count(["Closed"])]
            ]
                .map(function(s){
                    return (
                        '<div class="card stat"><span class="mono muted">' +
                        s[0].toUpperCase() +
                        '</span><span class="big">' +
                        s[1] +
                        "</span></div>"
                    )
                })
                .join("")
            var q = state.q.toLowerCase(),
                rows = all.filter(function(t){
                    return (
                        (state.status === "All" || t.status === state.status) &&
                        (!q || t.no.indexOf(q) > -1 || t.customer.toLowerCase().indexOf(q) > -1)
                    )
                })
            el("list").innerHTML = rows.length
                ? '<li class="head" aria-hidden="true"><span>Ticket</span><span>Customer</span><span>Device</span><span>Issue</span><span>Status</span><span>Updated</span></li>' +
                  rows
                      .map(function(t){
                          return (
                              '<li><a href="ticket.html?ticket=' +
                              encodeURIComponent(t.no) +
                              '">' +
                              e(t.no) +
                              '<span class="sr"> ' +
                              e(t.customer) +
                              "</span></a><span>" +
                              e(t.customer) +
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
                      })
                      .join("")
                : '<li class="empty"><h2>No tickets match</h2><p class="muted">Try a different status or search.</p></li>'
        }
        el("filters").addEventListener("click", function(ev){
            var b = ev.target.closest("button")
            if (b) {
                state.status = b.dataset.s
                render()
            }
        })
        el("q").addEventListener("input", function(ev){
            state.q = ev.target.value.trim()
            render()
        })
        CC.api.ownerTickets().then(function(ts){
            all = ts
            render()
        })
    }
})
