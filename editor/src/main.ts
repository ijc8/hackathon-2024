import "drag-drop-touch"

const video = document.querySelector("video") as HTMLVideoElement

const transcriptEl = document.getElementById("transcript") as HTMLDivElement
const editorEl = document.getElementById("editor") as HTMLDivElement

let currentBlock: Block

const phones = document.createElement("div")
phones.className = "phones"
document.body.appendChild(phones)

var cur_phones$: HTMLSpanElement[] = []  // Phoneme elements
var $active_phone: HTMLSpanElement | null

function render_phones(block: Block) {
    if (!block.el) { console.assert("nope"); return }
    cur_phones$ = []
    phones.innerHTML = ""
    $active_phone = null
    
    phones.style.top = block.el.offsetTop + 15 + "px"
    phones.style.left = block.el.offsetLeft + "px"
    
    // var dur = block.end - block.start
    // var start_x = block.el.offsetLeft

    for (const ph of block.word!.phones) {
        var $p = document.createElement("span")
        $p.className = "phone"
        $p.textContent = ph.phone.split("_")[0]
        
        phones.appendChild($p)
        cur_phones$.push($p)
    }
    
    var offsetToCenter = (block.el.offsetWidth - phones.offsetWidth) / 2
    phones.style.left = block.el.offsetLeft + offsetToCenter + "px"
}
function highlight_phone(block: Block, t: number) {
    if(!block || !block.word) {
        phones.innerHTML = ""
        return
    }
    const cur_wd = block.word
    var hit
    var cur_t = cur_wd.start
    
    for (const [idx, ph] of cur_wd.phones.entries()) {
        if(cur_t <= t && cur_t + ph.duration >= t) {
            hit = idx
        }
        cur_t += ph.duration
    }
    
    if(hit) {
        var $ph = cur_phones$[hit]
        if($ph != $active_phone) {
            if($active_phone) {
                $active_phone.classList.remove("phactive")
            }
            if($ph) {
                $ph.classList.add("phactive")
            }
        }
        $active_phone = $ph
    }
}

function highlightWord(nextBlock: Block, t: number) {
    // var t = video.currentTime
    // XXX: O(N); use binary search
    // var hits = blocks.filter(function(x) {
    //     return (t - x.start) > 0.01 && (x.end - t) > 0.01
    // })
    // var nextBlock = hits[hits.length - 1]
    
    // if (nextBlock && currentBlock != nextBlock) {
        // console.log(currentBlock, nextBlock)
        // nextBlock = blocks[(blocks.indexOf(currentBlock) + 1) % blocks.length]
        // setTimeout(() => video.currentTime = nextBlock.start, currentBlock.end - t)
        for (const el of document.querySelectorAll(".active")) {
            el.classList.remove("active")
        }
        if (nextBlock?.el) {
            nextBlock.el.classList.add('active')
            nextBlock.source.el!.classList.add('active')
        }
        if(nextBlock?.word && nextBlock?.el) {
            render_phones(nextBlock)
        }
        // currentBlock = nextBlock
    // }
    highlight_phone(currentBlock, t)
    
    // window.requestAnimationFrame(highlightWord)
}
// window.requestAnimationFrame(highlight_word)

transcriptEl.innerHTML = "Select, upload, or record a video to begin." // "Loading..."

interface Phone {
    duration: number
    phone: string
}

interface Word {
    case: "success" | "not-found-in-transcript"
    word: string
    alignedWord: string
    start: number
    end: number
    startOffset: number
    endOffset: number
    phones: Phone[]
}

interface Result {
    transcript: string
    words: Word[]
}

interface Block {
    source: Block
    text: string
    start: number
    end: number
    el?: HTMLSpanElement
    word?: Word
}

let transcriptBlocks: Block[] = []
let editorBlocks: Block[] = []

function generateBlocks(ret: Result, duration: number): Block[] {
    const blocks = []
    const wds = ret.words
    const transcript = ret.transcript

    let currentOffset = 0
    let currentTime = 0
    
    for (const wd of wds) {
        if (wd.case == "not-found-in-transcript") {
            // TODO: does this case actually happen? what should we do with this?
            console.log("unexpected case", wd)
            continue
        }

        // Add non-linked text
        if (wd.startOffset > currentOffset) {
            const text = transcript.slice(currentOffset, wd.startOffset)
            currentOffset = wd.startOffset
            blocks.push({ text, start: currentTime, end: Math.max(currentTime, wd.start) })
        }

        const text = transcript.slice(wd.startOffset, wd.endOffset)
        currentOffset = wd.endOffset
        currentTime = wd.end
        blocks.push({ text, start: wd.start, end: wd.end, word: wd })
    }

    const text = transcript.slice(currentOffset, transcript.length)
    currentOffset = transcript.length
    blocks.push({ text, start: currentTime, end: duration })
    return blocks.map(a => {
        const b = { ...a, source: null as any as Block }
        b.text = b.text.replace(" ", "⎵")
        b.source = b
        return b
    })
}

// Drag to reorder: state
const tmpEl = document.createElement("span")
tmpEl.id = "tmp"
tmpEl.textContent = "TEMP"

let source: BlockSource | null = null
let destinationIndex: number | null = null

interface BlockSource {
    source: "transcript" | "editor"
    block: Block
}

function insertBlock(block: Block, index: number) {
    // Insert a copy so that duplicate blocks have unique identities.
    // (This is important for handling rearrangement gracefully during playback.)
    editorBlocks.splice(index, 0, { ...block })
    updateEditor()
    if (editorBlocks.length === 1) {
        // No words present; start playing.
        play()
    }
    renderEditor(editorBlocks)
}


function updateEditor() {
    if (!playing) {
        // Not playing (due to empty editor).
        play()
    }
    renderEditor(editorBlocks)
}


function startBlockDrag() {

}

function dropBlock() {
    if (!source) return
    console.log("drop block", source, destinationIndex)
    if (source.source === "editor") {
        let sourceIndex = editorBlocks.indexOf(source.block)
        editorBlocks.splice(sourceIndex, 1)
        if (destinationIndex !== null && destinationIndex > sourceIndex) destinationIndex--
    }
    if (destinationIndex !== null) {
        insertBlock(source.block, destinationIndex)
    }
    source = null
    destinationIndex = null
}

function endBlockDrag() {
    dropBlock()
    tmpEl.remove()
}

function renderTranscript() {
    transcriptEl.innerHTML = ""
    for (const block of transcriptBlocks) {      
        const el = document.createElement("span") 
        el.appendChild(document.createTextNode(block.text))
        el.appendChild(document.createElement("wbr"))
        el.className = "block"
        el.draggable = true
        el.addEventListener("dragstart", e => {
            // el.style.display = "none"
            tmpEl.textContent = el.textContent
            // el.parentElement!.insertBefore(tmpEl, el)
            source = { source: "transcript", block }
            // destination = block
        })
        el.addEventListener("dragend", endBlockDrag)
        transcriptEl.appendChild(el)
        block.el = el
    }
    transcriptEl.ondragover = e => {
        e.preventDefault()
        destinationIndex = null
        tmpEl.remove()
    }
    transcriptEl.ondrop = () => {
        console.log("drop on transcript")
        dropBlock()
    }
}

function renderEditor(blocks: Block[]) {
    editorEl.innerHTML = ""
    for (const [index, block] of blocks.entries()) {
        const el = document.createElement("span") 
        el.appendChild(document.createTextNode(block.text))
        el.appendChild(document.createElement("wbr"))
        el.className = "block"
        el.draggable = true
        el.addEventListener("dragstart", e => {
            tmpEl.textContent = el.textContent
            el.parentElement!.insertBefore(tmpEl, el)
            // HACK: Wait to remove the element so we still have the image of it while dragging.
            window.requestAnimationFrame(() => el.remove())
            source = { source: "editor", block }
            destinationIndex = index
        })
        el.addEventListener("dragend", endBlockDrag)
        el.addEventListener("dragenter", e => {
            // el.classList.add("dragover")
            // TODO: determine whether to insert before/after based on direction of motion or maybe previous insertion point.
            el.parentElement!.insertBefore(tmpEl, el)
            destinationIndex = index
        })
        el.addEventListener("dragleave", e => {
            // el.classList.remove("dragover")
        })
        // el.onclick = () => {
        el.ontouchstart = () => {
            console.log(block.start)
            // video.currentTime = block.start
            // Imprecise and not supported in Chrome:
            // video.fastSeek(block.start)
            // video.play()
        }
        editorEl.appendChild(el)
        block.el = el
    }
    editorEl.ondragover = e => {
        e.preventDefault()
        if (destinationIndex === null) {
            destinationIndex = editorBlocks.length + 1
            editorEl.appendChild(tmpEl)
        }
    }
    editorEl.ondrop = () => {
        console.log("drop on editor")
        dropBlock()
    }
}

const audioContext = new AudioContext()

function sleep(secs: number) {
    return new Promise(resolve => setTimeout(resolve, secs * 1000))
}

let buffer: AudioBuffer
async function setup() {
    await new Promise<void>(resolve => {
        const listener = () => {
            document.removeEventListener("click", listener)
            resolve()
        }
        document.addEventListener("click", listener)
    })
    await audioContext.resume()
    console.log("audio running", audioContext.outputLatency)
}

let playing = false
async function play() {
    if (playing) return
    let nextTime = audioContext.currentTime
    currentBlock = editorBlocks[editorBlocks.length - 1]
    let timeoutHandle = 0
    playing = true
    video.play()
    while (editorBlocks.length > 0) {
        const nextIndex = (editorBlocks.indexOf(currentBlock) + 1) % editorBlocks.length
        const nextBlock = editorBlocks[nextIndex]
        // console.log(blocks.indexOf(currentBlock), blocks.indexOf(nextBlock))
        const duration = nextBlock.end - nextBlock.start
        const source = new AudioBufferSourceNode(audioContext, { buffer })
        // console.log("duration", nextBlock.start, nextBlock.end, duration)
        source.start(nextTime, nextBlock.start, duration)
        source.connect(audioContext.destination)
        const gap = nextTime - audioContext.currentTime
        const prevTimeoutHandle = timeoutHandle
        timeoutHandle = window.setTimeout(() => {
            window.clearTimeout(prevTimeoutHandle) // fix for race condition with small gaps
            video.currentTime = nextBlock.start
            // video.play()
            highlightWord(nextBlock, nextBlock.start)
        }, gap * 1000)
        nextTime += duration
        await sleep(gap - 0.05)
        currentBlock = nextBlock
    }
    playing = false
    video.pause()
}


function shuffle(array: any[]) {
    // https://stackoverflow.com/a/2450976
    let currentIndex = array.length, randomIndex
    // While there remain elements to shuffle.
    while (currentIndex > 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex)
        currentIndex--
        // And swap it with the current element.
        ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
    }
    return array
}

function onClick(selector: string, cb: () => void) {
    document.querySelector<HTMLButtonElement>(selector)!.onclick = cb
}

onClick("#shuffle", () => {
    shuffle(editorBlocks)
    updateEditor()
})

onClick("#fullscreen", () => video.requestFullscreen())

const uploadButton = document.querySelector("#upload") as HTMLInputElement
uploadButton.onchange = selectVideo

onClick("#clear", () => {
    editorBlocks = []
    updateEditor()
})

onClick("#reset", () => {
    editorBlocks = transcriptBlocks.map(b => ({ ...b }))
    updateEditor()
})

onClick("#sort", () => {
    editorBlocks.sort((a, b) => a.text.localeCompare(b.text) )
    updateEditor()
})

onClick("#remove-words", () => {
    editorBlocks = editorBlocks.filter(b => !b.word)
    updateEditor()
})

onClick("#remove-spaces", () => {
    editorBlocks = editorBlocks.filter(b => b.word)
    updateEditor()
})

onClick("#forget", () => {
    // Randomly forget blocks.
    editorBlocks = editorBlocks.filter(() => Math.random() < 0.5)
    updateEditor()
})

for (const el of document.querySelectorAll<HTMLButtonElement>("#examples button")) {
    el.onclick = () => loadExample(el.textContent!)
}

function selectVideo(e: Event) {
    console.log(e)
    uploadVideo(uploadButton.files![0])
}

async function uploadVideo(blob: Blob) {
    // Get transcription & alignment data from server.
    const form = new FormData()
    form.append("audio", blob)
    const url = "transcriptions?async=false"
    console.log("sending request")
    const start = Date.now()
    const req = await fetch(url, { method: "POST", body: form })
    console.log("req", req)
    const result = await req.json()
    console.log("result", result)
    console.log("took", (Date.now() - start) / 1000, "seconds")
    loadVideo(blob, result)
}

async function loadVideo(blob: Blob, result: Result) {
    // TODO clean up
    const data = await blob.arrayBuffer()
    buffer = await audioContext.decodeAudioData(data)
    transcriptBlocks = generateBlocks(result, buffer.duration)
    editorBlocks = transcriptBlocks.map(b => ({ ...b }))
    renderTranscript()
    renderEditor(editorBlocks)
    video.src = URL.createObjectURL(blob)
    if (playing) video.play()
    // ;[buffer, editorBlocks, currentBlock] = [_buffer, _blocks, editorBlocks[0]]
    play()
}

// var status_init = false
// var status_log  = []		// [ status ]
// var $status_pro

// function render_status(ret) {
//     if(!status_init) {
//         // Clobber the $trans div and use it for status updates
//         $trans.innerHTML = "<h2>transcription in progress</h2>"
//         $trans.className = "status"
//         $status_pro = document.createElement("progress")
//         $status_pro.setAttribute("min", "0")
//         $status_pro.setAttribute("max", "100")
//         $status_pro.value = 0
//         $trans.appendChild($status_pro)
        
//         status_init = true
//     }
//     if(ret.status !== "TRANSCRIBING") {
//         if(ret.percent) {
//             $status_pro.value = (100*ret.percent)
//         }
//     }
//     else if(ret.percent && (status_log.length == 0 || status_log[status_log.length-1].percent+0.0001 < ret.percent)) {
//         // New entry
//         var $entry = document.createElement("div")
//         $entry.className = "entry"
//         $entry.textContent = ret.message
//         ret.$div = $entry
        
//         if(ret.percent) {
//             $status_pro.value = (100*ret.percent)
//         }
        
//         if(status_log.length > 0) {
//             $trans.insertBefore($entry, status_log[status_log.length-1].$div)
//         }
//         else {
//             $trans.appendChild($entry)
//         }
//         status_log.push(ret)
//     }
// }

async function loadExample(name: string) {
    const [video, alignment] = await Promise.all([
        fetch(`examples/${name}.mp4`).then(r => r.blob()),
        fetch(`examples/${name}.json`).then(r => r.json())
    ])
    loadVideo(video, alignment)
}

async function update() {
    // We want this to work from file:/// domains, so we provide a
    // mechanism for inlining the alignment data.
    await setup()
    // transcriptBlocks = generateBlocks(INLINE_JSON as Result, buffer.duration)
    // editorBlocks = transcriptBlocks.map(b => ({ ...b }))
    // currentBlock = editorBlocks[0]
    // renderTranscript()
    // renderEditor(editorBlocks)
    // play()

    // Show the status
    // get_json('status.json', function(ret) {
    //     $a.style.visibility = 'hidden'
    //     if (ret.status == 'ERROR') {
    //         $preloader.style.visibility = 'hidden'
    //         $trans.innerHTML = '<b>' + ret.status + ': ' + ret.error + '</b>'
    //     } else if (ret.status == 'TRANSCRIBING' || ret.status == 'ALIGNING') {
    //         $preloader.style.visibility = 'visible'
    //         render_status(ret)
    //         setTimeout(update, 2000)
    //     } else if (ret.status == 'OK') {
    //         $preloader.style.visibility = 'hidden'
    //         // XXX: should we fetch the align.json?
    //         window.location.reload()
    //     } else if (ret.status == 'ENCODING' || ret.status == 'STARTED') {
    //         $preloader.style.visibility = 'visible'
    //         $trans.innerHTML = 'Encoding, please wait...'
    //         setTimeout(update, 2000)
    //     } else {
    //         console.log("unknown status", ret)
    //         $preloader.style.visibility = 'hidden'
    //         $trans.innerHTML = ret.status + '...'
    //         setTimeout(update, 5000);		
    //     }
    // })
}

update()

function record() {
    console.log("getUserMedia supported.")
    
    const constraints = { video: true, audio: true }
    let chunks: Blob[] = []

    navigator.mediaDevices
    .getUserMedia(constraints)
    .then(stream => {
        const mediaRecorder = new MediaRecorder(stream)

        recordButton.onclick = () => {
            if (mediaRecorder.state === "inactive") {
                video.srcObject = stream
                mediaRecorder.start()
                console.log(mediaRecorder.state)
                console.log("recorder started")
                recordButton.style.background = "red"
                recordButton.style.color = "black"
            } else {
                mediaRecorder.stop()
                console.log(mediaRecorder.state)
                console.log("recorder stopped")
                recordButton.style.background = ""
                recordButton.style.color = ""
            }
        }

        mediaRecorder.onstop = _e => {
            console.log("data available after MediaRecorder.stop() called.")
            // const video = document.createElement("video")
            // document.body.prepend(video)
            // video.controls = true
            const blob = new Blob(chunks, { type: "video/mp4" })
            chunks = []
            video.srcObject = null
            // video.src = URL.createObjectURL(blob)
            console.log("recorder stopped")
            uploadVideo(blob)
        }

        mediaRecorder.ondataavailable = e => {
            chunks.push(e.data)
        }
    })
    .catch((err) => {
        console.error(`The following error occurred: ${err}`)
    })
}

const recordButton = document.querySelector<HTMLButtonElement>("#record")!

if (navigator.mediaDevices) {
    recordButton.onclick = record
} else {
    recordButton.disabled = true
}
