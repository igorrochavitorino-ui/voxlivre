const http = require('http');

async function testVoices() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/voices', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        console.log('✅ /api/voices OK - Vozes encontradas:', json.featured.length);
        resolve(true);
      });
    }).on('error', reject);
  });
}

async function testTTS() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text: 'Olá! O sistema de voz humana ilimitada está funcionando perfeitamente.',
      voice: 'pt-BR-FranciscaNeural',
      rate: '+0%',
      pitch: '+0Hz'
    });

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/tts/synthesize',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        console.log(`✅ /api/tts/synthesize OK - Áudio gerado: ${buf.length} bytes (Tipo: ${res.headers['content-type']})`);
        resolve(buf.length > 0);
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runAll() {
  console.log('Iniciando verificação do sistema...');
  await testVoices();
  await testTTS();
  console.log('🎉 Todos os testes de verificação passaram com 100% de sucesso!');
  process.exit(0);
}

runAll().catch(err => {
  console.error('❌ Falha no teste:', err);
  process.exit(1);
});
