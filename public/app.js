// ==========================================================================
// VoxLivre - Leitor Neural de PDF com Renderização de Página & Destaque Amarelo
// ==========================================================================

// Configuração do Worker do PDF.js
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Estado da Aplicação
const state = {
  doc: null,
  pdfDoc: null,              // Instância do documento PDF.js
  pdfRenderTask: null,       // Tarefa de renderização ativa no Canvas
  pdfTextLayerTask: null,    // Tarefa de renderização ativa na Camada de Texto
  pdfZoom: 1.0,              // Escala de zoom do canvas
  currentPageIndex: 0,
  currentParagraphIndex: -1,
  currentBoundaries: [],     // Metadados de palavras (WordBoundary)
  lastHighlightedIdx: -1,    // Índice da palavra ativa
  pdfCurrentPageWords: [],   // Tokens de palavras na folha do PDF atual: [{ el, text, clean, spanIdx }]
  pdfParagraphWordMap: [],   // Mapeamento [pIdx][wIdx] -> índice em pdfCurrentPageWords
  lastPdfWordEl: null,       // Elemento da palavra ativa na folha do PDF
  narratorMode: 'aula',      // 'aula' (professor) | 'livro' (audiolivro) | 'conversa' | 'rapido'
  paragraphTransitionTimeout: null,
  isPlaying: false,
  isPaused: false,
  autoAdvance: true,
  currentAudio: null,
  audioCache: new Map(),     // cacheKey -> { audioUrl, boundaries }
  currentExportJobId: null,
  exportPollInterval: null,
  animFrameId: null
};

// Elementos DOM
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const uploadProgress = document.getElementById('uploadProgress');
const uploadStatusText = document.getElementById('uploadStatusText');

const readerSection = document.getElementById('readerSection');
const readerSplitLayout = document.getElementById('readerSplitLayout');
const docTitle = document.getElementById('docTitle');
const docStats = document.getElementById('docStats');
const textDisplay = document.getElementById('textDisplay');
const inputPage = document.getElementById('inputPage');
const labelTotalPages = document.getElementById('labelTotalPages');
const btnPrevPage = document.getElementById('btnPrevPage');
const btnNextPage = document.getElementById('btnNextPage');
const btnReadFullPage = document.getElementById('btnReadFullPage');
const btnChangePdf = document.getElementById('btnChangePdf');

// Controles de Visualização e Canvas do PDF
const btnViewSplit = document.getElementById('btnViewSplit');
const btnViewPdfOnly = document.getElementById('btnViewPdfOnly');
const btnViewTextOnly = document.getElementById('btnViewTextOnly');
const pdfCanvas = document.getElementById('pdfCanvas');
const pdfPageContainer = document.getElementById('pdfPageContainer');
const pdfTextLayer = document.getElementById('pdfTextLayer');
const canvasLoading = document.getElementById('canvasLoading');
const labelPdfPageIndicator = document.getElementById('labelPdfPageIndicator');
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const zoomLevelLabel = document.getElementById('zoomLevelLabel');
const splitResizer = document.getElementById('splitResizer');
const pdfCanvasWrapper = document.getElementById('pdfCanvasWrapper');

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
const rangeInputs = document.getElementById('rangeInputs');
const exportStartPage = document.getElementById('exportStartPage');
const exportEndPage = document.getElementById('exportEndPage');
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
window.addEventListener('DOMContentLoaded', () => {
  const savedMode = localStorage.getItem('voxlivre_narrator_mode');
  if (savedMode && narratorModeSelect && narratorModeSelect.querySelector(`option[value="${savedMode}"]`)) {
    narratorModeSelect.value = savedMode;
    state.narratorMode = savedMode;
  }

  const savedVoice = localStorage.getItem('vozlivre_voice');
  const savedSpeed = localStorage.getItem('vozlivre_speed');
  const savedPitch = localStorage.getItem('vozlivre_pitch');
  const savedSplit = localStorage.getItem('voxlivre_split_ratio');

  if (savedVoice && voiceSelect.querySelector(`option[value="${savedVoice}"]`)) {
    voiceSelect.value = savedVoice;
  }
  if (savedSpeed && speedSelect.querySelector(`option[value="${savedSpeed}"]`)) {
    speedSelect.value = savedSpeed;
  }
  if (savedPitch && pitchSelect.querySelector(`option[value="${savedPitch}"]`)) {
    pitchSelect.value = savedPitch;
  }
  if (savedSplit && readerSplitLayout) {
    readerSplitLayout.style.setProperty('--split-left', `${savedSplit}%`);
  }

  const savedViewMode = localStorage.getItem('voxlivre_view_mode');
  if (savedViewMode && ['split', 'pdf', 'text'].includes(savedViewMode)) {
    setViewMode(savedViewMode);
  }

  initSplitResizer();
  document.addEventListener('keydown', handleKeyboardShortcuts);
});

function applyNarratorMode(mode, userInitiated = true) {
  state.narratorMode = mode;
  localStorage.setItem('voxlivre_narrator_mode', mode);

  if (userInitiated) {
    if (mode === 'aula') {
      // Professor (Aula Didática): cadência pausada, tom acolhedor e voz masculina encorpada
      speedSelect.value = '-10%'; // 0.90x
      pitchSelect.value = '-2Hz'; // Caloroso
      if (voiceSelect.querySelector('option[value="pt-BR-AntonioNeural"]')) {
        voiceSelect.value = 'pt-BR-AntonioNeural';
      }
    } else if (mode === 'livro') {
      // Contador de Histórias (Audiolivro): expressivo, literatura, voz feminina fluida
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
    if (state.isPlaying) restartCurrentParagraph();
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
  if (state.isPlaying) restartCurrentParagraph();
});

speedSelect.addEventListener('change', () => {
  localStorage.setItem('vozlivre_speed', speedSelect.value);
  state.audioCache.clear();
  if (state.isPlaying) restartCurrentParagraph();
});

pitchSelect.addEventListener('change', () => {
  localStorage.setItem('vozlivre_pitch', pitchSelect.value);
  state.audioCache.clear();
  if (state.isPlaying) restartCurrentParagraph();
});

chkAutoAdvance.addEventListener('change', (e) => {
  state.autoAdvance = e.target.checked;
});

// --------------------------------------------------------------------------
// Redimensionamento das Abas com o Mouse (Split Resizer)
// --------------------------------------------------------------------------
let isResizing = false;
let resizeDebounce = null;

function initSplitResizer() {
  if (!splitResizer || !readerSplitLayout) return;

  function startResize(e) {
    if (!readerSplitLayout.classList.contains('mode-split')) return;
    isResizing = true;
    splitResizer.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function doResize(clientX) {
    if (!isResizing || !readerSplitLayout) return;
    const rect = readerSplitLayout.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const totalWidth = rect.width;

    if (totalWidth <= 0) return;

    // Limita a largura entre 20% e 80% para evitar travamento
    const pct = Math.min(Math.max((offsetX / totalWidth) * 100, 20), 80);
    readerSplitLayout.style.setProperty('--split-left', `${pct}%`);
    localStorage.setItem('voxlivre_split_ratio', pct);

    if (resizeDebounce) clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      if (state.pdfDoc) {
        renderPdfCanvasPage(state.currentPageIndex + 1);
      }
    }, 80);
  }

  function stopResize() {
    if (isResizing) {
      isResizing = false;
      splitResizer.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (state.pdfDoc) {
        renderPdfCanvasPage(state.currentPageIndex + 1);
      }
    }
  }

  // Eventos de Mouse
  splitResizer.addEventListener('mousedown', startResize);
  document.addEventListener('mousemove', (e) => {
    if (isResizing) doResize(e.clientX);
  });
  document.addEventListener('mouseup', stopResize);

  // Eventos de Touch
  splitResizer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) startResize(e);
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (isResizing && e.touches.length === 1) {
      doResize(e.touches[0].clientX);
    }
  }, { passive: true });

  document.addEventListener('touchend', stopResize);
}

// --------------------------------------------------------------------------
// Alternância de Modos de Visualização (Lado a Lado, Folha PDF, Texto Limpo)
// --------------------------------------------------------------------------
function setViewMode(mode) {
  if (!readerSplitLayout) return;
  readerSplitLayout.classList.remove('mode-split', 'mode-pdf-only', 'mode-text-only');
  btnViewSplit.classList.remove('active');
  btnViewPdfOnly.classList.remove('active');
  btnViewTextOnly.classList.remove('active');

  if (mode === 'split') {
    readerSplitLayout.classList.add('mode-split');
    btnViewSplit.classList.add('active');
  } else if (mode === 'pdf') {
    readerSplitLayout.classList.add('mode-pdf-only');
    btnViewPdfOnly.classList.add('active');
  } else if (mode === 'text') {
    readerSplitLayout.classList.add('mode-text-only');
    btnViewTextOnly.classList.add('active');
  }

  localStorage.setItem('voxlivre_view_mode', mode);

  if (state.pdfDoc && (mode === 'split' || mode === 'pdf')) {
    setTimeout(() => renderPdfCanvasPage(state.currentPageIndex + 1), 60);
  }
}

btnViewSplit.addEventListener('click', () => setViewMode('split'));
btnViewPdfOnly.addEventListener('click', () => setViewMode('pdf'));
btnViewTextOnly.addEventListener('click', () => setViewMode('text'));

// Controles de Zoom do PDF
btnZoomIn.addEventListener('click', () => {
  if (state.pdfZoom < 2.5) {
    state.pdfZoom += 0.2;
    zoomLevelLabel.textContent = `${Math.round(state.pdfZoom * 100)}%`;
    renderPdfCanvasPage(state.currentPageIndex + 1);
  }
});

btnZoomOut.addEventListener('click', () => {
  if (state.pdfZoom > 0.5) {
    state.pdfZoom -= 0.2;
    zoomLevelLabel.textContent = `${Math.round(state.pdfZoom * 100)}%`;
    renderPdfCanvasPage(state.currentPageIndex + 1);
  }
});

// --------------------------------------------------------------------------
// Renderização da Folha Real do PDF com PDF.js & Camada de Texto Sincronizada
// --------------------------------------------------------------------------
async function renderPdfCanvasPage(pageNum) {
  if (!state.pdfDoc || !pdfCanvas) return;

  // Cancela tarefas anteriores em andamento para evitar colisões
  if (state.pdfRenderTask) {
    try { state.pdfRenderTask.cancel(); } catch (e) {}
    state.pdfRenderTask = null;
  }
  if (state.pdfTextLayerTask) {
    try { state.pdfTextLayerTask.cancel(); } catch (e) {}
    state.pdfTextLayerTask = null;
  }

  // Limpa palavra ativa anterior no PDF
  if (state.lastPdfWordEl) {
    state.lastPdfWordEl.classList.remove('highlight-yellow');
    state.lastPdfWordEl = null;
  }
  state.pdfCurrentPageWords = [];
  state.pdfParagraphWordMap = [];

  canvasLoading.style.display = 'flex';
  labelPdfPageIndicator.textContent = `Pág. ${pageNum} de ${state.doc.totalPages}`;

  try {
    const page = await state.pdfDoc.getPage(pageNum);
    const wrapperWidth = (pdfCanvasWrapper ? pdfCanvasWrapper.clientWidth : 500) - 40;
    const baseViewport = page.getViewport({ scale: 1.0 });

    // Calcula proporção automática para preencher a largura da aba
    const fitScale = (wrapperWidth / baseViewport.width) * state.pdfZoom;
    const finalScale = Math.max(0.4, fitScale);

    const dpr = window.devicePixelRatio || 1;
    const canvasViewport = page.getViewport({ scale: finalScale * dpr });
    const textViewport = page.getViewport({ scale: finalScale });
    const ctx = pdfCanvas.getContext('2d');

    const cssWidth = Math.round(textViewport.width);
    const cssHeight = Math.round(textViewport.height);

    pdfCanvas.width = canvasViewport.width;
    pdfCanvas.height = canvasViewport.height;
    pdfCanvas.style.width = `${cssWidth}px`;
    pdfCanvas.style.height = `${cssHeight}px`;

    if (pdfPageContainer) {
      pdfPageContainer.style.width = `${cssWidth}px`;
      pdfPageContainer.style.height = `${cssHeight}px`;
    }

    if (pdfTextLayer) {
      pdfTextLayer.style.width = `${cssWidth}px`;
      pdfTextLayer.style.height = `${cssHeight}px`;
      pdfTextLayer.style.setProperty('--scale-factor', `${textViewport.scale}`);
      pdfTextLayer.innerHTML = '';
    }

    // 1. Renderiza os pixels nítidos da folha no Canvas
    const renderContext = {
      canvasContext: ctx,
      viewport: canvasViewport
    };

    const canvasTask = page.render(renderContext);
    state.pdfRenderTask = canvasTask;
    await canvasTask.promise;
    state.pdfRenderTask = null;

    // 2. Renderiza a camada de texto transparente sobre a folha do PDF
    if (pdfTextLayer && window.pdfjsLib && typeof pdfjsLib.renderTextLayer === 'function') {
      try {
        const textContent = await page.getTextContent();
        const textLayerTask = pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: pdfTextLayer,
          viewport: textViewport
        });
        state.pdfTextLayerTask = textLayerTask;
        await textLayerTask.promise;
        state.pdfTextLayerTask = null;

        // 3. Prepara palavras interativas e mapeia com os parágrafos do documento
        state.pdfCurrentPageWords = preparePdfWordsInTextLayer(pdfTextLayer);
        syncPdfPageWordMapping();

        // Se houver leitura ativa no momento, atualiza destaque visual no PDF
        if (state.isPlaying && state.currentParagraphIndex >= 0) {
          updateActiveHighlight();
        }
      } catch (tlErr) {
        if (tlErr?.name !== 'RenderingCancelledException') {
          console.warn('Aviso na camada de texto do PDF:', tlErr);
        }
      }
    }
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') {
      return;
    }
    console.error('Erro ao renderizar folha do PDF:', err);
  } finally {
    if (!state.pdfRenderTask) {
      canvasLoading.style.display = 'none';
    }
  }
}

// --------------------------------------------------------------------------
// Mapeamento e Interatividade das Palavras na Folha do PDF
// --------------------------------------------------------------------------
function cleanWordForMatch(str) {
  if (!str) return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}

function preparePdfWordsInTextLayer(container) {
  if (!container) return [];
  const spans = Array.from(container.querySelectorAll('span'));
  const wordTokens = [];

  spans.forEach((span, spanIdx) => {
    const rawText = span.textContent;
    if (!rawText || !rawText.trim()) return;

    const tokens = rawText.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+|\s+/gu) || [rawText];
    span.textContent = '';

    tokens.forEach(tok => {
      if (/[\p{L}\p{N}_]+/u.test(tok)) {
        const wSpan = document.createElement('span');
        wSpan.className = 'pdf-word-token';
        wSpan.textContent = tok;
        const clean = cleanWordForMatch(tok);
        wSpan.dataset.cleanWord = clean;
        wSpan.dataset.pdfWordIdx = wordTokens.length;

        // Clique na palavra do PDF inicia a leitura a partir daquele ponto
        wSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          const pIdx = parseInt(wSpan.dataset.paraIdx, 10);
          if (!isNaN(pIdx) && pIdx >= 0) {
            startReadingParagraph(pIdx);
          }
        });

        span.appendChild(wSpan);

        wordTokens.push({
          el: wSpan,
          parentSpan: span,
          text: tok,
          clean: clean,
          spanIdx: spanIdx
        });
      } else {
        span.appendChild(document.createTextNode(tok));
      }
    });
  });

  return wordTokens;
}

function syncPdfPageWordMapping() {
  const page = state.doc?.pages[state.currentPageIndex];
  if (!page || !page.paragraphs || state.pdfCurrentPageWords.length === 0) {
    state.pdfParagraphWordMap = [];
    return;
  }

  const pdfWords = state.pdfCurrentPageWords;
  const map = [];
  let pdfCursor = 0;

  for (let pIdx = 0; pIdx < page.paragraphs.length; pIdx++) {
    const pText = page.paragraphs[pIdx];
    const pTokens = pText.match(/[\p{L}\p{N}_]+/gu) || [];
    const pCleanList = pTokens.map(t => cleanWordForMatch(t));
    const paraIndices = [];

    if (pCleanList.length === 0) {
      map.push(paraIndices);
      continue;
    }

    // Busca o ponto de início do parágrafo na folha do PDF
    let bestStart = -1;
    const maxLookahead = Math.min(pdfWords.length, pdfCursor + 60);

    for (let i = pdfCursor; i < maxLookahead; i++) {
      let matches = 0;
      for (let k = 0; k < Math.min(3, pCleanList.length); k++) {
        if (i + k < pdfWords.length && pdfWords[i + k].clean === pCleanList[k]) {
          matches++;
        }
      }
      if (matches >= Math.min(2, pCleanList.length)) {
        bestStart = i;
        break;
      }
    }

    if (bestStart === -1) {
      for (let i = pdfCursor; i < Math.min(pdfWords.length, pdfCursor + 30); i++) {
        if (pdfWords[i].clean === pCleanList[0]) {
          bestStart = i;
          break;
        }
      }
    }

    if (bestStart === -1) {
      bestStart = Math.min(pdfCursor, Math.max(0, pdfWords.length - 1));
    }

    let currPdfIdx = bestStart;
    for (let w = 0; w < pCleanList.length; w++) {
      const targetClean = pCleanList[w];
      let matchedIdx = currPdfIdx;

      for (let offset = 0; offset <= 3; offset++) {
        if (currPdfIdx + offset < pdfWords.length && pdfWords[currPdfIdx + offset].clean === targetClean) {
          matchedIdx = currPdfIdx + offset;
          break;
        }
      }

      paraIndices.push(matchedIdx);
      if (pdfWords[matchedIdx]?.el) {
        pdfWords[matchedIdx].el.dataset.paraIdx = pIdx;
      }
      currPdfIdx = matchedIdx + 1;
    }

    pdfCursor = currPdfIdx;
    map.push(paraIndices);
  }

  state.pdfParagraphWordMap = map;
}

function scrollPdfWrapperToElement(el) {
  if (!el || !pdfCanvasWrapper) return;
  const wrapperRect = pdfCanvasWrapper.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();

  const margin = 70;
  if (elRect.top < wrapperRect.top + margin) {
    pdfCanvasWrapper.scrollBy({
      top: elRect.top - wrapperRect.top - margin,
      behavior: 'smooth'
    });
  } else if (elRect.bottom > wrapperRect.bottom - margin) {
    pdfCanvasWrapper.scrollBy({
      top: elRect.bottom - wrapperRect.bottom + margin,
      behavior: 'smooth'
    });
  }
}

// --------------------------------------------------------------------------
// Upload e Processamento do PDF
// --------------------------------------------------------------------------
['dragenter', 'dragover'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('drag-over');
  });
});

dropzone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files && files.length > 0) {
    if (files[0].type === 'application/pdf' || files[0].name.toLowerCase().endsWith('.pdf')) {
      handlePdfUpload(files[0]);
    } else {
      alert('Por favor, envie um arquivo PDF.');
    }
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handlePdfUpload(e.target.files[0]);
  }
});

btnChangePdf.addEventListener('click', () => {
  stopPlayback();
  state.doc = null;
  state.pdfDoc = null;
  state.audioCache.clear();
  readerSection.style.display = 'none';
  playerBar.style.display = 'none';
  btnExportModal.style.display = 'none';
  btnChangePdf.style.display = 'none';
  uploadProgress.style.display = 'none';
  dropzone.style.display = 'block';
  uploadSection.style.display = 'flex';
  fileInput.value = '';
});

async function handlePdfUpload(file) {
  dropzone.style.display = 'none';
  uploadProgress.style.display = 'block';
  uploadStatusText.textContent = `Carregando "${file.name}"...`;

  try {
    // 1. Carrega no visualizador PDF.js no navegador
    if (window.pdfjsLib) {
      const arrayBuffer = await file.arrayBuffer();
      state.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    }

    // 2. Extrai texto e estatísticas no servidor backend
    const formData = new FormData();
    formData.append('pdf', file);

    const response = await fetch('/api/upload-pdf', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao processar PDF.');

    state.doc = data;
    state.currentPageIndex = 0;
    state.currentParagraphIndex = -1;

    // Atualiza interface
    uploadSection.style.display = 'none';
    readerSection.style.display = 'flex';
    playerBar.style.display = 'block';
    btnExportModal.style.display = 'inline-flex';
    btnChangePdf.style.display = 'inline-flex';

    docTitle.textContent = data.title || file.name;
    docStats.textContent = `${data.totalPages} ${data.totalPages === 1 ? 'página' : 'páginas'} • ${data.totalWords.toLocaleString()} palavras • ~${data.estimatedMinutes} min de áudio em voz humana`;

    inputPage.max = data.totalPages;
    exportStartPage.max = data.totalPages;
    exportEndPage.max = data.totalPages;
    exportEndPage.value = data.totalPages;
    labelTotalPages.textContent = `de ${data.totalPages}`;

    // Renderiza a folha do PDF e os parágrafos com palavras interativas
    renderCurrentPage();

  } catch (error) {
    console.error('Erro de upload:', error);
    alert(`Erro ao ler PDF: ${error.message}`);
    uploadProgress.style.display = 'none';
    dropzone.style.display = 'block';
  }
}

// --------------------------------------------------------------------------
// Renderização das Páginas, Folha PDF e Palavras
// --------------------------------------------------------------------------
function renderCurrentPage() {
  if (!state.doc || !state.doc.pages || state.doc.pages.length === 0) return;

  const page = state.doc.pages[state.currentPageIndex];
  inputPage.value = state.currentPageIndex + 1;

  btnPrevPage.disabled = state.currentPageIndex === 0;
  btnNextPage.disabled = state.currentPageIndex === state.doc.totalPages - 1;

  // 1. Renderiza a folha do PDF no Canvas
  renderPdfCanvasPage(state.currentPageIndex + 1);

  // 2. Renderiza o texto interativo com palavras marcadas para destaque amarelo
  textDisplay.innerHTML = '';

  if (!page.paragraphs || page.paragraphs.length === 0) {
    textDisplay.innerHTML = `<div class="empty-page-msg">Esta página não contém texto legível (pode ser uma imagem, capa ou diagrama). Você pode visualizá-la na folha do PDF ao lado.</div>`;
    return;
  }

  page.paragraphs.forEach((pText, pIdx) => {
    const pEl = document.createElement('div');
    pEl.className = 'reader-paragraph';
    pEl.id = `para-${pIdx}`;
    pEl.dataset.index = pIdx;

    // Quebra o parágrafo em palavras para o destaque amarelo em tempo real
    pEl.innerHTML = buildParagraphWordsHtml(pText);

    pEl.addEventListener('click', () => {
      startReadingParagraph(pIdx);
    });

    textDisplay.appendChild(pEl);
  });

  updateActiveHighlight();
}

// Envolve cada palavra do parágrafo em uma tag <span> com índice para destaque
function buildParagraphWordsHtml(text) {
  // Regex para capturar palavras preservando pontuação e espaços
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

// Navegação de páginas
btnPrevPage.addEventListener('click', () => {
  if (state.currentPageIndex > 0) {
    changePage(state.currentPageIndex - 1);
  }
});

btnNextPage.addEventListener('click', () => {
  if (state.currentPageIndex < state.doc.totalPages - 1) {
    changePage(state.currentPageIndex + 1);
  }
});

inputPage.addEventListener('change', (e) => {
  const targetPage = parseInt(e.target.value, 10) - 1;
  if (targetPage >= 0 && targetPage < state.doc.totalPages) {
    changePage(targetPage);
  } else {
    inputPage.value = state.currentPageIndex + 1;
  }
});

btnReadFullPage.addEventListener('click', () => {
  startReadingParagraph(0);
});

function changePage(newPageIndex, autoStartFirstParagraph = false) {
  const wasPlaying = state.isPlaying;
  stopPlayback();
  state.currentPageIndex = newPageIndex;
  state.currentParagraphIndex = -1;
  renderCurrentPage();

  textDisplay.scrollTo({ top: 0, behavior: 'smooth' });

  if (autoStartFirstParagraph || wasPlaying) {
    startReadingParagraph(0);
  }
}

// --------------------------------------------------------------------------
// Motor de Síntese de Voz com Destaque Amarelo Claro em Tempo Real
// --------------------------------------------------------------------------
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

async function preloadNextParagraph() {
  const page = state.doc?.pages[state.currentPageIndex];
  if (!page) return;

  const nextIdx = state.currentParagraphIndex + 1;
  if (nextIdx < page.paragraphs.length) {
    const nextText = page.paragraphs[nextIdx];
    try {
      fetchTtsData(nextText);
    } catch (e) {}
  }
}

async function startReadingParagraph(index) {
  const page = state.doc?.pages[state.currentPageIndex];
  if (!page || !page.paragraphs || index < 0 || index >= page.paragraphs.length) return;

  stopAudioOnly();

  state.currentParagraphIndex = index;
  state.isPlaying = true;
  state.isPaused = false;
  state.lastHighlightedIdx = -1;

  updatePlayerUI();
  updateActiveHighlight();

  const text = page.paragraphs[index];
  playerStatusLabel.textContent = `Lendo Pág. ${state.currentPageIndex + 1} • Parágrafo ${index + 1} de ${page.paragraphs.length}`;
  playerSnippet.textContent = text;
  playerPulse.classList.add('playing');

  try {
    const ttsData = await fetchTtsData(text);
    if (state.currentParagraphIndex !== index) return;

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

    state.currentAudio.addEventListener('ended', onParagraphEnded);
    await state.currentAudio.play();
    updatePlayerUI();

    // Inicia o rastreador de fala com destaque em amarelo claro
    startWordHighlightTracker();

    preloadNextParagraph();

  } catch (err) {
    console.error('Erro na síntese de voz:', err);
    playerStatusLabel.textContent = 'Erro na síntese';
    playerPulse.classList.remove('playing');
    state.isPlaying = false;
    updatePlayerUI();
  }
}

// --------------------------------------------------------------------------
// RASTREADOR DE FALA: ACOMPANHAMENTO COM COR AMARELA CLARA
// --------------------------------------------------------------------------
function startWordHighlightTracker() {
  if (state.animFrameId) cancelAnimationFrame(state.animFrameId);

  function checkWordSync() {
    if (!state.isPlaying || !state.currentAudio) return;

    const t = state.currentAudio.currentTime;
    const boundaries = state.currentBoundaries;

    if (boundaries && boundaries.length > 0) {
      let activeWordIdx = -1;

      // Localiza a palavra correspondente ao tempo atual do áudio
      for (let i = 0; i < boundaries.length; i++) {
        const b = boundaries[i];
        if (t >= b.offsetSec && t <= (b.offsetSec + b.durationSec + 0.06)) {
          activeWordIdx = i;
          break;
        }
      }

      // Se mudou de palavra, atualiza o destaque amarelo claro simultaneamente em ambos os lados
      if (activeWordIdx !== state.lastHighlightedIdx) {
        state.lastHighlightedIdx = activeWordIdx;

        // 1. Destaque Amarelo na Coluna de Texto
        const currentParaEl = document.getElementById(`para-${state.currentParagraphIndex}`);
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

        // 2. Destaque Amarelo Claro Diretamente sobre a Folha do PDF
        if (state.lastPdfWordEl) {
          state.lastPdfWordEl.classList.remove('highlight-yellow');
          state.lastPdfWordEl = null;
        }

        if (activeWordIdx >= 0 && state.pdfParagraphWordMap) {
          const pdfIdx = state.pdfParagraphWordMap[state.currentParagraphIndex]?.[activeWordIdx];
          if (typeof pdfIdx === 'number' && state.pdfCurrentPageWords?.[pdfIdx]) {
            const pdfWordObj = state.pdfCurrentPageWords[pdfIdx];
            pdfWordObj.el.classList.add('highlight-yellow');
            state.lastPdfWordEl = pdfWordObj.el;
            scrollPdfWrapperToElement(pdfWordObj.el);
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

function onParagraphEnded() {
  clearWordHighlight();

  const page = state.doc?.pages[state.currentPageIndex];
  if (!page) return;

  const nextIdx = state.currentParagraphIndex + 1;

  if (nextIdx < page.paragraphs.length) {
    // Pausa respiratória didática (simula um professor ou narrador respirando entre frases/tópicos)
    let pauseMs = 500;
    if (state.narratorMode === 'aula') pauseMs = 550;
    else if (state.narratorMode === 'livro') pauseMs = 450;
    else if (state.narratorMode === 'conversa') pauseMs = 350;
    else if (state.narratorMode === 'rapido') pauseMs = 200;

    playerStatusLabel.textContent = `Pausa didática (${(pauseMs / 1000).toFixed(1)}s)...`;

    if (state.paragraphTransitionTimeout) clearTimeout(state.paragraphTransitionTimeout);
    state.paragraphTransitionTimeout = setTimeout(() => {
      if (state.isPlaying) {
        startReadingParagraph(nextIdx);
      }
    }, pauseMs);
  } else {
    // Fim da página: avança automaticamente para a próxima folha com pausa natural
    if (state.autoAdvance && state.currentPageIndex < state.doc.totalPages - 1) {
      playerStatusLabel.textContent = 'Avançando folha do PDF...';
      if (state.paragraphTransitionTimeout) clearTimeout(state.paragraphTransitionTimeout);
      state.paragraphTransitionTimeout = setTimeout(() => {
        if (state.isPlaying) {
          changePage(state.currentPageIndex + 1, true);
        }
      }, 750);
    } else {
      stopPlayback();
      playerStatusLabel.textContent = 'Leitura Concluída';
      playerSnippet.textContent = 'Fim do documento ou da página.';
    }
  }
}

function clearWordHighlight() {
  if (state.animFrameId) {
    cancelAnimationFrame(state.animFrameId);
    state.animFrameId = null;
  }
  document.querySelectorAll('.word-span.highlight-yellow').forEach(el => {
    el.classList.remove('highlight-yellow');
  });
  if (state.lastPdfWordEl) {
    state.lastPdfWordEl.classList.remove('highlight-yellow');
    state.lastPdfWordEl = null;
  }
  document.querySelectorAll('.pdf-word-token.highlight-yellow').forEach(el => {
    el.classList.remove('highlight-yellow');
  });
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
    state.currentAudio.removeEventListener('ended', onParagraphEnded);
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
  state.currentParagraphIndex = -1;
  playerPulse.classList.remove('playing');
  playerStatusLabel.textContent = 'Leitura Parada';
  updatePlayerUI();
  updateActiveHighlight();
}

function togglePlayPause() {
  if (!state.doc) return;

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
    playerStatusLabel.textContent = `Lendo Pág. ${state.currentPageIndex + 1} • Parágrafo ${state.currentParagraphIndex + 1}`;
    updatePlayerUI();
    startWordHighlightTracker();
  } else {
    startReadingParagraph(state.currentParagraphIndex >= 0 ? state.currentParagraphIndex : 0);
  }
}

function restartCurrentParagraph() {
  if (state.currentParagraphIndex >= 0) {
    startReadingParagraph(state.currentParagraphIndex);
  }
}

function nextParagraph() {
  const page = state.doc?.pages[state.currentPageIndex];
  if (!page) return;

  if (state.currentParagraphIndex + 1 < page.paragraphs.length) {
    startReadingParagraph(state.currentParagraphIndex + 1);
  } else if (state.currentPageIndex < state.doc.totalPages - 1) {
    changePage(state.currentPageIndex + 1, true);
  }
}

function prevParagraph() {
  if (state.currentParagraphIndex > 0) {
    startReadingParagraph(state.currentParagraphIndex - 1);
  } else if (state.currentPageIndex > 0) {
    changePage(state.currentPageIndex - 1, false);
    const prevPage = state.doc.pages[state.currentPageIndex];
    if (prevPage && prevPage.paragraphs.length > 0) {
      startReadingParagraph(prevPage.paragraphs.length - 1);
    }
  }
}

function updateActiveHighlight() {
  document.querySelectorAll('.reader-paragraph').forEach((el, idx) => {
    if (idx === state.currentParagraphIndex && state.isPlaying) {
      el.classList.add('active');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      el.classList.remove('active');
    }
  });

  // Também marca sutilmente os spans do parágrafo ativo na folha do PDF
  if (pdfTextLayer && state.pdfParagraphWordMap) {
    document.querySelectorAll('.pdf-span-active').forEach(s => s.classList.remove('pdf-span-active'));
    if (state.isPlaying && state.currentParagraphIndex >= 0) {
      const wordIndices = state.pdfParagraphWordMap[state.currentParagraphIndex] || [];
      const parentSpans = new Set();
      wordIndices.forEach(wIdx => {
        const wordObj = state.pdfCurrentPageWords[wIdx];
        if (wordObj && wordObj.parentSpan) {
          parentSpans.add(wordObj.parentSpan);
        }
      });
      parentSpans.forEach(span => span.classList.add('pdf-span-active'));
    }
  }
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
btnPlayerNext.addEventListener('click', nextParagraph);
btnPlayerPrev.addEventListener('click', prevParagraph);

// --------------------------------------------------------------------------
// Modal de Exportação para Audiolivro MP3
// --------------------------------------------------------------------------
btnExportModal.addEventListener('click', () => {
  if (!state.doc) return;
  exportModal.style.display = 'flex';
  exportProgressBox.style.display = 'none';
  exportDownloadBox.style.display = 'none';
  modalFooter.style.display = 'flex';
  btnStartExport.disabled = false;

  document.getElementById('labelExportAll').textContent = `Todas as ${state.doc.totalPages} páginas (~${state.doc.estimatedMinutes} min de áudio)`;
  document.getElementById('labelExportCurrent').textContent = `Página ${state.currentPageIndex + 1}`;
  exportStartPage.value = 1;
  exportEndPage.value = state.doc.totalPages;
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

document.querySelectorAll('input[name="exportScope"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    rangeInputs.style.display = e.target.value === 'range' ? 'flex' : 'none';
  });
});

btnStartExport.addEventListener('click', async () => {
  const scope = document.querySelector('input[name="exportScope"]:checked').value;
  let itemsToExport = [];

  if (scope === 'all') {
    state.doc.pages.forEach(p => {
      itemsToExport.push(...p.paragraphs);
    });
  } else if (scope === 'current') {
    const p = state.doc.pages[state.currentPageIndex];
    if (p) itemsToExport.push(...p.paragraphs);
  } else if (scope === 'range') {
    const start = Math.max(1, parseInt(exportStartPage.value, 10));
    const end = Math.min(state.doc.totalPages, parseInt(exportEndPage.value, 10));
    for (let i = start - 1; i < end; i++) {
      if (state.doc.pages[i]) {
        itemsToExport.push(...state.doc.pages[i].paragraphs);
      }
    }
  }

  if (itemsToExport.length === 0) {
    alert('Nenhum texto encontrado no intervalo.');
    return;
  }

  exportProgressBox.style.display = 'block';
  modalFooter.style.display = 'none';
  exportProgressBarFill.style.width = '0%';
  exportPercentText.textContent = '0%';
  exportDetailText.textContent = `Iniciando geração de ${itemsToExport.length} blocos com voz humana...`;

  try {
    const res = await fetch('/api/audiobook/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: itemsToExport,
        voice: voiceSelect.value,
        rate: speedSelect.value,
        pitch: pitchSelect.value,
        title: state.doc.title || 'audiolivro'
      })
    });

    const job = await res.json();
    if (!job.success) throw new Error(job.error || 'Erro ao criar audiolivro.');

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
        btnDownloadMp3.setAttribute('download', `${(state.doc.title || 'audiolivro').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp3`);
      }, 400);

    } else if (data.status === 'error') {
      clearInterval(state.exportPollInterval);
      state.exportPollInterval = null;
      alert(`Erro na geração: ${data.error}`);
      exportProgressBox.style.display = 'none';
      modalFooter.style.display = 'flex';
    }
  } catch (e) {
    console.error('Erro ao consultar status:', e);
  }
}

// --------------------------------------------------------------------------
// Utilitários e Teclas de Atalho
// --------------------------------------------------------------------------
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
    nextParagraph();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    prevParagraph();
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
