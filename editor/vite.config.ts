import { defineConfig } from "vite"

export default defineConfig({
    server: {
        proxy: {
            "/transcriptions": "http://localhost:8765",
            "/transcribe": "http://localhost:8000",
            "/uploads": "http://localhost:8000",
        }
    }
})
