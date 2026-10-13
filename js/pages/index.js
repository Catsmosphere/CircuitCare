/* Keep landing-page behavior here so the Content-Security-Policy can block inline scripts. */
CC.ready.then(function(){
    // Show a clearly marked example ticket without requesting or exposing customer data.
    document.getElementById("sample").innerHTML = CC.tag(
        {
            no: "DEMO0",
            device: "Phone",
            model: "Samsung A54",
            issue: "Cracked screen, does not respond to touch",
            status: "In progress",
            updates: [{ at: "2026-10-07T14:40", note: "Repair started. Screen installed, now testing." }]
        },
        { sample: true }
    )
})
