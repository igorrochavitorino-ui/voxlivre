// ==========================================================================
// VoxLivre - Leitor de Texto Copiado (Script Dedicado)
// ==========================================================================

const state = {
  paragraphs: [],
  currentIndex: -1,
  currentBoundaries: [],
  lastHighlightedIdx: -1,
  animFrameId: null,
  narratorMode: 'aula',
  paragraphTransitionTimeout: null,
  isPlaying: false,
  isPaused: false,
  autoAdvance: true,
  currentAudio: null,
  audioCache: new Map(),
  currentExportJobId: null,
  exportPollInterval: null
};

// Elementos DOM
const inputSection = document.getElementById('inputSection');
const readerSection = document.getElementById('readerSection');
const rawTextInput = document.getElementById('rawTextInput');
const btnPasteClipboard = document.getElementById('btnPasteClipboard');
const btnClearText = document.getElementById('btnClearText');
const btnStartReading = document.getElementById('btnStartReading');
const btnBackToEdit = document.getElementById('btnBackToEdit');
const btnEditNewText = document.getElementById('btnEditNewText');

const labelWordCount = document.getElementById('labelWordCount');
const labelCharCount = document.getElementById('labelCharCount');
const labelReadingEstimate = document.getElementById('labelReadingEstimate');

const docTitle = document.getElementById('docTitle');
const docStats = document.getElementById('docStats');
const textDisplay = document.getElementById('textDisplay');

const narratorModeSelect = document.getElementById('narratorModeSelect');
const voiceSelect = document.getElementById('voiceSelect');
const speedSelect = document.getElementById('speedSelect');
const pitchSelect = document.getElementById('pitchSelect');

const playerBar = document.getElementById('playerBar');
const playerPulse = document.getElementById('playerPulse');
const playerStatusLabel = document.getElementById('playerStatusLabel');
const playerSnippet = document.getElementById('playerSnippet');
const btnPlayerPlay = document.getElementById('btnPlayerPlay');
const btnPlayerStop = document.getElementById('btnPlayerStop');
const btnPlayerPrev = document.getElementById('btnPlayerPrev');
const btnPlayerNext = document.getElementById('btnPlayerNext');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const progressBarBg = document.getElementById('progressBarBg');
const progressBarFill = document.getElementById('progressBarFill');
const playerCurrentTime = document.getElementById('playerCurrentTime');
const playerTotalTime = document.getElementById('playerTotalTime');
const chkAutoAdvance = document.getElementById('chkAutoAdvance');

const btnExportModal = document.getElementById('btnExportModal');
const exportModal = document.getElementById('exportModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelExport = document.getElementById('btnCancelExport');
const btnStartExport = document.getElementById('btnStartExport');
const exportProgressBox = document.getElementById('exportProgressBox');
const exportProgressBarFill = document.getElementById('exportProgressBarFill');
const exportPercentText = document.getElementById('exportPercentText');
const exportStatusText = document.getElementById('exportStatusText');
const exportDetailText = document.getElementById('exportDetailText');
const exportDownloadBox = document.getElementById('exportDownloadBox');
const btnDownloadMp3 = document.getElementById('btnDownloadMp3');
const modalFooter = document.getElementById('modalFooter');

// --------------------------------------------------------------------------
// Inicialização e Preferências
// --------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  const savedMode = localStorage.getItem('voxlivre_narrator_mode');
  if (savedMode && narratorModeSelect && narratorModeSelect.querySelector(`option[value="${savedMode}"]`)) {
    narratorModeSelect.value = savedMode;
    state.narratorMode = savedMode;
  }

  const savedVoice = localStorage.getItem('vozlivre_voice');
  const savedSpeed = localStorage.getItem('vozlivre_speed');
  const savedPitch = localStorage.getItem('vozlivre_pitch');

  if (savedVoice && voiceSelect.querySelector(`option[value="${savedVoice}"]`)) {
    voiceSelect.value = savedVoice;
  }
  if (savedSpeed && speedSelect.querySelector(`option[value="${savedSpeed}"]`)) {
    speedSelect.value = savedSpeed;
  }
  if (savedPitch && pitchSelect.querySelector(`option[value="${savedPitch}"]`)) {
    pitchSelect.value = savedPitch;
  }

  document.addEventListener('keydown', handleKeyboardShortcuts);
  updateStats();
});

function applyNarratorMode(mode, userInitiated = true) {
  state.narratorMode = mode;
  localStorage.setItem('voxlivre_narrator_mode', mode);

  if (userInitiated) {
    if (mode === 'aula') {
      speedSelect.value = '-10%'; // 0.90x
      pitchSelect.value = '-2Hz'; // Caloroso
      if (voiceSelect.querySelector('option[value="pt-BR-AntonioNeural"]')) {
        voiceSelect.value = 'pt-BR-AntonioNeural';
      }
    } else if (mode === 'livro') {
      speedSelect.value = '-5%'; // 0.95x
      pitchSelect.value = '+0Hz';
      if (voiceSelect.querySelector('option[value="pt-BR-FranciscaNeural"]')) {
        voiceSelect.value = 'pt-BR-FranciscaNeural';
      }
    } else if (mode === 'conversa') {
      speedSelect.value = '+0%'; // 1.0x
      pitchSelect.value = '+0Hz';
    } else if (mode === 'rapido') {
      speedSelect.value = '+15%'; // 1.15x
      pitchSelect.value = '+0Hz';
    }

    localStorage.setItem('vozlivre_speed', speedSelect.value);
    localStorage.setItem('vozlivre_pitch', pitchSelect.value);
    localStorage.setItem('vozlivre_voice', voiceSelect.value);

    state.audioCache.clear();
    if (state.isPlaying) restartCurrent();
  }
}

if (narratorModeSelect) {
  narratorModeSelect.addEventListener('change', () => {
    applyNarratorMode(narratorModeSelect.value, true);
  });
}

voiceSelect.addEventListener('change', () => {
  localStorage.setItem('vozlivre_voice', voiceSelect.value);
  state.audioCache.clear();
  if (state.isPlaying) restartCurrent();
});

speedSelect.addEventListener('change', () => {
  localStorage.setItem('vozlivre_speed', speedSelect.value);
  state.audioCache.clear();
  if (state.isPlaying) restartCurrent();
});

pitchSelect.addEventListener('change', () => {
  localStorage.setItem('vozlivre_pitch', pitchSelect.value);
  state.audioCache.clear();
  if (state.isPlaying) restartCurrent();
});

chkAutoAdvance.addEventListener('change', (e) => {
  state.autoAdvance = e.target.checked;
});

// --------------------------------------------------------------------------
// Contadores e Ações do Texto
// --------------------------------------------------------------------------
function updateStats() {
  const text = rawTextInput.value.trim();
  const chars = text.length;
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const estMins = Math.ceil(words / 140);

  labelWordCount.textContent = `${words.toLocaleString()} ${words === 1 ? 'palavra' : 'palavras'}`;
  labelCharCount.textContent = `${chars.toLocaleString()} caracteres`;
  labelReadingEstimate.textContent = `~${estMins} min de áudio`;
}

rawTextInput.addEventListener('input', updateStats);

btnPasteClipboard.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      rawTextInput.value = text;
      updateStats();
    }
  } catch (err) {
    alert('Dica: Use Ctrl+V dentro da caixa de texto para colar.');
  }
});

btnClearText.addEventListener('click', () => {
  rawTextInput.value = '';
  updateStats();
  rawTextInput.focus();
});

btnStartReading.addEventListener('click', async () => {
  const text = rawTextInput.value.trim();
  if (!text) {
    alert('Por favor, cole ou digite um texto para ouvir.');
    rawTextInput.focus();
    return;
  }

  btnStartReading.disabled = true;
  btnStartReading.innerHTML = 'Processando texto...';

  try {
    const res = await fetch('/api/process-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, title: 'Texto Copiado' })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Erro ao processar.');

    state.paragraphs = data.pages[0].paragraphs;
    state.currentIndex = -1;

    // Alterna para tela de leitura
    inputSection.style.display = 'none';
    readerSection.style.display = 'flex';
    playerBar.style.display = 'block';
    btnExportModal.style.display = 'inline-flex';
    btnEditNewText.style.display = 'inline-flex';

    docStats.textContent = `${data.totalWords.toLocaleString()} palavras • ~${data.estimatedMinutes} min de áudio em voz humana`;

    renderParagraphs();
    startReading(0);

  } catch (err) {
    alert(`Erro: ${err.message}`);
  } finally {
    btnStartReading.disabled = false;
    btnStartReading.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      Iniciar Leitura com Voz Humana
    `;
  }
});

function backToEditor() {
  stopPlayback();
  readerSection.style.display = 'none';
  playerBar.style.display = 'none';
  btnExportModal.style.display = 'none';
  btnEditNewText.style.display = 'none';
  inputSection.style.display = 'flex';
  rawTextInput.focus();
}

btnBackToEdit.addEventListener('click', backToEditor);
btnEditNewText.addEventListener('click', backToEditor);

// --------------------------------------------------------------------------
// Renderização e Reprodução com Destaque em Amarelo Claro
// --------------------------------------------------------------------------
function renderParagraphs() {
  textDisplay.innerHTML = '';
  state.paragraphs.forEach((pText, idx) => {
    const pEl = document.createElement('div');
    pEl.className = 'reader-paragraph';
    pEl.id = `para-${idx}`;
    pEl.dataset.index = idx;
    pEl.innerHTML = buildParagraphWordsHtml(pText);

    pEl.addEventListener('click', () => {
      startReading(idx);
    });

    textDisplay.appendChild(pEl);
  });
}

function buildParagraphWordsHtml(text) {
  const tokens = text.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+|\s+/gu) || [text];
  let wordIdx = 0;

  return tokens.map(token => {
    if (/[\p{L}\p{N}_]+/u.test(token)) {
      const span = `<span class="word-span" data-word-idx="${wordIdx}">${escapeHtml(token)}</span>`;
      wordIdx++;
      return span;
    }
    return escapeHtml(token);
  }).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function fetchTtsData(text) {
  const voice = voiceSelect.value;
  const rate = speedSelect.value;
  const pitch = pitchSelect.value;
  const cacheKey = `${text}_${voice}_${rate}_${pitch}`;

  if (state.audioCache.has(cacheKey)) {
    return state.audioCache.get(cacheKey);
  }

  const response = await fetch('/api/tts/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, rate, pitch })
  });

  if (!response.ok) throw new Error('Falha na síntese de voz.');

  const data = await response.json();
  state.audioCache.set(cacheKey, data);
  return data;
}

async function preloadNext() {
  const nextIdx = state.currentIndex + 1;
  if (nextIdx < state.paragraphs.length) {
    try {
      fetchTtsData(state.paragraphs[nextIdx]);
    } catch (e) {}
  }
}

async function startReading(index) {
  if (index < 0 || index >= state.paragraphs.length) return;

  stopAudioOnly();

  state.currentIndex = index;
  state.isPlaying = true;
  state.isPaused = false;
  state.lastHighlightedIdx = -1;

  updatePlayerUI();
  updateActiveHighlight();

  const text = state.paragraphs[index];
  playerStatusLabel.textContent = `Lendo Parágrafo ${index + 1} de ${state.paragraphs.length}`;
  playerSnippet.textContent = text;
  playerPulse.classList.add('playing');

  try {
    const ttsData = await fetchTtsData(text);
    if (state.currentIndex !== index) return;

    state.currentBoundaries = ttsData.boundaries || [];
    state.currentAudio = new Audio(ttsData.audioBase64 || ttsData.audioUrl);

    state.currentAudio.addEventListener('timeupdate', () => {
      if (state.currentAudio && state.currentAudio.duration) {
        const cur = state.currentAudio.currentTime;
        const dur = state.currentAudio.duration;
        const pct = (cur / dur) * 100;
        progressBarFill.style.width = `${pct}%`;
        playerCurrentTime.textContent = formatTime(cur);
        playerTotalTime.textContent = formatTime(dur);
      }
    });

    state.currentAudio.addEventListener('ended', onEnded);
    await state.currentAudio.play();
    updatePlayerUI();

    startWordHighlightTracker();
    preloadNext();

  } catch (err) {
    console.error('Erro de reprodução:', err);
    playerStatusLabel.textContent = 'Erro de síntese';
    playerPulse.classList.remove('playing');
    state.isPlaying = false;
    updatePlayerUI();
  }
}

function startWordHighlightTracker() {
  if (state.animFrameId) cancelAnimationFrame(state.animFrameId);

  function checkWordSync() {
    if (!state.isPlaying || !state.currentAudio) return;

    const t = state.currentAudio.currentTime;
    const boundaries = state.currentBoundaries;

    if (boundaries && boundaries.length > 0) {
      let activeWordIdx = -1;

      for (let i = 0; i < boundaries.length; i++) {
        const b = boundaries[i];
        if (t >= b.offsetSec && t <= (b.offsetSec + b.durationSec + 0.06)) {
          activeWordIdx = i;
          break;
        }
      }

      if (activeWordIdx !== state.lastHighlightedIdx) {
        state.lastHighlightedIdx = activeWordIdx;

        const currentParaEl = document.getElementById(`para-${state.currentIndex}`);
        if (currentParaEl) {
          const prevHighlighted = currentParaEl.querySelector('.word-span.highlight-yellow');
          if (prevHighlighted) prevHighlighted.classList.remove('highlight-yellow');

          if (activeWordIdx >= 0) {
            const wordSpan = currentParaEl.querySelector(`.word-span[data-word-idx="${activeWordIdx}"]`);
            if (wordSpan) {
              wordSpan.classList.add('highlight-yellow');
            }
          }
        }
      }
    }

    if (state.isPlaying && !state.isPaused) {
      state.animFrameId = requestAnimationFrame(checkWordSync);
    }
  }

  state.animFrameId = requestAnimationFrame(checkWordSync);
}

function clearWordHighlight() {
  if (state.animFrameId) {
    cancelAnimationFrame(state.animFrameId);
    state.animFrameId = null;
  }
  document.querySelectorAll('.word-span.highlight-yellow').forEach(el => {
    el.classList.remove('highlight-yellow');
  });
}

function onEnded() {
  clearWordHighlight();
  const nextIdx = state.currentIndex + 1;
  if (nextIdx < state.paragraphs.length) {
    let pauseMs = 500;
    if (state.narratorMode === 'aula') pauseMs = 550;
    else if (state.narratorMode === 'livro') pauseMs = 450;
    else if (state.narratorMode === 'conversa') pauseMs = 350;
    else if (state.narratorMode === 'rapido') pauseMs = 200;

    playerStatusLabel.textContent = `Pausa didática (${(pauseMs / 1000).toFixed(1)}s)...`;

    if (state.paragraphTransitionTimeout) clearTimeout(state.paragraphTransitionTimeout);
    state.paragraphTransitionTimeout = setTimeout(() => {
      if (state.isPlaying) {
        startReading(nextIdx);
      }
    }, pauseMs);
  } else {
    stopPlayback();
    playerStatusLabel.textContent = 'Leitura Concluída';
    playerSnippet.textContent = 'Fim do texto.';
  }
}

function stopAudioOnly() {
  if (state.paragraphTransitionTimeout) {
    clearTimeout(state.paragraphTransitionTimeout);
    state.paragraphTransitionTimeout = null;
  }
  clearWordHighlight();
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
    state.currentAudio.removeEventListener('ended', onEnded);
    state.currentAudio = null;
  }
  progressBarFill.style.width = '0%';
  playerCurrentTime.textContent = '0:00';
  playerTotalTime.textContent = '0:00';
}

function stopPlayback() {
  stopAudioOnly();
  state.isPlaying = false;
  state.isPaused = false;
  state.currentIndex = -1;
  playerPulse.classList.remove('playing');
  playerStatusLabel.textContent = 'Leitura Parada';
  updatePlayerUI();
  updateActiveHighlight();
}

function togglePlayPause() {
  if (state.paragraphs.length === 0) return;

  if (state.isPlaying && !state.isPaused) {
    if (state.currentAudio) state.currentAudio.pause();
    state.isPaused = true;
    playerPulse.classList.remove('playing');
    playerStatusLabel.textContent = 'Pausado';
    updatePlayerUI();
  } else if (state.isPlaying && state.isPaused) {
    if (state.currentAudio) state.currentAudio.play();
    state.isPaused = false;
    playerPulse.classList.add('playing');
    playerStatusLabel.textContent = `Lendo Parágrafo ${state.currentIndex + 1}`;
    updatePlayerUI();
  } else {
    startReading(state.currentIndex >= 0 ? state.currentIndex : 0);
  }
}

function restartCurrent() {
  if (state.currentIndex >= 0) startReading(state.currentIndex);
}

function next() {
  if (state.currentIndex + 1 < state.paragraphs.length) {
    startReading(state.currentIndex + 1);
  }
}

function prev() {
  if (state.currentIndex > 0) {
    startReading(state.currentIndex - 1);
  }
}

function updateActiveHighlight() {
  document.querySelectorAll('.reader-paragraph').forEach((el, idx) => {
    if (idx === state.currentIndex && state.isPlaying) {
      el.classList.add('active');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      el.classList.remove('active');
    }
  });
}

function updatePlayerUI() {
  if (state.isPlaying && !state.isPaused) {
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
    btnPlayerPlay.title = 'Pausar Leitura';
  } else {
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    btnPlayerPlay.title = 'Iniciar Leitura';
  }
}

progressBarBg.addEventListener('click', (e) => {
  if (!state.currentAudio || !state.currentAudio.duration) return;
  const rect = progressBarBg.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));
  state.currentAudio.currentTime = pct * state.currentAudio.duration;
});

btnPlayerPlay.addEventListener('click', togglePlayPause);
btnPlayerStop.addEventListener('click', stopPlayback);
btnPlayerNext.addEventListener('click', next);
btnPlayerPrev.addEventListener('click', prev);

// --------------------------------------------------------------------------
// Exportação para MP3
// --------------------------------------------------------------------------
btnExportModal.addEventListener('click', () => {
  if (state.paragraphs.length === 0) return;
  exportModal.style.display = 'flex';
  exportProgressBox.style.display = 'none';
  exportDownloadBox.style.display = 'none';
  modalFooter.style.display = 'flex';
  btnStartExport.disabled = false;
});

function closeModal() {
  exportModal.style.display = 'none';
  if (state.exportPollInterval) {
    clearInterval(state.exportPollInterval);
    state.exportPollInterval = null;
  }
}

btnCloseModal.addEventListener('click', closeModal);
btnCancelExport.addEventListener('click', closeModal);

btnStartExport.addEventListener('click', async () => {
  exportProgressBox.style.display = 'block';
  modalFooter.style.display = 'none';
  exportProgressBarFill.style.width = '0%';
  exportPercentText.textContent = '0%';
  exportDetailText.textContent = `Gerando MP3 de ${state.paragraphs.length} parágrafos...`;

  try {
    const res = await fetch('/api/audiobook/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: state.paragraphs,
        voice: voiceSelect.value,
        rate: speedSelect.value,
        pitch: pitchSelect.value,
        title: 'texto_copiado'
      })
    });

    const job = await res.json();
    if (!job.success) throw new Error(job.error || 'Erro ao gerar MP3.');

    state.currentExportJobId = job.jobId;
    state.exportPollInterval = setInterval(pollExportProgress, 800);

  } catch (err) {
    alert(`Erro: ${err.message}`);
    exportProgressBox.style.display = 'none';
    modalFooter.style.display = 'flex';
  }
});

async function pollExportProgress() {
  if (!state.currentExportJobId) return;

  try {
    const res = await fetch(`/api/audiobook/status/${state.currentExportJobId}`);
    const data = await res.json();

    if (data.status === 'processing') {
      exportProgressBarFill.style.width = `${data.progress}%`;
      exportPercentText.textContent = `${data.progress}%`;
      exportDetailText.textContent = `Sintetizando áudio: bloco ${data.current} de ${data.total}...`;
    } else if (data.status === 'completed') {
      clearInterval(state.exportPollInterval);
      state.exportPollInterval = null;
      exportProgressBarFill.style.width = '100%';
      exportPercentText.textContent = '100%';

      setTimeout(() => {
        exportProgressBox.style.display = 'none';
        exportDownloadBox.style.display = 'block';
        btnDownloadMp3.href = data.downloadUrl;
        btnDownloadMp3.setAttribute('download', 'voxlivre_texto.mp3');
      }, 400);

    } else if (data.status === 'error') {
      clearInterval(state.exportPollInterval);
      state.exportPollInterval = null;
      alert(`Erro: ${data.error}`);
      exportProgressBox.style.display = 'none';
      modalFooter.style.display = 'flex';
    }
  } catch (e) {
    console.error('Erro ao consultar progresso:', e);
  }
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function handleKeyboardShortcuts(e) {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayPause();
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    next();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    prev();
  } else if (e.code === 'Escape') {
    if (exportModal.style.display === 'flex') {
      closeModal();
    } else {
      stopPlayback();
    }
  }
}

// --------------------------------------------------------------------------
// Suporte a PWA & Instalação Nativa no PC / Android
// --------------------------------------------------------------------------
let deferredInstallPrompt = null;
const btnInstallApp = document.getElementById('btnInstallApp');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Registro do Service Worker falhou:', err);
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (btnInstallApp) {
    btnInstallApp.style.display = 'inline-flex';
  }
});

if (btnInstallApp) {
  btnInstallApp.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        btnInstallApp.style.display = 'none';
      }
      deferredInstallPrompt = null;
    } else {
      alert('Para instalar no celular Android: toque no menu (⋮) do Chrome e selecione "Instalar aplicativo" ou "Adicionar à tela inicial".\n\nNo PC: clique no ícone de instalar aplicativo na barra de endereços do Chrome ou Edge.');
    }
  });
}

window.addEventListener('appinstalled', () => {
  if (btnInstallApp) btnInstallApp.style.display = 'none';
  deferredInstallPrompt = null;
});
