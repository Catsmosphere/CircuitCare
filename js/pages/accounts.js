/* Keep owner account management here so the Content-Security-Policy can block inline scripts. */
CC.ready.then(function(){
    var u = CC.guard("owner")
    if (u) {
        var out = document.getElementById("out"),
            e = CC.esc,
            accounts = [],
            query = "",
            page = 1,
            pageSize = 5
        function render() {
            var filtered = accounts.filter(function(a){
                return [a.name, a.email, a.phone].join(" ").toLowerCase().includes(query)
            })
            var pages = Math.max(1, Math.ceil(filtered.length / pageSize))
            page = Math.min(page, pages)
            out.innerHTML = '<div class="account-search"><label class="field"><span>Search accounts</span><input id="account-search" type="search" placeholder="Name, email, or phone" value="' +
                e(query) +
                '"></label></div>' + (filtered.length
                ? '<div class="account-table-wrap"><table class="account-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
                  filtered.slice((page - 1) * pageSize, page * pageSize)
                      .map(function(a){
                          return (
                              '<tr><td>' +
                              e(a.name) +
                              "</td><td>" +
                              e(a.email) +
                              "</td><td>" +
                              e(a.phone || "—") +
                              '</td><td class="mono muted">' +
                              CC.date(a.createdAt) +
                              '</td><td><span class="account-state" data-enabled="' +
                              a.enabled +
                              '">' +
                              (a.enabled ? "Active" : "Disabled") +
                              '</span></td><td><button class="chip-btn" type="button" data-account="' +
                              e(a.id) +
                              '" data-enabled="' +
                              a.enabled +
                              '">' +
                              (a.enabled ? "Disable" : "Enable") +
                              "</button></td></tr>"
                          )
                      })
                      .join("") +
                  "</tbody></table></div>" +
                  (pages > 1
                      ? '<nav class="pagination" aria-label="Customer account pages"><button class="chip-btn" type="button" data-page="' +
                        (page - 1) +
                        '"' +
                        (page === 1 ? " disabled" : "") +
                        '>Previous</button><span class="mono muted">Page ' +
                        page +
                        " of " +
                        pages +
                        '</span><button class="chip-btn" type="button" data-page="' +
                        (page + 1) +
                        '"' +
                        (page === pages ? " disabled" : "") +
                        ">Next</button></nav>"
                      : "")
                : '<div class="card empty"><h2>' +
                  (accounts.length ? "No accounts match your search" : "No customer accounts yet") +
                  "</h2><p class=\"muted\">" +
                  (accounts.length ? "Try another name, email, or phone number." : "Customer accounts will appear here after signup.") +
                  "</p></div>")
        }
        out.addEventListener("input", function(ev){
            if (ev.target.id === "account-search") {
                query = ev.target.value.trim().toLowerCase()
                page = 1
                render()
                var input = document.getElementById("account-search")
                input.focus()
                input.setSelectionRange(query.length, query.length)
            }
        })
        out.addEventListener("click", function(ev){
            var pageButton = ev.target.closest("button[data-page]")
            if (pageButton) {
                page = Number(pageButton.dataset.page)
                render()
                return
            }
            var button = ev.target.closest("button[data-account]")
            if (!button) return
            button.disabled = true
            CC.api.setAccountEnabled(button.dataset.account, button.dataset.enabled !== "true").then(function(updated){
                accounts = accounts.map(function(a){
                    return a.id === updated.id ? updated : a
                })
                render()
                CC.toast(updated.enabled ? "Account enabled." : "Account disabled.")
            }).catch(function(error){
                button.disabled = false
                CC.toast(error.message)
            })
        })
        CC.api.ownerAccounts().then(function(rows){
            accounts = rows
            render()
        })
    }
})
