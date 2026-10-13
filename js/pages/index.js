/* Page script for index.html (kept in a file so the Content-Security-Policy can forbid inline scripts). */
CC.ready.then(function(){
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
