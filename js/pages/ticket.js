/* Page script for ticket.html (kept in a file so the Content-Security-Policy can forbid inline scripts). */
CC.ready.then(function(){
    var u = CC.guard("owner")
    if (u) {
        var e = CC.esc,
            no = new URLSearchParams(location.search).get("ticket") || "",
            out = document.getElementById("out")
        function view(t) {
            document.title = "Ticket " + t.no + " — CircuitCare Repair"
            document.getElementById("crumb-no").textContent = t.no
            var chips = CC.STATUSES.map(function(s){
                return (
                    '<label class="chip"><input type="radio" name="status" value="' +
                    e(s) +
                    '"' +
                    (s === t.status ? " checked" : "") +
                    "><span>" +
                    e(s) +
                    "</span></label>"
                )
            }).join("")
            out.innerHTML =
                '<div class="dash-top"><h1>Ticket <span class="mono">' +
                t.no +
                "</span></h1>" +
                CC.badge(t.status) +
                '</div><div class="two mt-24"><div class="stack">' +
                '<section class="card" aria-labelledby="d"><h2 id="d" class="eyebrow card-title">Ticket details</h2><dl class="kv"><dt>Customer</dt><dd>' +
                e(t.customer) +
                "</dd><dt>Phone</dt><dd>" +
                (t.phone ? '<a href="tel:' + e(t.phone) + '">' + e(t.phone) + "</a>" : "—") +
                "</dd><dt>Email</dt><dd>" +
                e(t.email || "—") +
                "</dd><dt>Device</dt><dd>" +
                e(t.device + (t.model ? " — " + t.model : "")) +
                "</dd><dt>Problem</dt><dd>" +
                e(t.issue) +
                "</dd><dt>Estimated cost</dt><dd>" +
                (t.cost != null ? CC.money(t.cost) : "Not set") +
                "</dd></dl></section>" +
                '<form id="f" class="card" novalidate aria-labelledby="u"><h2 id="u" class="eyebrow card-title">Update status</h2><div class="form-error" role="alert" hidden></div>' +
                '<fieldset class="field"><legend>Status</legend><div class="chips">' +
                chips +
                '</div><p class="err" id="status-err"></p></fieldset>' +
                '<div class="field"><label for="note">Note for the customer (optional)</label><textarea id="note" name="note" rows="3" placeholder="Replacement screen installed, now testing…"></textarea></div>' +
                '<div class="field"><label for="cost">Estimated cost in PHP (optional)</label><input id="cost" name="cost" inputmode="decimal" autocomplete="off" placeholder="1500.00…" aria-describedby="cost-err" value="' +
                (t.cost != null ? t.cost : "") +
                '"><p class="err" id="cost-err"></p></div>' +
                '<button class="btn btn-primary" type="submit">Save update</button></form></div>' +
                '<section class="card" aria-labelledby="h"><h2 id="h" class="eyebrow card-title">History</h2>' +
                CC.timeline(t) +
                "</section></div>"
            var f = document.getElementById("f"),
                dirty = false
            f.addEventListener("input", function(){
                dirty = true
            })
            window.onbeforeunload = function(ev){
                if (dirty) {
                    ev.preventDefault()
                    ev.returnValue = ""
                }
            }
            CC.form(
                f,
                {
                    status: [CC.V.req("Choose a status.")],
                    note: [],
                    cost: [
                        function(v){
                            return !v || /^\d+(\.\d{1,2})?$/.test(v) ? "" : "Enter an amount like 1500 or 1500.50."
                        }
                    ]
                },
                function(d){
                    return CC.api.updateTicket(t.no, d).then(function(){
                        dirty = false
                        CC.toast("Ticket " + t.no + " updated.")
                        return CC.api.ownerTicket(t.no).then(view)
                    })
                }
            )
        }
        CC.api.ownerTicket(no).then(function(t){
            if (t) view(t)
            else
                out.innerHTML =
                    '<div class="card empty"><h2>Ticket not found</h2><p class="muted">Check the number, or go back to the list.</p><a class="btn btn-primary" href="owner.html">Back to tickets</a></div>'
        })
    }
})
