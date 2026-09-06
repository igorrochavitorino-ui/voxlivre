const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { PDFParse } = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações e Diretórios
const AUDIO_CACHE_DIR = path.join(__dirname, 'cache_audio');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

if (!fs.existsSync(AUDIO_CACHE_DIR)) fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(DOWNLOADS_DIR));
app.use('/api/audio', express.static(AUDIO_CACHE_DIR));

// Rota dedicada para Leitor de Texto Copiado
app.get('/texto', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'texto.html'));
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 } // Até 150MB para PDFs grandes
});

// Mapa de progresso para geração de audiolivros
const audiobookJobs = new Map();

// Vozes recomendadas e completas
const FEATURED_VOICES = [
  {
    id: 'pt-BR-AntonioNeural',
    name: 'Antonio (Brasil - Professor & Audiolivro)',
    description: 'Voz masculina encorpada, didática e calorosa, perfeita para aulas explicativas e grandes livros.',
    lang: 'pt-BR',
    gender: 'Male',
    featured: true
  },
  {
    id: 'pt-BR-FranciscaNeural',
    name: 'Francisca (Brasil - Suave & Narrativa)',
    description: 'Voz ultra-natural, expressiva e suave, ideal para livros, romances e literatura.',
    lang: 'pt-BR',
    gender: 'Female',
    featured: true
  },
  {
    id: 'pt-BR-ThalitaMultilingualNeural',
    name: 'Thalita (Brasil - Contemporânea & Didática)',
    description: 'Voz neural contemporânea e dinâmica, excelente para artigos e tecnologia.',
    lang: 'pt-BR',
    gender: 'Female',
    featured: true
  },
  {
    id: 'pt-PT-RaquelNeural',
    name: 'Raquel (Portugal - Feminina)',
    description: 'Voz natural com sotaque de Portugal.',
    lang: 'pt-PT',
    gender: 'Female',
    featured: false
  },
  {
    id: 'pt-PT-DuarteNeural',
    name: 'Duarte (Portugal - Masculino)',
    description: 'Voz natural com sotaque de Portugal.',
    lang: 'pt-PT',
    gender: 'Male',
    featured: false
  },
  {
    id: 'en-US-JennyNeural',
    name: 'Jenny (EUA - Inglês Feminino)',
    description: 'Voz de referência em inglês norte-americano.',
    lang: 'en-US',
    gender: 'Female',
    featured: false
  },
  {
    id: 'en-US-GuyNeural',
    name: 'Guy (EUA - Inglês Masculino)',
    description: 'Voz masculina límpida em inglês norte-americano.',
    lang: 'en-US',
    gender: 'Male',
    featured: false
  },
  {
    id: 'es-ES-ElviraNeural',
    name: 'Elvira (Espanha - Espanhol Feminino)',
    description: 'Voz natural em espanhol.',
    lang: 'es-ES',
    gender: 'Female',
    featured: false
  },
  {
    id: 'es-ES-AlvaroNeural',
    name: 'Alvaro (Espanha - Espanhol Masculino)',
    description: 'Voz natural masculina em espanhol.',
    lang: 'es-ES',
    gender: 'Male',
    featured: false
  }
];

// Função para limpar, normalizar e humanizar o texto extraído de PDF para leitura didática/audiolivro
function cleanPdfText(rawText) {
  if (!rawText) return '';

  let text = rawText
    // Remove caracteres nulos e de controle estranhos
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    // Corrige hifenização de quebra de linha: "desenvolvi-\nmento" -> "desenvolvimento"
    .replace(/(\b\w+)-\r?\n(\w+\b)/g, '$1$2');

  // Detecta títulos e cabeçalhos colados em novas linhas (ex: "Módulo 2 Subsistemas...\nExaminar...")
  // e insere pontuação para que a voz neural module a conclusão do título antes da explicação
  text = text.replace(/(^|\n)(Módulo\s+\d+|Capítulo\s+\d+|Seção\s+\d+|Parte\s+\d+|Tópico\s+\d+|Unidade\s+\d+|Introdução|Conclusão|Resumo|Exercícios|Objetivos)([^\n.:?!]+)(\r?\n)([^\n])/gi, '$1$2$3.\n$5');

  // Substitui quebras de linha simples por espaço (mantendo o fluxo das frases)
  text = text.replace(/([^\n])\r?\n([^\n])/g, '$1 $2');

  // Expande abreviações comuns de apostilas/livros para uma fala natural e didática
  text = text
    .replace(/\bex\.?:?\s+/gi, 'por exemplo, ')
    .replace(/\bobs\.?:?\s+/gi, 'observação: ')
    .replace(/\bpág\.?\s*(\d+)/gi, 'página $1')
    .replace(/\bcap\.?\s*(\d+)/gi, 'capítulo $1')
    .replace(/\bfig\.?\s*(\d+)/gi, 'figura $1')
    .replace(/\bref\.?:?\s+/gi, 'referência: ')
    .replace(/\bdept\.?\b/gi, 'departamento')
    .replace(/\bprof\.?\s+/gi, 'professor ')
    .replace(/\bdr\.?\s+/gi, 'doutor ')
    .replace(/\betc\.\s*/gi, 'etcétera. ')
    // Marcadores de lista: substitui símbolos soltos (•, ▪, ►) por pausa suave de travessão
    .replace(/[•▪►]\s*/g, '— ')
    // Normaliza múltiplos espaços
    .replace(/[ \t]+/g, ' ')
    // Normaliza quebras de parágrafo duplas
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  return text;
}

// Divide o texto em blocos/parágrafos otimizados para leitura
function splitIntoParagraphs(text) {
  if (!text) return [];

  const rawBlocks = text.split(/\n\s*\n/);
  const paragraphs = [];

  for (const block of rawBlocks) {
    const clean = block.trim();
    if (clean.length > 0) {
      // Se o bloco for grande (ex: mais de 600 caracteres), divide em sentenças para não travar a síntese
      if (clean.length > 700) {
        const sentences = clean.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [clean];
        let currentChunk = '';
        for (const sentence of sentences) {
          if ((currentChunk + ' ' + sentence).length > 500) {
            if (currentChunk.trim()) paragraphs.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
          }
        }
        if (currentChunk.trim()) paragraphs.push(currentChunk.trim());
      } else {
        paragraphs.push(clean);
      }
    }
  }

  return paragraphs;
}

// Síntese de áudio com Microsoft Edge TTS (com suporte a sincronização de palavras/boundaries)
async function synthesizeAudio(text, voice = 'pt-BR-FranciscaNeural', rate = '+0%', pitch = '+0Hz') {
  const hash = crypto.createHash('md5').update(`${text}_${voice}_${rate}_${pitch}`).digest('hex');
  const cacheAudioPath = path.join(AUDIO_CACHE_DIR, `${hash}.mp3`);
  const cacheMetaPath = path.join(AUDIO_CACHE_DIR, `${hash}.json`);

  // Se já existir no cache com metadados de palavras
  if (fs.existsSync(cacheAudioPath)) {
    const audioBuffer = fs.readFileSync(cacheAudioPath);
    let boundaries = [];
    if (fs.existsSync(cacheMetaPath)) {
      try {
        boundaries = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf8'));
      } catch (e) {}
    }
    return { audioBuffer, boundaries, hash };
  }

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
    sentenceBoundaryEnabled: true
  });

  const formattedRate = rate.startsWith('+') || rate.startsWith('-') ? rate : `+${rate}`;
  const formattedPitch = pitch.startsWith('+') || pitch.startsWith('-') ? pitch : `+${pitch}`;

  const { audioStream, metadataStream } = tts.toStream(text, {
    rate: formattedRate,
    pitch: formattedPitch,
    volume: '+0%'
  });

  return new Promise((resolve, reject) => {
    const audioChunks = [];
    const boundaries = [];

    audioStream.on('data', chunk => audioChunks.push(chunk));

    if (metadataStream) {
      metadataStream.on('data', chunk => {
        try {
          const parsed = JSON.parse(chunk.toString());
          if (parsed.Metadata) {
            parsed.Metadata.forEach(m => {
              if (m.Type === 'WordBoundary') {
                boundaries.push({
                  text: m.Data.text.Text,
                  offsetSec: m.Data.Offset / 10000000,
                  durationSec: m.Data.Duration / 10000000
                });
              }
            });
          }
        } catch (e) {}
      });
    }

    audioStream.on('end', () => {
      const buffer = Buffer.concat(audioChunks);
      try {
        fs.writeFileSync(cacheAudioPath, buffer);
        fs.writeFileSync(cacheMetaPath, JSON.stringify(boundaries));
      } catch (err) {
        console.error('Erro ao salvar no cache:', err);
      }
      resolve({ audioBuffer: buffer, boundaries, hash });
    });

    audioStream.on('error', err => reject(err));
  });
}

// ----------------------------------------------------
// ROTAS DA API
// ----------------------------------------------------

// 1. Obter lista de vozes disponíveis
app.get('/api/voices', (req, res) => {
  res.json({
    success: true,
    featured: FEATURED_VOICES
  });
});

// 2. Upload e processamento do PDF
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo PDF foi enviado.' });
    }

    const originalName = req.file.originalname || 'documento.pdf';
    const parser = new PDFParse({ data: req.file.buffer });

    // Extrai texto e páginas
    const parsed = await parser.getText();
    const info = await parser.getInfo().catch(() => ({}));
    await parser.destroy();

    const totalPages = parsed.total || (parsed.pages ? parsed.pages.length : 1);
    const pages = [];
    let totalWords = 0;

    if (parsed.pages && parsed.pages.length > 0) {
      for (const p of parsed.pages) {
        const cleanedText = cleanPdfText(p.text);
        const paragraphs = splitIntoParagraphs(cleanedText);
        const pageWords = cleanedText ? cleanedText.split(/\s+/).filter(Boolean).length : 0;
        totalWords += pageWords;

        pages.push({
          pageNumber: p.num,
          text: cleanedText,
          paragraphs: paragraphs,
          words: pageWords
        });
      }
    } else {
      const cleanedText = cleanPdfText(parsed.text);
      const paragraphs = splitIntoParagraphs(cleanedText);
      totalWords = cleanedText.split(/\s+/).filter(Boolean).length;
      pages.push({
        pageNumber: 1,
        text: cleanedText,
        paragraphs: paragraphs,
        words: totalWords
      });
    }

    const estimatedMinutes = Math.ceil(totalWords / 140);

    res.json({
      success: true,
      title: info.info?.Title || originalName.replace(/\.pdf$/i, ''),
      filename: originalName,
      totalPages: totalPages,
      totalWords: totalWords,
      estimatedMinutes: estimatedMinutes,
      pages: pages
    });
  } catch (error) {
    console.error('Erro ao processar PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Não foi possível ler o arquivo PDF. Verifique se o arquivo não está protegido por senha.'
    });
  }
});

// 2b. Processamento de Texto Copiado / Livre
app.post('/api/process-text', (req, res) => {
  try {
    const { text, title = 'Texto Copiado' } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Nenhum texto informado.' });
    }

    const cleanedText = cleanPdfText(text);
    const paragraphs = splitIntoParagraphs(cleanedText);
    const totalWords = cleanedText.split(/\s+/).filter(Boolean).length;
    const estimatedMinutes = Math.ceil(totalWords / 140);

    res.json({
      success: true,
      title: title || 'Texto Copiado',
      filename: 'texto_copiado.txt',
      totalPages: 1,
      totalWords: totalWords,
      estimatedMinutes: estimatedMinutes,
      pages: [
        {
          pageNumber: 1,
          text: cleanedText,
          paragraphs: paragraphs,
          words: totalWords
        }
      ]
    });
  } catch (error) {
    console.error('Erro ao processar texto colado:', error);
    res.status(500).json({ success: false, error: 'Erro ao processar texto.' });
  }
});

// 3. Sintetizar áudio de um texto/parágrafo específico (retorna áudio + boundaries para destaque amarelo)
app.post('/api/tts/synthesize', async (req, res) => {
  try {
    const { text, voice = 'pt-BR-FranciscaNeural', rate = '+0%', pitch = '+0Hz', format } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Texto não fornecido.' });
    }

    const { audioBuffer, boundaries, hash } = await synthesizeAudio(text.trim(), voice, rate, pitch);

    if (format === 'audio' || req.headers['accept'] === 'audio/mpeg') {
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400'
      });
      return res.send(audioBuffer);
    }

    res.json({
      success: true,
      audioBase64: `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`,
      audioUrl: `/api/audio/${hash}.mp3`,
      boundaries: boundaries
    });
  } catch (error) {
    console.error('Erro ao sintetizar áudio:', error);
    res.status(500).json({ error: 'Erro ao sintetizar a voz humana.' });
  }
});

// 4. Iniciar geração de Audiolivro completo em MP3
app.post('/api/audiobook/create', async (req, res) => {
  try {
    const { items, voice = 'pt-BR-FranciscaNeural', rate = '+0%', pitch = '+0Hz', title = 'audiolivro' } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Nenhum texto para gerar o audiolivro.' });
    }

    const jobId = crypto.randomBytes(8).toString('hex');
    const safeTitle = title.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 50);
    const fileName = `${safeTitle}_${Date.now()}.mp3`;
    const outputPath = path.join(DOWNLOADS_DIR, fileName);

    audiobookJobs.set(jobId, {
      status: 'processing',
      progress: 0,
      current: 0,
      total: items.length,
      downloadUrl: null,
      error: null
    });

    res.json({
      success: true,
      jobId: jobId,
      totalItems: items.length
    });

    // Processamento assíncrono em segundo plano
    (async () => {
      const audioBuffers = [];
      const job = audiobookJobs.get(jobId);

      try {
        for (let i = 0; i < items.length; i++) {
          const text = items[i];
          if (text && text.trim()) {
            const { audioBuffer } = await synthesizeAudio(text.trim(), voice, rate, pitch);
            audioBuffers.push(audioBuffer);
          }

          job.current = i + 1;
          job.progress = Math.round(((i + 1) / items.length) * 100);
        }

        const combinedAudio = Buffer.concat(audioBuffers);
        fs.writeFileSync(outputPath, combinedAudio);

        job.status = 'completed';
        job.progress = 100;
        job.downloadUrl = `/downloads/${fileName}`;
      } catch (err) {
        console.error('Erro ao gerar audiolivro:', err);
        job.status = 'error';
        job.error = err.message || 'Erro durante a geração do audiolivro.';
      }
    })();
  } catch (error) {
    console.error('Erro na rota de audiolivro:', error);
    res.status(500).json({ error: 'Erro ao iniciar geração do audiolivro.' });
  }
});

// 5. Consultar progresso da geração de audiolivro
app.get('/api/audiobook/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = audiobookJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Trabalho não encontrado.' });
  }

  res.json(job);
});

// Inicialização do Servidor
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log(`====================================================`);
  console.log(`🔊 VoxLivre - Leitor Neural de PDF & Audiolivro`);
  console.log(`💻 No PC (Navegador/Desktop):  http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`📱 No Celular Android (mesmo Wi-Fi): http://${ip}:${PORT}`);
  });
  console.log(`====================================================`);
});
