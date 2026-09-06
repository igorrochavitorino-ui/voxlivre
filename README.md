# ?? VoxLivre - Leitor de PDF com Voz Humana Ilimitada & Marca-Texto Inteligente

Um leitor neural moderno, rápido e sem restrições para ler arquivos PDF em voz alta com **voz humana ultra-realista (Microsoft Edge Neural TTS)**, acompanhamento por **marca-texto amarelo claro (#fef08a)** sincronizado em tempo real sobre a própria folha do PDF, e conversão de livros ou documentos em **audiolivros MP3 de alta fidelidade**.

100% gratuito, sem limite de páginas ou caracteres, sem custo de API e com naturalidade absoluta.

---

## ?? Como Iniciar em 1 Clique

1. Dê um duplo clique no atalho **VoxLivre** na sua Área de Trabalho (ou execute **iniciar.bat** na pasta do projeto).
2. O servidor iniciará e o programa abrirá automaticamente no seu navegador padrão (http://localhost:3000).

*(Ou pelo terminal: execute 
pm install && npm start)*

---

## ? Principais Recursos

- **Vozes Neurais de Alta Fidelidade (Microsoft Edge TTS)**:
  - ???? **Francisca**: Voz feminina fluida, natural e expressiva (perfeita para livros e romances).
  - ???? **Antonio**: Voz masculina clássica e encorpada (estilo audiolivro e documentário).
  - ???? **Thalita**: Voz contemporânea e expressiva.
  - ???? Vozes de Portugal (Raquel e Duarte).
  - ???? ???? Vozes em Inglês e Espanhol.
- **Marca-Texto Amarelo Claro (#fef08a) Diretamente no PDF**:
  - Acompanhamento palavra por palavra em tempo real sobre a folha original do PDF.
  - As letras pretas originais mantêm nitidez perfeita com mesclagem óptica.
  - Rolagem automática para manter a leitura sempre no campo de visão.
  - Clique com o mouse em qualquer palavra ou frase sobre o PDF para iniciar a narração a partir dela.
- **Modos de Visualização Sob Medida**:
  - ?? **Lado a Lado**: Folha do PDF à esquerda com divisor redimensionável com o mouse e leitor de texto à direita.
  - ?? **Folha PDF**: Exibição exclusiva da folha original do documento em tamanho amplo com o marca-texto amarelo.
  - ?? **Texto Limpo**: Modo minimalista sem distrações.
- **Aba Dedicada para Copiar e Colar Textos**:
  - Aba independente em /texto para colar notícias, artigos, redações ou textos livres e ouvir com voz humana.
- **Gerador de Audiolivro (MP3)**:
  - Exporte o PDF completo, a página atual ou um intervalo de páginas diretamente em arquivo .mp3.
  - Acompanhe o progresso em tempo real e baixe para ouvir no celular, carro ou offline.
- **Ajustes Personalizados**:
  - Controle de velocidade (de 0.75x até 2.0x).
  - Controle de tom (pitch) e gravação das preferências no navegador (localStorage).

---

## ?? Atalhos de Teclado

| Tecla | Ação |
| :--- | :--- |
| **Barra de Espaço** | Tocar / Pausar leitura |
| **Seta Direita (?)** | Avançar para o próximo parágrafo |
| **Seta Esquerda (?)** | Voltar para o parágrafo anterior |
| **Esc** | Parar leitura / Fechar janela de exportação |

---

## ??? Tecnologias Utilizadas

- **Node.js** + **Express**
- **msedge-tts** (Microsoft Edge Neural Text-to-Speech com Word Boundary)
- **PDF.js** (Renderização vetorial de folhas PDF e Text Layer)
- **pdf-parse** (Extração inteligente de texto e páginas)
- **HTML5 / CSS3 Modern Dark / Vanilla JS**
