import asyncio
import json
import time
import os
import sys

import tempfile

from sanic import Sanic
from sanic.request import Request
from sanic.response import text

app = Sanic("Book")

upload_dir = os.path.join(sys.path[0], "uploads")

@app.post("sensors")
async def sensors(request):
    print("sensors", request)
    print("body", request.body)
    return text("great!")

@app.post("transcribe")
async def transcribe(request):
    # Extract & convert audio with ffmpeg, then run whisper.cpp to generate transcript.
    print("transcribe")
    file = request.files.get("video")
    print("received video", len(file.body))
    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = os.path.join(tmp_dir, "v")
        audio_path = os.path.join(tmp_dir, "a.wav")
        with open(video_path, "wb") as video_file:
            video_file.write(file.body)
        proc = await asyncio.create_subprocess_exec("/usr/bin/ffmpeg", "-i", video_path, "-ar", "16000", audio_path)
        ret = await proc.wait()
        print("ffmpeg returned", ret)
        proc = await asyncio.create_subprocess_exec(
            "/home/ian/GT/whisper.cpp/main",
            "-m", "/home/ian/GT/whisper.cpp/models/ggml-base.en.bin", "-f", audio_path, "-nt",
            stdout=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        print("whisper finished:", stdout)
    return text(stdout.decode())



# TODO multi-client thing
MIN_VALUE, MAX_VALUE = 0, 127
state = []
update = asyncio.Event()

@app.websocket("/ws")
async def websocket(request, ws):
    global state
    # A coroutine is spawned for each connected client.
    # client_state = state[:]
    print("New websocket connection from", request.ip)
    # New connection: send the current state.
    await ws.send(json.dumps({
        "state": state,
    }))
    recv = asyncio.create_task(ws.recv())
    updated = asyncio.create_task(update.wait())
    while True:
        # Wait for a new message from our client, or an update to the state (from another client).
        # Handle whichever happens first.
        done, _ = await asyncio.wait({recv, updated}, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if task is recv:
                t = time.time()
                # Uncomment to see what we got from the client:
                print(task.result())
                # message = json.loads(task.result())
                # print(f"Got message from {request.ip}: {message}")
                # Got a message from the client; update the state.
                # for param, delta in message.items():
                #     param = int(param)
                #     state[param] = max(MIN_VALUE, min(state[param] + delta, MAX_VALUE))
                    # Clients update their local state immediately:
                    # client_state[param] += delta
                # state = message
                # Signal to all coroutines that they should send updates to their clients.
                update.set()
                update.clear()
                recv = asyncio.create_task(ws.recv())
            elif task is updated:
                # State updated.
                # Send mode if it changed.
                # if mode != client_mode:
                    # client_mode = mode
                    # await ws.send(json.dumps(mode))
                # Compute the diff with the client's local state, and send the necessary updates.
                # diff = [[i, v] for i, v in enumerate(state) if v != client_state[i]]
                # Don't send a message if nothing needs to be updated.  
                # if diff:
                    # client_state[:] = state
                    # await ws.send(json.dumps(diff))
                await ws.send(json.dumps(state))
                updated = asyncio.create_task(update.wait())

# app.static("/", "index.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, dev=True)
