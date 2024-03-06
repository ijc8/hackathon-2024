import "drag-drop-touch"
import NoSleep from "nosleep.js"

// A client may be an editor, player, or both.
type Role = "player" | "editor" | null
const role = new URL(window.location.toString()).searchParams.get("role") as Role
console.log(role)

const playerHTML = `
<video loop muted></video><br>
<button id="fullscreen">Fullscreen</button>
`

const editorHTML = `
<div>
    <button id="fullscreen">Fullscreen</button>
    <button id="record">Record</button>
    <label for="upload" class="upload-label">Upload</label>
    <input id="upload" type="file" />
</div>
<div id="examples">
  Examples:
  <button>sentence</button>
  <button>door</button>
  <button>numbers</button>
  <button>solfege</button>
</div>
<div id="transcript"></div>
<div id="editor"></div>
<div id="editor-controls">
    <button id="shuffle">Shuffle</button>
    <button id="clear">Clear</button>
    <button id="reset">Reset</button>
    <button id="sort">Sort</button>
    <button id="remove-words">No words</button>
    <button id="remove-spaces">No spaces</button>
    <button id="forget">Forget</button>
</div>
`

document.querySelector("#app")!.innerHTML = `
<div id="status"></div>
${role !== "editor" ? playerHTML : ""}
${role !== "player" ? editorHTML : ""}
`

interface VideoMessage {
    type: "video"
    url: string
}

interface BlocksMessage {
    type: "blocks"
    blocks: Block[]
}

type Message = VideoMessage | BlocksMessage

const websocketProtocol = location.protocol === "https:" ? "wss" : "ws"
const socket = new WebSocket(`${websocketProtocol}://${location.host}/ws`)
socket.onopen = () => {
    console.log("socket open")
}
socket.onmessage = e => {
    // statusEl.innerText = e.data
    const data: Message = JSON.parse(e.data)
    console.log("socket message", data)
    if (data.type === "video") {
        loadVideo(data.url, true)
    } else if (data.type === "blocks") {
        editorBlocks = data.blocks
        updateEditor(true)
    }
}
socket.onerror = e => {
    statusEl.innerText = "Connection error"
    console.log("socket error")
}
socket.onclose = e => {
    statusEl.innerText = "Connection closed"
    console.log("socket close")
}

const video = document.querySelector<HTMLVideoElement>("video") as HTMLVideoElement
const statusEl = document.querySelector("#status") as HTMLDivElement
const transcriptEl = document.getElementById("transcript") as HTMLDivElement
const editorEl = document.getElementById("editor") as HTMLDivElement

let blockId = 0
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
            if (transcriptBlocks.length) {
                transcriptBlocks[nextBlock.source].el!.classList.add('active')
            }
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

statusEl.innerHTML = "Select, upload, or record a video to begin." // "Loading..."

interface Phone {
    duration: number
    phone: string
}

interface Word {
    case: "success" | "not-found-in-transcript" | "not-found-in-audio"
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
    id: number
    source: number // index into `transcriptBlocks`
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
        if (wd.case === "not-found-in-transcript" || wd.case === "not-found-in-audio") {
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
    console.log(blocks)
    return blocks.map((a, index) => {
        const b = { ...a, source: index, id: 0 }
        b.text = b.text.replace(" ", "⎵")
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


function updateEditor(remoteControlled=false) {
    blockId = editorBlocks.length ? (Math.max(...editorBlocks.map(b => b.id)) + 1) : 0
    if (!playing) {
        // Not playing (due to empty editor).
        play()
    }
    if (!remoteControlled) {
        socket.send(JSON.stringify({ type: "blocks", blocks: editorBlocks }))
    }
    renderEditor(editorBlocks)
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
        // Insert a copy so that duplicate blocks have unique identities.
        // (This is important for handling rearrangement gracefully during playback.)
        editorBlocks.splice(destinationIndex, 0, { ...source.block, id: blockId++ })
    }
    updateEditor()
    source = null
    destinationIndex = null
}

function endBlockDrag() {
    if (source?.source === "editor") {
        source.block.el!.remove()
    }
    dropBlock()
    tmpEl.remove()
}

function renderTranscript() {
    if (role === "player") return
    transcriptEl.innerHTML = ""
    for (const block of transcriptBlocks) {      
        const el = document.createElement("span") 
        el.appendChild(document.createTextNode(block.text))
        el.appendChild(document.createElement("wbr"))
        el.className = "block"
        el.draggable = true
        el.addEventListener("dragstart", () => {
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
    if (role === "player") return
    editorEl.innerHTML = ""
    for (const [index, block] of blocks.entries()) {
        const el = document.createElement("span") 
        el.appendChild(document.createTextNode(block.text))
        el.appendChild(document.createElement("wbr"))
        el.className = "block"
        el.draggable = true
        el.addEventListener("dragstart", () => {
            tmpEl.textContent = el.textContent
            el.parentElement!.insertBefore(tmpEl, el)
            // HACK: Wait to remove the element so we sthave the image of it while dragging.
            // window.requestAnimationFrame(() => el.remove())
            // window.requestAnimationFrame(() => transcriptEl.appendChild(el))
            // setTimeout(() => transcriptEl.appendChild(el), 0)
            // transcriptEl.appendChild(el)
            // HACK: This version of the hack also works on mobile (with drag-drop-touch).
            window.requestAnimationFrame(() => { el.style.display = "none" })
            source = { source: "editor", block }
            destinationIndex = index
        })
        el.addEventListener("dragend", endBlockDrag)
        el.addEventListener("dragenter", () => {
            // el.classList.add("dragover")
            // TODO: determine whether to insert before/after based on direction of motion or maybe previous insertion point.
            el.parentElement!.insertBefore(tmpEl, el)
            destinationIndex = index
        })
        el.addEventListener("dragleave", () => {
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

// For mobile
const noSleep = new NoSleep()

let buffer: AudioBuffer
async function setup() {
    await new Promise<void>(resolve => {
        const listener = () => {
            document.removeEventListener("click", listener)
            noSleep.enable()
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
    video?.play()
    while (editorBlocks.length > 0) {
        const currentIndex = editorBlocks.findIndex(b => b.id === currentBlock.id)
        const nextIndex = (currentIndex + 1) % editorBlocks.length
        const nextBlock = editorBlocks[nextIndex]
        // console.log(blocks.indexOf(currentBlock), blocks.indexOf(nextBlock))
        const duration = nextBlock.end - nextBlock.start
        const source = new AudioBufferSourceNode(audioContext, { buffer })
        // console.log("duration", nextBlock.start, nextBlock.end, duration)
        source.start(nextTime, nextBlock.start, duration)
        if (role !== "editor") {
            source.connect(audioContext.destination)
        }
        const gap = nextTime - audioContext.currentTime
        const prevTimeoutHandle = timeoutHandle
        timeoutHandle = window.setTimeout(() => {
            window.clearTimeout(prevTimeoutHandle) // fix for race condition with small gaps
            if (video) {
                video.currentTime = nextBlock.start
                if (video.paused) video.play()
            }
            if (role !== "player") {
                highlightWord(nextBlock, nextBlock.start)
            }
        }, gap * 1000)
        nextTime += duration
        await sleep(gap - 0.05)
        currentBlock = nextBlock
    }
    playing = false
    window.clearTimeout(timeoutHandle)
    video?.pause()
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

function resetEditor() {
    editorBlocks = transcriptBlocks.map(b => ({ ...b, id: blockId++ }))
    updateEditor()
}

if (role !== "player") {
    onClick("#shuffle", () => {
        shuffle(editorBlocks)
        updateEditor()
    })

    const uploadButton = document.querySelector("#upload") as HTMLInputElement
    uploadButton.onchange = e => {
        console.log(e)
        uploadVideo(uploadButton.files![0])
    }

    onClick("#clear", () => {
        blockId = 0
        editorBlocks = []
        updateEditor()
    })

    onClick("#reset", resetEditor)

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
        el.onclick = () => loadVideo(`examples/${el.textContent!}`)
    }

    const recordButton = document.querySelector<HTMLButtonElement>("#record")!

    function record() {
        console.log("getUserMedia supported.")
        
        const constraints = { video: true, audio: true }
        let chunks: Blob[] = []

        navigator.mediaDevices
        .getUserMedia(constraints)
        .then(stream => {
            const mediaRecorder = new MediaRecorder(stream)

            statusEl.textContent = "Ready to record."
            recordButton.onclick = () => {
                if (mediaRecorder.state === "inactive") {
                    if (video) video.srcObject = stream
                    mediaRecorder.start()
                    console.log(mediaRecorder.state)
                    console.log("recorder started")
                    recordButton.style.background = "red"
                    recordButton.style.color = "black"
                    statusEl.textContent = "Recording..."
                } else {
                    mediaRecorder.stop()
                    console.log(mediaRecorder.state)
                    console.log("recorder stopped")
                    recordButton.style.background = ""
                    recordButton.style.color = ""
                    statusEl.textContent = "Stopped recording."
                }
            }

            mediaRecorder.onstop = _e => {
                console.log("data available after MediaRecorder.stop() called.")
                // const video = document.createElement("video")
                // document.body.prepend(video)
                // video.controls = true
                const blob = new Blob(chunks, { type: "video/mp4" })
                chunks = []
                if (video) video.srcObject = null
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

    if (navigator.mediaDevices) {
        recordButton.onclick = record
    } else {
        recordButton.disabled = true
    }
}

onClick("#fullscreen", () => {
    if (role === "player") {
        video.requestFullscreen()
    } else {
        document.body.requestFullscreen()
    }
})

async function uploadVideo(blob: Blob) {
    // Get transcription & alignment from server.
    statusEl.textContent = "Transcribing & aligning..."
    const form = new FormData()
    form.append("video", blob)
    const url = "transcribe"
    console.log("sending transcription request")
    const resp = await fetch(url, { method: "POST", body: form })
    const name = await resp.text()
    loadVideo(`uploads/${name}`)
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

async function loadVideo(url: string, remoteControlled=false) {
    // await audioContext.resume()
    if (!remoteControlled) {
        console.log("loadProcessedVideo send")
        socket.send(JSON.stringify({ type: "video", url }))
    }
    statusEl.textContent = `Fetching "${url}"...`
    let [videoFile, alignment] = await Promise.all([
        fetch(`${url}.mp4`).then(r => r.blob()),
        fetch(`${url}.json`).then(r => r.json())
    ])
    statusEl.textContent = "Decoding..."
    buffer = await audioContext.decodeAudioData(await videoFile.arrayBuffer())
    transcriptBlocks = generateBlocks(alignment, buffer.duration)
    renderTranscript()
    if (video) video.src = URL.createObjectURL(videoFile)
    if (!remoteControlled) {
        resetEditor()
    }
    statusEl.textContent = "Ready."
}

setup()
