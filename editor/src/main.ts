import "drag-drop-touch"
import NoSleep from "nosleep.js"
// Supports weights 400-800
import '@fontsource-variable/eb-garamond';

// A client may be an editor, player, or both.
type Role = "player" | "editor" | null
const role = new URL(window.location.toString()).searchParams.get("role") as Role
console.log(role)

// Placeholder before first user interaction
document.querySelector("#app")!.innerHTML = `
<div class="placeholder">
    <h1>Cadence</h1>
    <h3>by Brittney Allen & Ian Clester</h3>
    <h2>Press this page to play.</h2>
</div>
`

let togglePlay: HTMLButtonElement | null = null

interface VideoMessage {
    type: "video"
    url: string | null
}

interface BlocksMessage {
    type: "blocks"
    blocks: Block[]
}

interface PlaybackMessage {
    type: "playback"
    playing: boolean
    looping: boolean
    id: number
}

interface ParametersMessage {
    type: "parameters"
    knobs: number[]
}

// current mapping: volume, (video) brightness, sepia, contrast
let knobs = [1.0, 0.0, 1.0, 0.5]

type Message = VideoMessage | BlocksMessage | PlaybackMessage | ParametersMessage

const websocketProtocol = location.protocol === "https:" ? "wss" : "ws"
let socket: WebSocket
function setupSocket() {
    socket = new WebSocket(`${websocketProtocol}://${location.host}/ws`)
    socket.onopen = () => {
        console.log("socket open")
    }
    socket.onmessage = e => {
        const data: Message = JSON.parse(e.data)
        console.log("socket message", data)
        if (data.type === "video") {
            loadVideo(data.url, true)
        } else if (data.type === "blocks") {
            editorBlocks = data.blocks
            updateEditor(true)
        } else if (data.type === "playback") {
            updatePlayback(data.playing, data.looping, data.id, true)
        } else if (data.type === "parameters") {
            knobs = data.knobs
            updateParameters(true)
        }
    }
    socket.onerror = () => {
        setStatus("Connection error!")
    }
    socket.onclose = () => {
        setStatus("Connection closed.")
    }
}

let video: HTMLVideoElement
let statusEl: HTMLDivElement | null = null
let transcriptEl: HTMLDivElement
let editorEl: HTMLDivElement

let blockId = 0
let currentBlock: Block

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

function setStatus(status: string) {
    if (statusEl === null) return
    statusEl.textContent = status
}

function highlightWord(nextBlock: Block, t: number) {
    for (const el of document.querySelectorAll(".active")) {
        el.classList.remove("active")
    }
    if (nextBlock?.el) {
        nextBlock.el.classList.add('active')
        if (transcriptBlocks.length) {
            transcriptBlocks[nextBlock.source].el!.classList.add('active')
        }
    }
}

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
    // if (!playing) {
    //     // Not playing (due to empty editor).
    //     play()
    // }
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
let gainNode: GainNode
let setupPromise: Promise<void>
async function setup() {
    console.log("setup")
    setupPromise = new Promise<void>(resolve => {
        const listener = () => {
            document.removeEventListener("click", listener)
            audioContext.resume()
            noSleep.enable()
            resolve()
        }
        document.addEventListener("click", listener)
    })
    await setupPromise
    setupPage()
    console.log("audio running", audioContext.outputLatency)
    setupSocket()
    gainNode = new GainNode(audioContext, { gain: 0 })
    gainNode.connect(audioContext.destination)
}

let gain = 1
function setVolume(frac: number) {
    gain = frac === 0 ? 0 : 10**(72 * (frac - 1)/20)
    console.log(setVolume, frac, gain)
    if (playing) gainNode.gain.value = gain
}

function updateParameters(remoteControlled = false) {
    if (!remoteControlled) {
        socket.send(JSON.stringify({ type: "parameters", knobs }))
    }
    setVolume(knobs[0])
    for (const [i, el] of document.querySelectorAll<HTMLDivElement>(".parameter-bar").entries()) {
        el.style.height = `${knobs[knobs.length - 1 - i] * 100}%`
    }
    if (video) {
        video.style.filter = `brightness(${(knobs[1] * 300) + 100}%) contrast(${knobs[3] * 200}%) sepia(${knobs[2] * 100}%)`
    }
}

// TODO: Send information from whichever client is "driving" to keep others (roughly) in sync.
let playing = false
let sourceNodes: AudioBufferSourceNode[] = []
async function play(remoteControlled=false) {
    await setupPromise
    if (playing) return
    playing = true
    console.log("play")
    let nextTime = audioContext.currentTime
    currentBlock = editorBlocks[editorBlocks.length - 1]
    let timeoutHandle = 0
    video?.play()
    gainNode.gain.value = 1
    if (togglePlay) togglePlay.textContent = "Pause"
    updatePlayback(playing, true, currentBlock?.id, remoteControlled)
    while (playing && editorBlocks.length > 0) {
        const currentIndex = editorBlocks.findIndex(b => b.id === currentBlock.id)
        const nextIndex = (currentIndex + 1) % editorBlocks.length
        const nextBlock = editorBlocks[nextIndex]
        // console.log(blocks.indexOf(currentBlock), blocks.indexOf(nextBlock))
        const duration = nextBlock.end - nextBlock.start
        const source = new AudioBufferSourceNode(audioContext, { buffer })
        // console.log("duration", nextBlock.start, nextBlock.end, duration)
        source.start(nextTime, nextBlock.start, duration)
        sourceNodes.push(source)
        source.onended = () => sourceNodes.splice(sourceNodes.indexOf(source), 1)
        if (role !== "editor") {
            source.connect(gainNode)
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
    pause(remoteControlled)
    window.clearTimeout(timeoutHandle)
}

function pause(remoteControlled=false) {
    playing = false
    gainNode.gain.value = 0
    for (const node of sourceNodes) {
        node.disconnect()
    }
    sourceNodes = []
    if (togglePlay) togglePlay.textContent = "Play"
    video?.pause()
    updatePlayback(playing, true, currentBlock ? currentBlock.id : 0, remoteControlled)
}

function updatePlayback(playing_: boolean, _looping: boolean, id: number, remoteControlled=false) {
    console.log("hm", playing, playing_)
    if (playing !== playing_) {
        if (playing_) play(remoteControlled)
        else pause(remoteControlled)
    }
    // TODO looping
    if (id !== currentBlock?.id) {
        currentBlock = editorBlocks.find(b => b.id === id)!
    }
    if (!remoteControlled) {
        socket.send(JSON.stringify({ type: "playback", playing: playing_, looping: _looping, id }))
    }
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

function setupPage() {
    const paramHTML = `
<div class="parameter"><div class="parameter-bar"></div></div>
`

    const playerHTML = `
<video loop muted></video><br>
<button id="fullscreen">Fullscreen</button>
`

    const editorHTML = `
<div>
    <button id="reset-all">Reset</button>
    <button id="record">Record</button>
    <label for="upload" class="upload-label">Upload</label>
    <input id="upload" type="file" />
    <button id="toggle-play">Play</button>
</div>
<div id="examples">
Examples:
<button>sentence</button>
<button>door</button>
<button>numbers</button>
<button>solfege</button>
</div>
<div style="flex: 1; min-height: 0; display: flex;">
    <div style="flex: 1; display: flex; flex-direction: column">
        <div id="transcript"></div>
        <div id="status"></div>
        <div id="editor"></div>
    </div>
    <div id="parameters">
        ${paramHTML.repeat(4)}
    </div>
</div>
<div id="editor-controls">
    <button id="clear">Clear</button>
    <button id="reset">Reset</button>
    <button id="sort">Sort</button>
    <button id="shuffle">Shuffle</button>
    <button id="remove-words">No words</button>
    <button id="remove-spaces">No spaces</button>
    <button id="forget">Forget</button>
</div>
`
    let html: string
    if (role === "player") {
        html = playerHTML
    } else if (role === "editor") {
        html = editorHTML
    } else {
        html = `
<div class="book">
    <div class="page left-page">${playerHTML}</div>
    <div class="divider">
        <div></div>
    </div>
    <div class="page right-page">${editorHTML}</div>
</div>
`
    }

    document.querySelector("#app")!.innerHTML = html

    video = document.querySelector<HTMLVideoElement>("video") as HTMLVideoElement
    statusEl = document.querySelector("#status") as HTMLDivElement
    transcriptEl = document.getElementById("transcript") as HTMLDivElement
    editorEl = document.getElementById("editor") as HTMLDivElement

    if (role !== "player") {
        setStatus("Select, upload, or record a video with speech to begin.")

        for (const [i, el] of document.querySelectorAll<HTMLDivElement>(".parameter").entries()) {
            const update = (e: MouseEvent) => {
                const rect = el.getBoundingClientRect()
                const frac = (rect.bottom - e.clientY) / rect.height
                knobs[knobs.length - 1 - i] = Math.max(0, Math.min(frac, 1))
                updateParameters()
            }
            el.onmousedown = e => {
                console.log("click")
                update(e)
                const move = (e: MouseEvent) => {
                    console.log("hey")
                    if (e.buttons) update(e)
                }
                const up = () => {
                    document.removeEventListener("mousemove", move)
                    document.removeEventListener("mouseup", up)
                }
                document.addEventListener("mousemove", move)
                document.addEventListener("mouseup", up)
            }
        }

        onClick("#reset-all", () => {
            loadVideo(null)
            editorBlocks = []
            updateEditor()
        })

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

        togglePlay = document.querySelector<HTMLButtonElement>("#toggle-play")
        togglePlay!.onclick = () => {
            if (!playing) play()
            else if (playing) pause()
        }

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

                setStatus("Ready to record.")
                recordButton.onclick = () => {
                    if (mediaRecorder.state === "inactive") {
                        if (video) video.srcObject = stream
                        mediaRecorder.start()
                        console.log(mediaRecorder.state)
                        console.log("recorder started")
                        recordButton.style.background = "red"
                        recordButton.style.color = "black"
                        setStatus("Recording...")
                    } else {
                        mediaRecorder.stop()
                        console.log(mediaRecorder.state)
                        console.log("recorder stopped")
                        recordButton.style.background = ""
                        recordButton.style.color = ""
                        setStatus("Stopped recording.")
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

    if (role === null) {
        onClick("#fullscreen", () => {
            document.body.requestFullscreen()
        })
    } else if (role === "player") {
        video.requestFullscreen()
    } else if (role === "editor") {
        document.body.requestFullscreen()
    }
}

async function uploadVideo(blob: Blob) {
    // Get transcription & alignment from server.
    setStatus("Transcribing & aligning...")
    const form = new FormData()
    form.append("video", blob)
    const url = "transcribe"
    console.log("sending transcription request")
    const resp = await fetch(url, { method: "POST", body: form })
    const name = await resp.text()
    loadVideo(`uploads/${name}`)
}

async function loadVideo(url: string | null, remoteControlled=false) {
    // await audioContext.resume()
    if (!remoteControlled) {
        console.log("loadProcessedVideo send")
        socket.send(JSON.stringify({ type: "video", url }))
    }
    if (url === null) {
        if (video) video.src = ""
        transcriptBlocks = []
        renderTranscript()
    } else {
        setStatus(`Fetching "${url}"...`)
        let [videoFile, alignment] = await Promise.all([
            fetch(`${url}.mp4`).then(r => r.blob()),
            fetch(`${url}.json`).then(r => r.json())
        ])
        setStatus("Decoding...")
        buffer = await audioContext.decodeAudioData(await videoFile.arrayBuffer())
        transcriptBlocks = generateBlocks(alignment, buffer.duration)
        renderTranscript()
        if (video) video.src = URL.createObjectURL(videoFile)
        if (!remoteControlled) {
            resetEditor()
        }
    }
    setStatus("Ready.")
}

setup()
