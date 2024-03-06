import asyncio
import json
import datetime
import time
import os
import sys
import tempfile

import httpx

from sanic import Sanic
from sanic.request import Request
from sanic.response import text

app = Sanic("Book")

upload_dir = os.path.join(sys.path[0], "uploads")
os.makedirs(upload_dir, exist_ok=True)

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
        name = datetime.datetime.utcnow().isoformat()
        # NOTE: We're assuming we get an mp4 from the client.
        video_path = os.path.join(upload_dir, name + ".mp4")
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
        transcript, _ = await proc.communicate()
        print("whisper finished:", transcript)
        async with httpx.AsyncClient() as client:
            print("sending request")
            r = await client.post(
                "http://localhost:8765/transcriptions",
                files={"audio": file.body, "transcript": transcript},
            )
            assert r.status_code == 302
            location = r.headers["location"]
            status_url = f"http://localhost:8765{location}/status.json"
            status = "STARTED"
            print(status_url)
            while status in ["STARTED", "ENCODING", "TRANSCRIBING", "ALIGNING"]:
                r = await client.get(status_url)
                print(r.json())
                status = r.json()["status"]
            assert status == "OK"
            r = await client.get(f"http://localhost:8765{location}/align.json")
            alignment = r.json()
        align_path = os.path.join(upload_dir, name + ".json")
        with open(align_path, "w") as align_file:
            json.dump(alignment, align_file)
    return text(name)



# TODO multi-client thing
MIN_VALUE, MAX_VALUE = 0, 127
state = {}
# update = asyncio.Event()
clients = []

@app.websocket("/ws")
async def websocket(request, ws):
    global state
    # A coroutine is spawned for each connected client.
    # client_state = state[:]
    print("New websocket connection from", request.ip)
    # New connection: send the current state.
    # await ws.send(json.dumps({
    #     "state": state,
    # }))
    try:
        clients.append(ws)
        if state:
            await asyncio.wait([ws.send(message) for message in state.values()])
        # recv = asyncio.create_task(ws.recv())
        # updated = asyncio.create_task(update.wait())
        async for message in ws:
            # message = json.loads(message)
            # Wait for a new message from our client, or an update to the state (from another client).
            # Handle whichever happens first.
            # done, _ = await asyncio.wait({recv, updated}, return_when=asyncio.FIRST_COMPLETED)
            # for task in done:
            #     if task is recv:
            #         t = time.time()
            #         # Uncomment to see what we got from the client:
            #         print(task.result())
            #         message = json.loads(task.result())
            print(message)
            state[json.loads(message)["type"]] = message
                    # print(f"Got message from {request.ip}: {message}")
                    # Got a message from the client; update the state.
                    # for param, delta in message.items():
                    #     param = int(param)
                    #     state[param] = max(MIN_VALUE, min(state[param] + delta, MAX_VALUE))
                        # Clients update their local state immediately:
                        # client_state[param] += delta
                    # state = message
                    # Signal to all coroutines that they should send updates to their clients.
                    # update.set()
                    # update.clear()
                    # recv = asyncio.create_task(ws.recv())
                    # TODO: Only broadcast to others
            if len(clients) > 1:
                await asyncio.wait([client.send(message) for client in clients if client is not ws])
                # elif task is updated:
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
                    # await ws.send(json.dumps(state))
                    # updated = asyncio.create_task(update.wait())
    finally:
        clients.remove(ws)

app.static("/", "../editor/dist/index.html")
app.static("/assets", "../editor/dist/assets", name="assets")
app.static("/uploads", upload_dir, name="uploads")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, dev=True)
