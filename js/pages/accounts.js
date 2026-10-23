/* Keep owner account management here so the Content-Security-Policy can block inline scripts. */
CC.ready.then(function(){
    var u = CC.guard("owner")
    if (u) {
        var out = document.getElementById("out"),
            e = CC.esc,
            accounts = []
        function render() {
            out.innerHTML = accounts.length
                ? '<div class="account-table-wrap"><table class="account-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
                  accounts
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
                  "</tbody></table></div>"
                : '<div class="card empty"><h2>No customer accounts yet</h2><p class="muted">Customer accounts will appear here after signup.</p></div>'
        }
        out.addEventListener("click", function(ev){
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
