import { defineConfig } from "vite"

export default defineConfig({
    server: {
        proxy: {
            "/transcriptions": "http://localhost:8765",
        }
    }
})
