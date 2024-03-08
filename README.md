# Cadence (Synthux Hackathon 2024)

A magic book that connects sound, motion, and language to explore meaning & movement.

## Implementation

Cadence allows the user to upload or record video of speech, which is transcribed & aligned by the server, using [whisper.cpp](https://github.com/ggerganov/whisper.cpp) and [gentle](https://lowerquality.com/gentle/), and then manipulate the words (and spaces!) in the transcript to manipulate the audio and video recording via a browser-based frontend. Cadence takes physical form in a book augmented with electronics (two Android devices, an ESP32, and potentiometers and buttons).

Some ways to use it:
- Play with all parts of speech & language, from text to sound to motion
- Reflect on the elements of prosody such as intonation and cadence in your speech and others
- Sampler/sequencer for ordered words (e.g. numbers), pitches (e.g. solfege), or movements (voice-annotated choreography)
- Test the limits of the machine learning models that Cadence is built on
- Make sick beatz from famous speeches

## Installation

- Build [whisper.cpp](https://github.com/ggerganov/whisper.cpp) and download a model.
  - Change the paths in `server/main.py` to point to your installation of whisper.cpp. (Sorry! It's a hackathon project.)
- Start [gentle](https://lowerquality.com/gentle/): `docker run -P lowerquality/gentle`
- Build the client: `cd editor; npm install; npm run build; cd ..`
- Run the server: `cd server; virtualenv -p python venv; source venv/bin/activate; pip install -r requirements.txt; python main.py`
- Open up `http://localhost:8000` in your browser.
- Have fun!

If you want to build your own physical Cadence book, follow the instructions at https://www.wikihow.com/Make-a-Hollow-Book and check out the model and code for ESP32 in `hardware/`.

## Future work
- Allow manipulation of speech parameters (fundamental frequencies, formants, amplitudes) via [LPC](https://www.kuniga.me/blog/2021/05/13/lpc-in-python.html) analysis and re-synthesis. Display parameters in transcript along with words.

## Inspirations
- [gentle](https://lowerquality.com/gentle/) and [drift](https://rmozone.com/drift/)
- sampling & splicing techniques in audio and video
- books, in both text and audio form
