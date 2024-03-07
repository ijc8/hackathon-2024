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
    data = json.loads(request.body)
    # print(data)
    # TODO handle buttons
    message = {
        "type": "parameters",
        "volume": data["pot1"] / 4095,
        "speed": data["pot2"] / 4095,
        "pitch": data["pot3"] / 4095,
    }
    message_json = json.dumps(message)
    print(message_json)
    state[message["type"]] = message_json
    if clients:
        await asyncio.wait([client.send(message_json) for client in clients])
    return text("great!")

@app.post("transcribe")
async def transcribe(request):
    # Extract & convert audio with ffmpeg, then run whisper.cpp to generate transcript.
    print("transcribe")
    file = request.files.get("video")
    print("received video", len(file.body))
    with tempfile.TemporaryDirectory() as tmp_dir:
        name = datetime.datetime.utcnow().isoformat()
        # Dump post body into temporary file
        tmp_video_path = os.path.join(tmp_dir, "v")
        with open(tmp_video_path, "wb") as video_file:
            video_file.write(file.body)
        async def reencode():
            # Re-encode video for fast decode & seeking (critical on mobile)
            video_path = os.path.join(upload_dir, name + ".mp4")
            proc = await asyncio.create_subprocess_exec("/usr/bin/ffmpeg", "-i", tmp_video_path, "-tune", "fastdecode", "-g", "1", "-crf", "30", video_path)
            ret = await proc.wait()
        async def transcribe_and_align():
            # Extract audio for whisper.cpp
            audio_path = os.path.join(tmp_dir, "a.wav")
            # audio_path = os.path.join(upload_dir, name + ".wav")
            proc = await asyncio.create_subprocess_exec("/usr/bin/ffmpeg", "-i", tmp_video_path, "-ar", "16000", audio_path)
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
        await asyncio.wait([reencode(), transcribe_and_align()])
    return text(name)

state = {}
clients = []

@app.websocket("/ws")
async def websocket(request, ws):
    global state
    print("New websocket connection from", request.ip)
    try:
        clients.append(ws)
        if state:
            # New connection: send the current state.
            await asyncio.wait([ws.send(message) for message in state.values()])
        async for message in ws:
            print(message)
            state[json.loads(message)["type"]] = message
            if len(clients) > 1:
                await asyncio.wait([client.send(message) for client in clients if client is not ws])
    finally:
        clients.remove(ws)

app.static("/", "../editor/dist/index.html")
app.static("/assets", "../editor/dist/assets", name="assets")
app.static("/uploads", upload_dir, name="uploads")
app.static("/examples", "../editor/public/examples", name="examples")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000) #, dev=True)
