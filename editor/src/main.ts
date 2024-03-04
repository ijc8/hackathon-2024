import "drag-drop-touch"

const video = document.querySelector("video") as HTMLVideoElement
window.onkeydown = function(ev) {
    if(ev.keyCode == 32) {
        ev.preventDefault()
        video.pause()
    }
}

const transcriptEl = document.getElementById("transcript") as HTMLDivElement

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

transcriptEl.innerHTML = "Click to start." // "Loading..."

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
    text: string
    start: number
    end: number
    el?: HTMLSpanElement
    word?: Word
}

let blocks: Block[] = []

function generateBlocks(ret: Result): Block[] {
    const blocks = []
    const wds = ret.words
    const transcript = ret.transcript

    let currentOffset = 0
    let currentTime = 0
    
    for (const wd of wds) {
        if (wd.case == "not-found-in-transcript") {
            // TODO: does this case actually happen? what should we do with this?
            // var txt = ' ' + wd.word
            // var $plaintext = document.createTextNode(txt)
            // transcriptEl.appendChild($plaintext)
            // continue
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
    blocks.push({ text, start: currentTime, end: buffer.duration })
    return blocks
}

// Drag to reorder: state
const tmpEl = document.createElement("span")
tmpEl.id = "tmp"
tmpEl.textContent = "TEMP"

let source: Block | null = null
let destination: Block | null = null

function renderBlocks(blocks: Block[]) {
    transcriptEl.innerHTML = ""
    for (const block of blocks) {      
        const el = document.createElement('span') 
        el.appendChild(document.createTextNode(block.text))
        el.className = "block"
        el.draggable = true
        el.addEventListener("dragstart", e => {
            el.style.display = "none"
            tmpEl.style.display = "inline"
            tmpEl.textContent = el.textContent
            el.parentElement!.insertBefore(tmpEl, el)
            source = block
            destination = block
        })
        el.addEventListener("dragend", e => {
            tmpEl.style.display = "none"
            blocks.splice(blocks.indexOf(destination!), 0, source!)
            blocks.splice(blocks.indexOf(source!), 1)
            renderBlocks(blocks)
        })
        el.addEventListener("dragenter", e => {
            el.classList.add("dragover")
            // TODO: determine whether to insert before/after based on direction of motion or maybe previous insertion point.
            el.parentElement!.insertBefore(tmpEl, el)
            destination = block
        })
        el.addEventListener("dragleave", e => {
            el.classList.remove("dragover")
        })
        // el.onclick = () => {
        el.ontouchstart = () => {
            console.log(block.start)
            // video.currentTime = block.start
            // Imprecise and not supported in Chrome:
            // video.fastSeek(block.start)
            // video.play()
        }
        transcriptEl.appendChild(el)
        block.el = el
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
    console.log(audioContext.outputLatency)
    const data = await (await fetch("a.wav")).arrayBuffer()
    buffer = await audioContext.decodeAudioData(data)
}

async function play() {
    let nextTime = 0
    currentBlock = blocks[blocks.length - 1]
    while (true) {
        // For fun:
        // if (blocks.indexOf(currentBlock) === blocks.length - 1) {
        //     shuffleBlocks()
        //     currentBlock = blocks[blocks.length - 1]
        // }
        const nextIndex = (blocks.indexOf(currentBlock) + 1) % blocks.length
        const nextBlock = blocks[nextIndex]
        // console.log(blocks.indexOf(currentBlock), blocks.indexOf(nextBlock))
        const duration = nextBlock.end - nextBlock.start
        const source = new AudioBufferSourceNode(audioContext, { buffer })
        // console.log("duration", nextBlock.start, nextBlock.end, duration)
        source.start(nextTime, nextBlock.start, duration)
        source.connect(audioContext.destination)
        const gap = nextTime - audioContext.currentTime
        setTimeout(() => {
            video.currentTime = nextBlock.start
            video.play()
            highlightWord(nextBlock, nextBlock.start)
        }, gap * 1000)
        nextTime += duration
        await sleep(gap - 0.05)
        currentBlock = nextBlock
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

function shuffleBlocks() {
    shuffle(blocks)
    renderBlocks(blocks)
    // TODO: Play back video/audio in order determined by blocks.
}

const shuffleButton = document.querySelector("#shuffle") as HTMLButtonElement
shuffleButton.onclick = shuffleBlocks

const fullscreenButton = document.querySelector("#fullscreen") as HTMLButtonElement
fullscreenButton.onclick = () => video.requestFullscreen()

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

async function update() {
    if(INLINE_JSON) {
        // We want this to work from file:/// domains, so we provide a
        // mechanism for inlining the alignment data.
        await setup()
        blocks = generateBlocks(INLINE_JSON)
        currentBlock = blocks[0]
        renderBlocks(blocks)
        play()
    }
    else  {
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
}

var INLINE_JSON: Result = {
    "transcript": "  This is a sentence. And this is another sentence. And finally, we have a third sentence. Wow.\n",
    "words": [
        {
            "alignedWord": "this",
            "case": "success",
            "end": 1.47,
            "endOffset": 6,
            "phones": [
                {
                    "duration": 0.11,
                    "phone": "dh_B"
                },
                {
                    "duration": 0.07,
                    "phone": "ih_I"
                },
                {
                    "duration": 0.27,
                    "phone": "s_E"
                }
            ],
            "start": 1.02,
            "startOffset": 2,
            "word": "This"
        },
        {
            "alignedWord": "is",
            "case": "success",
            "end": 1.72,
            "endOffset": 9,
            "phones": [
                {
                    "duration": 0.12,
                    "phone": "ih_B"
                },
                {
                    "duration": 0.08,
                    "phone": "z_E"
                }
            ],
            "start": 1.52,
            "startOffset": 7,
            "word": "is"
        },
        {
            "alignedWord": "a",
            "case": "success",
            "end": 1.8,
            "endOffset": 11,
            "phones": [
                {
                    "duration": 0.08,
                    "phone": "ah_S"
                }
            ],
            "start": 1.72,
            "startOffset": 10,
            "word": "a"
        },
        {
            "alignedWord": "sentence",
            "case": "success",
            "end": 2.6100000000000003,
            "endOffset": 20,
            "phones": [
                {
                    "duration": 0.12,
                    "phone": "s_B"
                },
                {
                    "duration": 0.06,
                    "phone": "eh_I"
                },
                {
                    "duration": 0.05,
                    "phone": "n_I"
                },
                {
                    "duration": 0.06,
                    "phone": "t_I"
                },
                {
                    "duration": 0.07,
                    "phone": "ah_I"
                },
                {
                    "duration": 0.09,
                    "phone": "n_I"
                },
                {
                    "duration": 0.36,
                    "phone": "s_E"
                }
            ],
            "start": 1.8,
            "startOffset": 12,
            "word": "sentence"
        },
        {
            "alignedWord": "and",
            "case": "success",
            "end": 4.51,
            "endOffset": 25,
            "phones": [
                {
                    "duration": 0.12,
                    "phone": "ae_B"
                },
                {
                    "duration": 0.1,
                    "phone": "n_I"
                },
                {
                    "duration": 0.11,
                    "phone": "d_E"
                }
            ],
            "start": 4.18,
            "startOffset": 22,
            "word": "And"
        },
        {
            "alignedWord": "this",
            "case": "success",
            "end": 5.06,
            "endOffset": 30,
            "phones": [
                {
                    "duration": 0.01,
                    "phone": "dh_B"
                },
                {
                    "duration": 0.18,
                    "phone": "ih_I"
                },
                {
                    "duration": 0.36,
                    "phone": "s_E"
                }
            ],
            "start": 4.51,
            "startOffset": 26,
            "word": "this"
        },
        {
            "alignedWord": "is",
            "case": "success",
            "end": 6.5200000000000005,
            "endOffset": 33,
            "phones": [
                {
                    "duration": 0.28,
                    "phone": "ih_B"
                },
                {
                    "duration": 0.29,
                    "phone": "z_E"
                }
            ],
            "start": 5.95,
            "startOffset": 31,
            "word": "is"
        },
        {
            "alignedWord": "another",
            "case": "success",
            "end": 7.73,
            "endOffset": 41,
            "phones": [
                {
                    "duration": 0.1,
                    "phone": "ah_B"
                },
                {
                    "duration": 0.19,
                    "phone": "n_I"
                },
                {
                    "duration": 0.07,
                    "phone": "ah_I"
                },
                {
                    "duration": 0.11,
                    "phone": "dh_I"
                },
                {
                    "duration": 0.11,
                    "phone": "er_E"
                }
            ],
            "start": 7.15,
            "startOffset": 34,
            "word": "another"
        },
        {
            "alignedWord": "sentence",
            "case": "success",
            "end": 8.52,
            "endOffset": 50,
            "phones": [
                {
                    "duration": 0.14,
                    "phone": "s_B"
                },
                {
                    "duration": 0.06,
                    "phone": "eh_I"
                },
                {
                    "duration": 0.08,
                    "phone": "n_I"
                },
                {
                    "duration": 0.06,
                    "phone": "t_I"
                },
                {
                    "duration": 0.07,
                    "phone": "ah_I"
                },
                {
                    "duration": 0.1,
                    "phone": "n_I"
                },
                {
                    "duration": 0.27,
                    "phone": "s_E"
                }
            ],
            "start": 7.74,
            "startOffset": 42,
            "word": "sentence"
        },
        {
            "alignedWord": "and",
            "case": "success",
            "end": 10.24,
            "endOffset": 55,
            "phones": [
                {
                    "duration": 0.07,
                    "phone": "ae_B"
                },
                {
                    "duration": 0.05,
                    "phone": "n_I"
                },
                {
                    "duration": 0.05,
                    "phone": "d_E"
                }
            ],
            "start": 10.07,
            "startOffset": 52,
            "word": "And"
        },
        {
            "alignedWord": "finally",
            "case": "success",
            "end": 10.930000000000001,
            "endOffset": 63,
            "phones": [
                {
                    "duration": 0.12,
                    "phone": "f_B"
                },
                {
                    "duration": 0.09,
                    "phone": "ay_I"
                },
                {
                    "duration": 0.06,
                    "phone": "n_I"
                },
                {
                    "duration": 0.07,
                    "phone": "ah_I"
                },
                {
                    "duration": 0.07,
                    "phone": "l_I"
                },
                {
                    "duration": 0.22,
                    "phone": "iy_E"
                }
            ],
            "start": 10.3,
            "startOffset": 56,
            "word": "finally"
        },
        {
            "alignedWord": "we",
            "case": "success",
            "end": 11.51,
            "endOffset": 67,
            "phones": [
                {
                    "duration": 0.09,
                    "phone": "w_B"
                },
                {
                    "duration": 0.1,
                    "phone": "iy_E"
                }
            ],
            "start": 11.32,
            "startOffset": 65,
            "word": "we"
        },
        {
            "alignedWord": "have",
            "case": "success",
            "end": 11.939999,
            "endOffset": 72,
            "phones": [
                {
                    "duration": 0.09,
                    "phone": "hh_B"
                },
                {
                    "duration": 0.21,
                    "phone": "ae_I"
                },
                {
                    "duration": 0.13,
                    "phone": "v_E"
                }
            ],
            "start": 11.509999,
            "startOffset": 68,
            "word": "have"
        },
        {
            "alignedWord": "a",
            "case": "success",
            "end": 12.7,
            "endOffset": 74,
            "phones": [
                {
                    "duration": 0.12,
                    "phone": "ah_S"
                }
            ],
            "start": 12.58,
            "startOffset": 73,
            "word": "a"
        },
        {
            "alignedWord": "third",
            "case": "success",
            "end": 13.03,
            "endOffset": 80,
            "phones": [
                {
                    "duration": 0.12,
                    "phone": "th_B"
                },
                {
                    "duration": 0.13,
                    "phone": "er_I"
                },
                {
                    "duration": 0.08,
                    "phone": "d_E"
                }
            ],
            "start": 12.7,
            "startOffset": 75,
            "word": "third"
        },
        {
            "alignedWord": "sentence",
            "case": "success",
            "end": 13.66,
            "endOffset": 89,
            "phones": [
                {
                    "duration": 0.09,
                    "phone": "s_B"
                },
                {
                    "duration": 0.06,
                    "phone": "eh_I"
                },
                {
                    "duration": 0.06,
                    "phone": "n_I"
                },
                {
                    "duration": 0.05,
                    "phone": "t_I"
                },
                {
                    "duration": 0.06,
                    "phone": "ah_I"
                },
                {
                    "duration": 0.07,
                    "phone": "n_I"
                },
                {
                    "duration": 0.24,
                    "phone": "s_E"
                }
            ],
            "start": 13.03,
            "startOffset": 81,
            "word": "sentence"
        },
        {
            "alignedWord": "wow",
            "case": "success",
            "end": 15.870000000000001,
            "endOffset": 94,
            "phones": [
                {
                    "duration": 0.17,
                    "phone": "w_B"
                },
                {
                    "duration": 0.24,
                    "phone": "aw_E"
                }
            ],
            "start": 15.46,
            "startOffset": 91,
            "word": "Wow"
        }
    ]
}

update()
// Wait until we have video length.
// if (video.duration) {
//     update()
// } else {
//     const onLoadedMetadata = () => {
//         video.removeEventListener("loadedmetadata", onLoadedMetadata)
//         update()
//     }
//     video.addEventListener("loadedmetadata", onLoadedMetadata)
// }
