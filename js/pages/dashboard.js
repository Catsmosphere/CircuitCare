/* Keep customer dashboard behavior here so the Content-Security-Policy can block inline scripts. */
CC.ready.then(function(){
    var u = CC.guard("customer")
    if (u) {
        var e = CC.esc
        document.getElementById("hi").textContent = "Hi, " + u.name.split(" ")[0] + "."
        if (location.search.indexOf("welcome=1") > -1)
            CC.toast("Account created. Welcome, " + u.name.split(" ")[0] + "!")
        // Escape device details before placing them in generated page content.
        var title = function(t){
            return e(t.device + (t.model ? " (" + t.model + ")" : ""))
        }
        // Use the shared ticket card for repairs that are still open.
        var card = function(t){
            return CC.tag(t, { link: true })
        }
        // Keep completed repairs compact so customers can still find their history.
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
                "</span>" +
                feedback(t) +
                "</li>"
            )
        }
        var feedback = function(t){
            if (t.feedback)
                return (
                    '<details class="feedback"><summary>Feedback submitted — ' +
                    t.feedback.rating +
                    "/5</summary><p>" +
                    (t.feedback.comment ? e(t.feedback.comment) : "No written comment.") +
                    '</p><p class="mono muted">SUBMITTED ' +
                    CC.dt(t.feedback.submittedAt) +
                    "</p></details>"
                )
            return (
                '<details class="feedback"><summary>Leave feedback</summary><form class="feedback-form" data-feedback-ticket="' +
                e(t.no) +
                '" novalidate><div class="form-error" role="alert" hidden></div><fieldset class="field" aria-describedby="rating-' +
                e(t.no) +
                '-err"><legend>Rating</legend><div class="rating-stars">' +
                [5, 4, 3, 2, 1]
                    .map(function(n){
                        return (
                            '<input type="radio" id="rating-' +
                            e(t.no) +
                            "-" +
                            n +
                            '" name="rating-' +
                            e(t.no) +
                            '" value="' +
                            n +
                            '" aria-describedby="rating-' +
                            e(t.no) +
                            '-err"><label for="rating-' +
                            e(t.no) +
                            "-" +
                            n +
                            '"><span class="sr">' +
                            n +
                            " star" +
                            (n === 1 ? "" : "s") +
                            "</span>★</label>"
                        )
                    })
                    .join("") +
                '</div><p class="err" id="rating-' +
                e(t.no) +
                '-err"></p></fieldset><div class="field"><label for="feedback-' +
                e(t.no) +
                '">Comment (optional)</label><textarea id="feedback-' +
                e(t.no) +
                '" name="comment" rows="3" maxlength="1000"></textarea></div><button class="btn btn-primary" type="submit">Send feedback</button></form></details>'
            )
        }
        var out = document.getElementById("out"),
            activePage = 1,
            pastPage = 1,
            activeSize = 2,
            pastSize = 3,
            allTickets = []
        function pager(list, page, pages) {
            return pages > 1
                ? '<nav class="pagination" aria-label="' +
                      (list === "active" ? "Current repairs" : "Past repairs") +
                      ' pages"><button class="chip-btn" type="button" data-list="' +
                      list +
                      '" data-page="' +
                      (page - 1) +
                      '"' +
                      (page === 1 ? " disabled" : "") +
                      '>Previous</button><span class="mono muted">Page ' +
                      page +
                      " of " +
                      pages +
                      '</span><button class="chip-btn" type="button" data-list="' +
                      list +
                      '" data-page="' +
                      (page + 1) +
                      '"' +
                      (page === pages ? " disabled" : "") +
                      ">Next</button></nav>"
                : ""
        }
        function render() {
            var act = allTickets.filter(function(t){
                    return t.status !== "Closed"
                }),
                past = allTickets.filter(function(t){
                    return t.status === "Closed"
                }),
                activePages = Math.max(1, Math.ceil(act.length / activeSize)),
                pastPages = Math.max(1, Math.ceil(past.length / pastSize)),
                h = ""
            activePage = Math.min(activePage, activePages)
            pastPage = Math.min(pastPage, pastPages)
            if (!allTickets.length)
                h =
                    '<div class="card empty"><h2>No repairs yet</h2><p class="muted">When you send a request, it shows up here with a ticket number.</p><a class="btn btn-primary" href="request.html">Request a repair</a></div>'
            else {
                h =
                    '<section aria-labelledby="cur"><h2 id="cur">Current repairs</h2><div class="stack">' +
                    (act.length
                        ? act.slice((activePage - 1) * activeSize, activePage * activeSize).map(card).join("")
                        : '<div class="card muted">No repairs in progress right now.</div>') +
                    "</div>" +
                    pager("active", activePage, activePages) +
                    "</section>"
                if (past.length)
                    h +=
                        '<section aria-labelledby="past"><h2 id="past">Past repairs</h2><ul class="rows">' +
                        past.slice((pastPage - 1) * pastSize, pastPage * pastSize).map(row).join("") +
                        "</ul>" +
                        pager("past", pastPage, pastPages) +
                        "</section>"
            }
            out.innerHTML = h
            ;[].forEach.call(document.querySelectorAll(".feedback-form"), function(f){
                var rating = "rating-" + f.dataset.feedbackTicket,
                    rules = {}
                rules[rating] = [CC.V.req("Choose a rating.")]
                rules.comment = []
                CC.form(f, rules, function(d){
                    return CC.api.submitFeedback(f.dataset.feedbackTicket, { rating: d[rating], comment: d.comment }).then(
                        function(t){
                            allTickets = allTickets.map(function(ticket){
                                return ticket.no === t.no ? t : ticket
                            })
                            render()
                            CC.toast("Thanks for your feedback.")
                        }
                    )
                })
            })
        }
        out.addEventListener("click", function(ev){
            var button = ev.target.closest("button[data-list][data-page]")
            if (!button || button.disabled) return
            if (button.dataset.list === "active") activePage = Number(button.dataset.page)
            else pastPage = Number(button.dataset.page)
            render()
        })
        // Split the customer's tickets into active work and completed repairs.
        CC.api.myTickets().then(function(ts){
            allTickets = ts
            render()
        })
    }
})
