import { type PreviewHandler, DEFAULT_BLOB_BUTTON_SELECTOR } from '../handler';
import { escapeHTML, base64ToArrayBuffer } from '../../utils';
import { renderErrorContent } from '../ui';

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

export function isAudioExtension(ext: string): boolean {
  return AUDIO_EXTENSIONS.includes(ext.toLowerCase());
}

function getAudioMimeType(filename: string): string {
  const ext = filename.split('.').pop()!.toLowerCase();
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    aac: 'audio/aac',
  };
  return mimeTypes[ext] || 'audio/mpeg';
}

function fetchAudioFromBackground(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'fetchAudio', url }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response.success) {
          resolve(base64ToArrayBuffer(response.data));
        } else {
          reject(new Error(response.error || 'Failed to fetch audio'));
        }
      });
    } else {
      reject(new Error('Chrome runtime not available'));
    }
  });
}

export class GitPreviewAudioPlayer {
  url: string;
  filename: string;
  arrayBuffer: ArrayBuffer;
  audioBuffer: AudioBuffer | null = null;
  audioContext: AudioContext | null = null;
  sourceNode: AudioBufferSourceNode | null = null;
  gainNode: GainNode | null = null;
  isPlaying = false;
  startTime = 0;
  pauseTime = 0;
  volume = 1;
  container: HTMLElement | null = null;
  elements: Record<string, HTMLElement | null> = {};
  progressUpdateInterval: ReturnType<typeof setInterval> | null = null;
  waveformData: number[] = [];
  _boundDocumentClick: (() => void) | null = null;
  _boundWindowResize: (() => void) | null = null;

  constructor(options: { url: string; filename: string; arrayBuffer: ArrayBuffer }) {
    this.url = options.url;
    this.filename = options.filename || 'Audio File';
    this.arrayBuffer = options.arrayBuffer;
  }

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'gitpreview-audio-player';
    this.container.innerHTML = this.getHTML();
    this.cacheElements();
    this.bindEvents();
    this.initAudio();
    return this.container;
  }

  getHTML(): string {
    const fileSizeKB = Math.round(this.arrayBuffer.byteLength / 1024);
    return `
      <div class="gitpreview-audio-header">
        <div class="gitpreview-audio-header-left">
          <svg class="gitpreview-audio-header-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <span class="gitpreview-audio-filename">${escapeHTML(this.filename)}</span>
          <span class="gitpreview-audio-filesize">${fileSizeKB} KB</span>
        </div>
      </div>
      <div class="gitpreview-audio-main">
        <button class="gitpreview-audio-play-btn" id="gitpreview-play-pause" title="Play/Pause">
          <svg id="gitpreview-play-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <svg id="gitpreview-pause-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style="display: none;">
            <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
          </svg>
        </button>
        <div class="gitpreview-audio-time">
          <span id="gitpreview-current-time">0:00</span>
          <span>/</span>
          <span id="gitpreview-total-time">0:00</span>
        </div>
        <div class="gitpreview-audio-waveform-container">
          <canvas id="gitpreview-waveform" class="gitpreview-audio-waveform"></canvas>
          <div class="gitpreview-audio-progress-bar" id="gitpreview-progress-bar">
            <div class="gitpreview-audio-progress-fill" id="gitpreview-progress-fill"></div>
          </div>
        </div>
        <div class="gitpreview-audio-volume-section">
          <svg class="gitpreview-audio-volume-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path id="gitpreview-volume-icon-path" stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
          </svg>
          <input type="range" id="gitpreview-volume" min="0" max="100" value="100" class="gitpreview-audio-volume-slider">
        </div>
        <div class="gitpreview-audio-more-wrapper">
          <button class="gitpreview-audio-more-btn" id="gitpreview-more" title="More options">
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </button>
          <div class="gitpreview-audio-more-menu" id="gitpreview-more-menu">
            <button class="gitpreview-audio-menu-item" id="gitpreview-menu-download">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Download
            </button>
          </div>
        </div>
      </div>
    `;
  }

  cacheElements(): void {
    if (!this.container) return;
    const el = (id: string) => this.container!.querySelector<HTMLElement>(id);
    this.elements = {
      playPauseBtn: el('#gitpreview-play-pause'),
      playIcon: el('#gitpreview-play-icon'),
      pauseIcon: el('#gitpreview-pause-icon'),
      waveform: el('#gitpreview-waveform'),
      progressBar: el('#gitpreview-progress-bar'),
      progressFill: el('#gitpreview-progress-fill'),
      volume: el('#gitpreview-volume'),
      volumeIconPath: el('#gitpreview-volume-icon-path'),
      currentTime: el('#gitpreview-current-time'),
      totalTime: el('#gitpreview-total-time'),
      moreBtn: el('#gitpreview-more'),
      moreMenu: el('#gitpreview-more-menu'),
      downloadBtn: el('#gitpreview-menu-download'),
    };
  }

  bindEvents(): void {
    this._boundDocumentClick = () => this.closeMenu();
    this._boundWindowResize = () => this.drawWaveform();
    this.elements.playPauseBtn?.addEventListener('click', () => this.togglePlay());
    this.elements.progressBar?.addEventListener('click', (e) =>
      this.handleProgressClick(e as MouseEvent),
    );
    this.elements.volume?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.setVolume(Number(target.value));
      this.updateVolumeSliderBackground(Number(target.value));
    });
    this.elements.moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });
    this.elements.downloadBtn?.addEventListener('click', () => this.download());
    document.addEventListener('click', this._boundDocumentClick);
    window.addEventListener('resize', this._boundWindowResize);
    this.updateVolumeSliderBackground(100);
  }

  updateVolumeSliderBackground(percent: number): void {
    const el = this.elements.volume as HTMLInputElement | null;
    if (!el) return;
    el.style.background = `linear-gradient(to right, #0969da 0%, #0969da ${percent}%, #d1d9e0 ${percent}%, #d1d9e0 100%)`;
  }

  async initAudio(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.volume;

      this.audioBuffer = await this.audioContext.decodeAudioData(this.arrayBuffer.slice(0));
      this.elements.totalTime!.textContent = this.formatTime(this.audioBuffer.duration);
      this.generateWaveformData();
      this.drawWaveform();
    } catch (err) {
      console.error('Failed to initialize audio:', err);
    }
  }

  generateWaveformData(): void {
    if (!this.audioBuffer) return;
    const channelData = this.audioBuffer.getChannelData(0);
    const samples = 200;
    const blockSize = Math.floor(channelData.length / samples);
    this.waveformData = [];

    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[i * blockSize + j]);
      }
      this.waveformData.push(sum / blockSize);
    }

    const max = Math.max(...this.waveformData);
    if (max > 0) {
      this.waveformData = this.waveformData.map((v) => v / max);
    }
  }

  drawWaveform(): void {
    const canvas = this.elements.waveform as HTMLCanvasElement | null;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const barWidth = width / this.waveformData.length;
    const barGap = 1;

    ctx.clearRect(0, 0, width, height);

    this.waveformData.forEach((value, index) => {
      const barHeight = Math.max(2, value * height * 0.8);
      const x = index * barWidth;
      const y = (height - barHeight) / 2;

      const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
      gradient.addColorStop(0, '#8b949e');
      gradient.addColorStop(0.5, '#6e7681');
      gradient.addColorStop(1, '#8b949e');

      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth - barGap, barHeight);
    });
  }

  handleProgressClick(e: MouseEvent): void {
    const rect = this.elements.progressBar!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const duration = this.getDuration();
    const newTime = percentage * duration;

    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();

    this.pauseTime = newTime;
    this.updateProgress();
    if (wasPlaying) this.play();
  }

  togglePlay(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  play(): void {
    if (!this.audioContext || !this.audioBuffer) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.stopSource();

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.gainNode!);
    this.sourceNode.onended = () => {
      if (this.isPlaying && this.getCurrentTime() >= this.getDuration()) {
        this.onEnded();
      }
    };

    const offset = this.pauseTime;
    this.sourceNode.start(0, offset);
    this.startTime = this.audioContext.currentTime - offset;

    this.isPlaying = true;
    this.updatePlayPauseIcon();
    this.startProgressUpdate();
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.pauseTime = this.getCurrentTime();
    this.stopSource();
    this.isPlaying = false;
    this.updatePlayPauseIcon();
    this.stopProgressUpdate();
    this.updateProgress();
  }

  stopSource(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        // already stopped
      }
      this.sourceNode = null;
    }
  }

  updatePlayPauseIcon(): void {
    if (this.elements.playIcon && this.elements.pauseIcon) {
      if (this.isPlaying) {
        this.elements.playIcon.style.display = 'none';
        this.elements.pauseIcon.style.display = 'block';
      } else {
        this.elements.playIcon.style.display = 'block';
        this.elements.pauseIcon.style.display = 'none';
      }
    }
  }

  getCurrentTime(): number {
    if (this.isPlaying && this.audioContext) {
      return this.audioContext.currentTime - this.startTime;
    }
    return this.pauseTime;
  }

  getDuration(): number {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  startProgressUpdate(): void {
    this.stopProgressUpdate();
    this.progressUpdateInterval = setInterval(() => {
      this.updateProgress();
    }, 100);
  }

  stopProgressUpdate(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
      this.progressUpdateInterval = null;
    }
  }

  updateProgress(): void {
    const currentTime = this.getCurrentTime();
    const duration = this.getDuration();

    if (this.isPlaying && currentTime >= duration) {
      this.onEnded();
      return;
    }

    if (duration > 0) {
      const percent = (currentTime / duration) * 100;
      this.elements.progressFill!.style.width = `${percent}%`;
      this.elements.currentTime!.textContent = this.formatTime(currentTime);
    }
  }

  updateDuration(): void {
    this.elements.totalTime!.textContent = this.formatTime(this.getDuration());
  }

  onEnded(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.pauseTime = 0;
    this.stopSource();
    this.updatePlayPauseIcon();
    this.stopProgressUpdate();

    if (this.elements.progressFill && this.audioBuffer) {
      this.elements.progressFill.style.width = '100%';
      this.elements.currentTime!.textContent = this.formatTime(this.audioBuffer.duration);
    }
  }

  rewind(seconds: number): void {
    const newTime = Math.max(0, this.getCurrentTime() - seconds);
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pauseTime = newTime;
    this.updateProgress();
    if (wasPlaying) this.play();
  }

  forward(seconds: number): void {
    const newTime = Math.min(this.getDuration(), this.getCurrentTime() + seconds);
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pauseTime = newTime;
    this.updateProgress();
    if (wasPlaying) this.play();
  }

  onError(err: unknown): void {
    console.error('Audio error:', err);
  }

  toggleMenu(): void {
    const menu = this.elements.moreMenu;
    if (!menu) return;
    const isOpen = menu.classList.contains('gitpreview-audio-menu-open');
    this.closeMenu();
    if (!isOpen) menu.classList.add('gitpreview-audio-menu-open');
  }

  closeMenu(): void {
    this.elements.moreMenu?.classList.remove('gitpreview-audio-menu-open');
  }

  download(): void {
    this.closeMenu();
    const mimeType = getAudioMimeType(this.filename);
    const blob = new Blob([this.arrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  setVolume(percent: number): void {
    this.volume = percent / 100;
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
    this.updateVolumeIcon(percent);
  }

  updateVolumeIcon(percent: number): void {
    const vol = parseInt(String(percent));
    let path = '';
    if (vol === 0) {
      path =
        'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';
    } else if (vol < 50) {
      path =
        'M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';
    } else {
      path =
        'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';
    }
    this.elements.volumeIconPath!.setAttribute('d', path);
  }

  destroy(): void {
    if (this._boundDocumentClick) {
      document.removeEventListener('click', this._boundDocumentClick);
      this._boundDocumentClick = null;
    }
    if (this._boundWindowResize) {
      window.removeEventListener('resize', this._boundWindowResize);
      this._boundWindowResize = null;
    }

    this.pause();
    this.stopProgressUpdate();

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        // ignore
      }
      this.gainNode = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    this.audioBuffer = null;
    this.arrayBuffer = null!;

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

let currentPlayer: GitPreviewAudioPlayer | null = null;

export function openAudioPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  if (currentPlayer) {
    currentPlayer.destroy();
  }

  container.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>
  `;

  return fetchAudioFromBackground(url).then((arrayBuffer) => {
    currentPlayer = new GitPreviewAudioPlayer({
      arrayBuffer,
      url,
      filename,
    });
    container.innerHTML = '';
    container.appendChild(currentPlayer.render());
  });
}

export function closeAudioPreview(): void {
  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }
}

export function getCurrentPlayer(): GitPreviewAudioPlayer | null {
  return currentPlayer;
}

export function togglePlay(): void {
  currentPlayer?.togglePlay();
}

export function rewind(seconds: number): void {
  currentPlayer?.rewind(seconds);
}

export function forward(seconds: number): void {
  currentPlayer?.forward(seconds);
}

export function setVolume(percent: number): void {
  currentPlayer?.setVolume(percent);
}

export function getVolume(): number {
  return currentPlayer ? currentPlayer.volume * 100 : 100;
}

export const audioHandler: PreviewHandler = {
  extensions: AUDIO_EXTENSIONS,
  getBlobButtonSelector: () => DEFAULT_BLOB_BUTTON_SELECTOR,
  openPreview(rawUrl: string, _filename: string, container?: HTMLElement) {
    if (!container) return;
    openAudioPreview(rawUrl, _filename, container).catch((err) => {
      console.error('GitPreview audio error:', err);
      container.innerHTML = renderErrorContent((err as Error).message || 'Failed to load audio');
    });
  },
  close: closeAudioPreview,
};
