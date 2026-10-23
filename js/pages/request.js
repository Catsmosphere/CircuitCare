/* Keep repair-request behavior here so the Content-Security-Policy can block inline scripts. */
CC.ready.then(function(){
    var u = CC.guard("customer")
    if (u) {
        document.getElementById("who").textContent = u.name + (u.phone ? " (" + u.phone + ")" : "")
        var f = document.getElementById("f"),
            dirty = false
        function preparePhoto(file) {
            if (!file) return Promise.resolve("")
            if (["image/jpeg", "image/png", "image/webp"].indexOf(file.type) < 0)
                return Promise.reject(new Error("Choose a JPG, PNG, or WebP photo."))
            if (file.size > 20 * 1024 * 1024)
                return Promise.reject(new Error("Choose a photo smaller than 20 MB."))
            return new Promise(function(resolve, reject){
                var image = new Image(),
                    url = URL.createObjectURL(file)
                image.onload = function(){
                    URL.revokeObjectURL(url)
                    var scale = Math.min(1, 1600 / Math.max(image.width, image.height)),
                        canvas = document.createElement("canvas"),
                        context
                    canvas.width = Math.round(image.width * scale)
                    canvas.height = Math.round(image.height * scale)
                    context = canvas.getContext("2d")
                    context.fillStyle = "#fff"
                    context.fillRect(0, 0, canvas.width, canvas.height)
                    context.drawImage(image, 0, 0, canvas.width, canvas.height)
                    function encode() {
                        canvas.toBlob(function(blob){
                            if (!blob) return reject(new Error("Could not read that photo. Try another image."))
                            if (blob.size > 900 * 1024 && canvas.width > 600) {
                                canvas.width = Math.round(canvas.width * 0.8)
                                canvas.height = Math.round(canvas.height * 0.8)
                                context = canvas.getContext("2d")
                                context.fillStyle = "#fff"
                                context.fillRect(0, 0, canvas.width, canvas.height)
                                context.drawImage(image, 0, 0, canvas.width, canvas.height)
                                return encode()
                            }
                            if (blob.size > 900 * 1024)
                                return reject(new Error("That photo is too detailed to upload. Please choose a smaller image."))
                            var reader = new FileReader()
                            reader.onload = function(){ resolve(reader.result.split(",")[1]) }
                            reader.onerror = function(){ reject(new Error("Could not read that photo. Try another image.")) }
                            reader.readAsDataURL(blob)
                        }, "image/jpeg", 0.82)
                    }
                    encode()
                }
                image.onerror = function(){
                    URL.revokeObjectURL(url)
                    reject(new Error("Could not open that photo. Try another image."))
                }
                image.src = url
            })
        }
        // Warn customers before they leave a request they have started filling in.
        f.addEventListener("input", function(){
            dirty = true
        })
        window.addEventListener("beforeunload", function(e){
            if (dirty) {
                e.preventDefault()
                e.returnValue = ""
            }
        })
        CC.form(
            f,
            {
                device: [CC.V.req("Choose the type of device.")],
                model: [],
                issue: [
                    CC.V.req("Describe what’s wrong."),
                    function(v){
                        if (v.length < 10) return "Add a little more detail (at least 10 characters)."
                        return /\p{L}/u.test(v) ? "" : "Describe the problem using words, not numbers alone."
                    }
                ]
            },
            function(d){
                return preparePhoto(document.getElementById("photo").files[0]).then(function(photo){
                    return CC.api.createTicket(d, photo)
                }).then(function(t){
                    dirty = false
                    f.hidden = true
                    document.getElementById("done-no").textContent = t.no
                    document.getElementById("done-track").href = "track.html?ticket=" + encodeURIComponent(t.no)
                    var s = document.getElementById("done")
                    s.hidden = false
                    document.getElementById("done-title").focus()
                    CC.toast("Request sent. Your ticket is " + t.no + ".")
                })
            }
        )
    }
})
