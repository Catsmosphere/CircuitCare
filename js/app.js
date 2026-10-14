/* Keep shared page helpers and API calls here. The login stays in an httpOnly cookie, not browser storage. */
;(function(){
    "use strict"
    var CFG = window.CC_CONFIG || {},
        BASE = CFG.apiBase || ""
    var IDX = { Received: 1, Diagnosing: 2, "In progress": 3, Ready: 4, Closed: 4 }
    var STEPS = ["Received", "Diagnosed", "Being repaired", "Ready for pickup"]
    var STATUSES = ["Received", "Diagnosing", "In progress", "Ready", "Closed"]
    var NEXT = {
        Received: "We’ll check your device, then send you a quote.",
        Diagnosing: "We’re checking your device. A quote comes next.",
        "In progress": "We’re fixing it. You’ll see an update here when it’s ready.",
        Ready: "Ready for pickup. Bring your ticket number.",
        Closed: "Picked up. Thanks for trusting us with your device."
    }
    // Turn labels into safe CSS-friendly values for status styles.
    var slug = function(s){
        return String(s)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
    }
    // Escape server-provided text before putting it inside generated HTML.
    var esc = function(s){
        return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
        })
    }
    // Normalize ticket numbers so spaces, lowercase, and punctuation do not break a lookup.
    var normNo = function(no){
        return String(no)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 5)
    }
    var USER = null
    var me = function(){
        return USER
    }
    var home = function(u){
        return u && u.role === "owner" ? "owner.html" : "dashboard.html"
    }

    /* ---- talking to the server ---- */
    // Send every API request with the login cookie and turn server errors into form-friendly errors.
    function call(method, path, body) {
        var o = { method: method, credentials: "include", headers: { Accept: "application/json" } }
        if (method !== "GET") {
            o.headers["Content-Type"] = "application/json"
            o.body = JSON.stringify(body || {})
        }
        return fetch(BASE + path, o).then(
            function(r){
                return r
                    .json()
                    .catch(function(){
                        return {}
                    })
                    .then(function(j){
                        if (r.ok) return j
                        var e = new Error(j.error || "Something went wrong. Please try again.")
                        e.status = r.status
                        e.fields = j.fields
                        if (r.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me") {
                            USER = null
                        }
                        throw e
                    })
            },
            function(){
                throw new Error("Can’t reach the server. Check your connection and try again.")
            }
        )
    }
    // Keep page scripts independent of the API's field names and populated customer shape.
    var norm = function(t){
        var c = t.customer
        return Object.assign({}, t, {
            cost: t.estimatedCost == null ? null : t.estimatedCost,
            customer: c ? c.name : "Unknown",
            phone: c ? c.phone : "",
            email: c ? c.email : ""
        })
    }
    // Treat invalid or missing ticket numbers as an empty result; other failures still need reporting.
    var missing = function(e){
        if (e.status === 404 || e.status === 400) return null
        throw e
    }
    // Collect the browser's API calls here so pages share one request and response format.
    var api = {
        login: function(email, password){
            return call("POST", "/api/auth/login", { email: email, password: password }).then(function(j){
                USER = j.user
                return USER
            })
        },
        /* Create an account only after the customer verifies the email code. */
        signup: function(f){
            return call("POST", "/api/auth/register", {
                name: f.name,
                phone: f.phone,
                email: f.email,
                password: f.password
            })
        },
        resendCode: function(email){
            return call("POST", "/api/auth/register/resend", { email: email })
        },
        verifyEmail: function(email, code){
            return call("POST", "/api/auth/register/verify", { email: email, code: code }).then(function(j){
                USER = j.user
                return USER
            })
        },
        requestPasswordReset: function(email){
            return call("POST", "/api/auth/forgot-password", { email: email })
        },
        resendPasswordReset: function(email){
            return call("POST", "/api/auth/forgot-password/resend", { email: email })
        },
        resetPassword: function(email, code, password){
            return call("POST", "/api/auth/forgot-password/reset", { email: email, code: code, password: password })
        },
        logout: function(){
            call("POST", "/api/auth/logout")
                .catch(function(){})
                .then(function(){
                    USER = null
                    location.href = "index.html"
                })
        },
        myTickets: function(){
            return call("GET", "/api/tickets/mine").then(function(j){
                return j.tickets.map(norm)
            })
        },
        myTicket: function(no){
            return call("GET", "/api/tickets/mine/" + normNo(no)).then(function(j){
                return norm(j.ticket)
            }, missing)
        },
        submitFeedback: function(no, f){
            return call("POST", "/api/tickets/mine/" + normNo(no) + "/feedback", {
                rating: Number(f.rating),
                comment: f.comment
            }).then(function(j){
                return norm(j.ticket)
            })
        },
        createTicket: function(f){
            return call("POST", "/api/tickets", { device: f.device, model: f.model, issue: f.issue }).then(
                function(j){
                    return norm(j.ticket)
                }
            )
        },
        ownerTickets: function(){
            return call("GET", "/api/tickets").then(function(j){
                return j.tickets.map(norm)
            })
        },
        ownerTicket: function(no){
            return call("GET", "/api/tickets/" + normNo(no)).then(function(j){
                return norm(j.ticket)
            }, missing)
        },
        updateTicket: function(no, f){
            var b = { status: f.status, note: f.note }
            if (f.cost !== "") b.estimatedCost = Number(f.cost)
            return call("PATCH", "/api/tickets/" + normNo(no), b).then(
                function(j){
                    return norm(j.ticket)
                },
                function(e){
                    if (e.fields && e.fields.estimatedCost) e.fields.cost = e.fields.estimatedCost
                    throw e
                }
            )
        }
    }
    /* Ask the server who is logged in instead of trusting browser storage. */
    // Wait for the server to identify the current session before protected pages render.
    var ready = call("GET", "/api/auth/me").then(
        function(j){
            USER = j.user
        },
        function(){
            USER = null
        }
    )

    /* ---- forms ---- */
    // Reuse these small checks across forms; the server validates the same data again.
    var V = {
        req: function(m){
            return function(v){
                return v ? "" : m
            }
        },
        email: function(v){
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Enter a valid email, like name@example.com."
        },
        phone: function(v){
            var normalized = v.replace(/[\s()-]/g, "")
            return /^(?:09[0-9]{9}|\+639[0-9]{9}|639[0-9]{9})$/.test(normalized)
                ? ""
                : "Enter a Philippine mobile number: 09XX XXX XXXX or +63 9XX XXX XXXX."
        },
        pw: function(v){
            return v.length >= 8 ? "" : "Use at least 8 characters."
        }
    }
    // Validate fields, show server-side field errors, and prevent duplicate form submissions.
    function form(el, rules, submit) {
        var btn = el.querySelector("[type=submit]"),
            box = el.querySelector(".form-error")
        el.setAttribute("novalidate", "")
        el.addEventListener("submit", function(e){
            e.preventDefault()
            if (btn.getAttribute("aria-busy")) return
            var data = {},
                first = null
            Object.keys(rules).forEach(function(n){
                var i = el.elements[n],
                    grp = !i.tagName
                data[n] = i.type === "password" ? i.value : i.value.trim()
                var msg =
                    rules[n]
                        .map(function(f){
                            return f(data[n])
                        })
                        .filter(Boolean)[0] || ""
                var er = el.querySelector("#" + n + "-err")
                if (er) er.textContent = msg
                if (!grp) i.setAttribute("aria-invalid", msg ? "true" : "false")
                if (msg && !first) first = grp ? i[0] : i
            })
            if (first) {
                first.focus()
                return
            }
            if (box) box.hidden = true
            btn.setAttribute("aria-busy", "true")
            Promise.resolve(submit(data))
                .catch(function(x){
                    var shown = false,
                        f1 = null
                    if (x.fields)
                        Object.keys(x.fields).forEach(function(n){
                            var er = el.querySelector("#" + n + "-err"),
                                i = el.elements[n]
                            if (er && i) {
                                er.textContent = x.fields[n]
                                if (i.tagName) i.setAttribute("aria-invalid", "true")
                                if (!f1) f1 = i.tagName ? i : i[0]
                                shown = true
                            }
                        })
                    if (f1) f1.focus()
                    if (!shown && box) {
                        box.textContent = x.message
                        box.hidden = false
                    }
                })
                .then(function(){
                    btn.removeAttribute("aria-busy")
                })
        })
    }
    // Create a short-lived accessible message when a page needs to report an action.
    function toast(m) {
        var r = document.getElementById("toasts")
        if (!r) {
            r = document.createElement("div")
            r.id = "toasts"
            r.setAttribute("aria-live", "polite")
            document.body.appendChild(r)
        }
        var t = document.createElement("p")
        t.className = "toast"
        t.textContent = m
        r.appendChild(t)
        setTimeout(function(){
            t.remove()
        }, 4000)
    }

    /* ---- display helpers ---- */
    var date = function(iso){
        return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso))
    }
    var dt = function(iso){
        return new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        }).format(new Date(iso))
    }
    var money = function(n){
        return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n)
    }
    var badge = function(s){
        return '<span class="badge" data-s="' + slug(s) + '">' + esc(s) + "</span>"
    }
    // Map a ticket status onto the four repair stages shown to customers.
    function progress(status) {
        var n = IDX[status] || 1
        return (
            '<ol class="prog" aria-label="Repair progress">' +
            STEPS.map(function(t, i){
                var c = status === "Closed" || i < n - 1 ? "done" : i === n - 1 ? "current" : ""
                return (
                    '<li class="' +
                    c +
                    '">' +
                    t +
                    (c === "done"
                        ? '<span class="sr"> (done)</span>'
                        : c === "current"
                          ? '<span class="sr"> (current step)</span>'
                          : "") +
                    "</li>"
                )
            }).join("") +
            "</ol>"
        )
    }
    // Show the newest ticket update first while leaving the stored history unchanged.
    function timeline(t) {
        return (
            '<ol class="timeline">' +
            t.updates
                .slice()
                .reverse()
                .map(function(u){
                    return (
                        '<li><span class="mono muted">' +
                        dt(u.at) +
                        "</span>" +
                        badge(u.status) +
                        "<p>" +
                        esc(u.note) +
                        "</p></li>"
                    )
                })
                .join("") +
            "</ol>"
        )
    }
    // Draw a decorative ticket barcode from its number; it is not used for scanning.
    function barcode(s) {
        var x = 0,
            r = "",
            n = s.length * 4 + 8
        for (var i = 0; i < n; i++) {
            var w = 1 + ((s.charCodeAt(i % s.length) + i * 7) % 3)
            if (i % 2 === 0) r += '<rect x="' + x + '" width="' + w + '" height="28"/>'
            x += w + 1
        }
        return '<svg class="bars" viewBox="0 0 ' + x + ' 28" aria-hidden="true" focusable="false">' + r + "</svg>"
    }
    /* Reuse this ticket card on the landing page, dashboard, and tracking page. */
    // Build the reusable ticket card and hide repair details when it is shown publicly.
    function tag(t, o) {
        o = o || {}
        var l = t.updates[t.updates.length - 1]
        var detail = o.pub
            ? '<p class="muted">Log in to see the full details of this repair.</p>'
            : '<p class="muted">' + esc(t.issue) + "</p>"
        var last = o.pub
            ? '<p class="mono muted">LAST UPDATE — ' + date(l.at) + "</p>"
            : '<p><span class="mono muted">LAST UPDATE — ' + date(l.at) + "</span><br>" + esc(l.note) + "</p>"
        return (
            '<article class="tag"><div class="tag-main"><p class="mono muted">' +
            (o.sample ? "SAMPLE TICKET" : "SERVICE TICKET") +
            "</p><h3>" +
            esc(t.device + (t.model && !o.pub ? " (" + t.model + ")" : "")) +
            "</h3>" +
            detail +
            progress(t.status) +
            last +
            '<p class="next"><span class="mono">NEXT</span><span>' +
            esc(NEXT[t.status] || "") +
            "</span></p>" +
            (o.link
                ? '<div class="tag-actions"><a class="btn btn-ghost btn-sm" href="track.html?ticket=' +
                  encodeURIComponent(t.no) +
                  '">View details</a></div>'
                : "") +
            "</div>" +
            '<div class="tag-stub"><span class="stamp" data-s="' +
            slug(t.status) +
            '">' +
            esc(t.status) +
            '</span><div><span class="mono muted">TICKET NO.</span><strong class="num">' +
            esc(t.no) +
            "</strong></div>" +
            barcode(t.no) +
            "</div></article>"
        )
    }

    /* ---- page chrome ---- */
    // Build navigation from the server-verified user role and mark the active page.
    function header() {
        var el = document.getElementById("site-header")
        if (!el) return
        var u = me(),
            a = el.dataset.active || ""
        var L = function(h, t, k, c){
            return (
                '<a href="' +
                h +
                '"' +
                (c ? ' class="' + c + '"' : "") +
                (a === k ? ' aria-current="page"' : "") +
                ">" +
                t +
                "</a>"
            )
        }
        var out = '<button class="btn btn-ghost btn-sm" type="button" data-logout>Log out</button>',
            nav
        if (!u)
            nav =
                L("index.html#services", "Services", "", "hide-sm") +
                L("index.html#how", "Process", "", "hide-sm") +
                L("login.html", "Log in", "login", "btn btn-ghost btn-sm") +
                L("signup.html", "Sign up", "signup", "btn btn-primary btn-sm")
        else if (u.role === "owner")
            nav = L("owner.html", "Dashboard", "home") + '<span class="who">' + esc(u.name) + "</span>" + out
        else
            nav =
                L("dashboard.html", "My repairs", "home") +
                L("request.html", "Request a repair", "request") +
                L("track.html", "Track a repair", "track") +
                '<span class="who">' +
                esc(u.name.split(" ")[0]) +
                "</span>" +
                out
        el.innerHTML =
            '<div class="wrap bar"><a class="brand" href="index.html"><span class="dot" aria-hidden="true"></span>CircuitCare</a><nav class="nav" aria-label="Main">' +
            nav +
            "</nav></div>"
        var lo = el.querySelector("[data-logout]")
        if (lo) lo.addEventListener("click", api.logout)
    }
    // Redirect signed-out users to login and send the wrong role back to its own home page.
    function guard(role) {
        var u = me()
        if (!u) {
            location.replace(
                "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() || "index.html")
            )
            return null
        }
        if (role && u.role !== role) {
            location.replace(home(u))
            return null
        }
        return u
    }
    // Add optional motion and password visibility controls without requiring inline page scripts.
    function wireUi() {
        if (matchMedia("(pointer:fine) and (prefers-reduced-motion:no-preference)").matches) {
            ;[].forEach.call(document.querySelectorAll("[data-tilt]"), function(el){
                var host = el.closest(".hero") || el
                host.addEventListener("pointermove", function(e){
                    var r = host.getBoundingClientRect(),
                        x = (e.clientX - r.left) / r.width - 0.5,
                        y = (e.clientY - r.top) / r.height - 0.5
                    el.style.setProperty("--ry", (x * 10).toFixed(2) + "deg")
                    el.style.setProperty("--rx", (-y * 8).toFixed(2) + "deg")
                })
                host.addEventListener("pointerleave", function(){
                    el.style.setProperty("--ry", "0deg")
                    el.style.setProperty("--rx", "0deg")
                })
            })
        }
        ;[].forEach.call(document.querySelectorAll("[data-pw]"), function(b){
            b.addEventListener("click", function(){
                var i = document.getElementById(b.getAttribute("data-pw")),
                    s = i.type === "password"
                i.type = s ? "text" : "password"
                b.textContent = s ? "Hide" : "Show"
                b.setAttribute("aria-pressed", String(s))
            })
        })
    }
    document.documentElement.classList.add("js")
    document.addEventListener("DOMContentLoaded", function(){
        ready.then(function(){
            var u = me()
            header()
            wireUi()
            ;[].forEach.call(document.querySelectorAll("[data-show]"), function(e){
                e.hidden = e.dataset.show === "guest" ? !!u : !u
            })
            var g = document.querySelector("[data-home]")
            if (g && u) g.href = home(u)
        })
        var rv = document.querySelectorAll(".reveal")
        if ("IntersectionObserver" in window) {
            var io = new IntersectionObserver(
                function(es){
                    es.forEach(function(x){
                        if (x.isIntersecting) {
                            x.target.classList.add("in")
                            io.unobserve(x.target)
                        }
                    })
                },
                { threshold: 0.12 }
            )
            ;[].forEach.call(rv, function(e){
                io.observe(e)
            })
        } else
            [].forEach.call(rv, function(e){
                e.classList.add("in")
            })
    })
    window.CC = {
        api: api,
        ready: ready,
        me: me,
        home: home,
        guard: guard,
        form: form,
        V: V,
        toast: toast,
        esc: esc,
        date: date,
        dt: dt,
        money: money,
        badge: badge,
        progress: progress,
        tag: tag,
        timeline: timeline,
        STATUSES: STATUSES
    }
})()
