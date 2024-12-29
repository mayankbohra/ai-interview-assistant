export function cn(...classes) {
    return classes.filter(Boolean).join(" ");
}

export const base64ToFloat32Array = (base64) => {
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        // Convert to 16-bit PCM
        const pcm16 = new Int16Array(bytes.buffer);
        // Convert to float32 with proper normalization
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
            // Normalize to [-1, 1]
            float32[i] = pcm16[i] / 32768.0;
        }
        return float32;
    } catch (error) {
        console.error('Error converting base64 to Float32Array:', error);
        throw error;
    }
};

export const float32ToPcm16 = (float32Array) => {
    try {
        const pcm16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            // Convert to 16-bit PCM
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm16;
    } catch (error) {
        console.error('Error converting Float32Array to PCM16:', error);
        throw error;
    }
};
