export class AudioSystem {
    constructor(audioElementId) {
        this.audioElement = document.getElementById(audioElementId);
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.isInitialized = false;
        this.onEnded = null;

        if(this.audioElement) {
            this.audioElement.addEventListener('ended', () => {
                if (this.onEnded) this.onEnded();
            });
        }
    }

    init() {
        if (this.isInitialized) return;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        const source = this.audioContext.createMediaElementSource(this.audioElement);
        source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        this.analyser.fftSize = 64;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.isInitialized = true;
    }

    play() {
        if (!this.isInitialized) this.init();
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.audioElement.play();
    }

    stop() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
    }

    getBeatIntensity() {
        if (!this.isInitialized) return 0;
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < 5; i++) sum += this.dataArray[i];
        return (sum / 5) / 255;
    }

    playImpactThunder() {
        if (!this.isInitialized) this.init();
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // Sub-bass Oscillator (O estrondo)
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now); // Frequência inicial média
        osc.frequency.exponentialRampToValueAtTime(10, now + 1.5); // Cai vertiginosamente pro sub-grave
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(1.5, now + 0.1); // Ataque brutal
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0); // Decaimento longo
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 2.0);

        // Noise Burst (O relâmpago quebrando a barreira)
        const bufferSize = ctx.sampleRate * 1.5; // 1.5 segundos de ruído
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            // Ruído branco puxado pro grave
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.2)); 
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(1000, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(50, now + 1.5);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(1.0, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);
    }

    playWhoosh() {
        if (!this.isInitialized) this.init();
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    playJump() {
        if (!this.isInitialized) this.init();
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.3);
    }
}