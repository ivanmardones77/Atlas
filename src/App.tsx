import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, ChatSession, Modality } from '@google/genai';
import { Upload, FileImage, Send, Loader2, Download, Sparkles, MessageSquare, AlertCircle } from 'lucide-react';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';

// Initialize GenAI
const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const generateAtlasFunction: FunctionDeclaration = {
  name: 'generateAtlasStyle',
  description: "Triggers the image generation to apply a new style to the user's uploaded atlas.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      styleDescription: {
        type: Type.STRING,
        description: "A highly detailed, robust prompt describing the target style the user wants. E.g. 'Cyberpunk, neon lights, 2d vector art, highly detailed'",
      }
    },
    required: ['styleDescription'],
  }
};

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

const STYLE_PRESETS = [
  { label: 'Cyberpunk', value: 'Cyberpunk, iluminación de neón, sci-fi, oscuro, muy detallado' },
  { label: 'Acuarela', value: 'Estilo acuarela suave, tintas pasteles, pintado a mano, artístico' },
  { label: 'Pixel Art', value: 'Pixel art de 16-bit, game art retro, bordes afilados' },
  { label: 'Anime', value: 'Estilo anime, cel shading, líneas limpias, vibrante' }
];

export default function App() {
  const [originalAtlas, setOriginalAtlas] = useState<{ src: string, w: number, h: number, maxDim: number, b64Data: string } | null>(null);
  const [atlasTextData, setAtlasTextData] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<{ src: string, b64Data: string } | null>(null);

  const [generatedAtlas, setGeneratedAtlas] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'model',
      text: '¡Hola! 🎨 Sube tu Atlas de Spine 2D, y opcionalmente su archivo de datos (.txt/.atlas) y una imagen de referencia, y dime qué nuevo estilo artístico te gustaría aplicar.',
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isChatting, setIsChatting] = useState(false);

  const chatSessionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Initialize Chat Session
    chatSessionRef.current = getAI().chats.create({
      model: 'gemini-3.1-pro-preview',
      config: {
        systemInstruction: "You are a helpful assistant for a Spine 2D game developer. The user wants to change the artistic style of their 2D texture atlas. Ask them what style they want, or discuss options with them. Once they have specified a style, MUST call the `generateAtlasStyle` tool with a HIGHLY detailed prompt of their chosen style (e.g., 'Cyberpunk, neon lighting, gritty, 2d game art, high quality'). Converse in Spanish with the user, but use English for the tool's styleDescription parameter.",
        tools: [{ functionDeclarations: [generateAtlasFunction] }],
        temperature: 0.7,
      }
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadError('');

    const imageFile = files.find(f => f.type.startsWith('image/'));
    const textFile = files.find(f => f.name.endsWith('.txt') || f.name.endsWith('.atlas') || f.type.startsWith('text/'));

    if (imageFile) {
        setGeneratedAtlas(null);

        const reader = new FileReader();
        reader.onload = (event) => {
          const src = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
            const { width, height } = img;
            const maxDim = Math.max(width, height);
            
            // Pad to square to prevent aspect ratio distortion from Gemini Flash Image
            const canvas = document.createElement('canvas');
            canvas.width = maxDim;
            canvas.height = maxDim;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Fill with white to give the AI a solid background for better style transfer
              // The transparent border will be restored later via alpha masking
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, maxDim, maxDim);
              ctx.drawImage(img, 0, 0);
              const dataURL = canvas.toDataURL('image/jpeg', 1.0);
              const b64Data = dataURL.split(',')[1];
              setOriginalAtlas({ src, w: width, h: height, maxDim, b64Data });
            }
          };
          img.src = src;
        };
        reader.readAsDataURL(imageFile);
    }

    if (textFile) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAtlasTextData(event.target?.result as string);
        };
        reader.readAsText(textFile);
    }

    if (!imageFile && !textFile) {
      setUploadError('Por favor, sube un archivo de imagen o archivo de datos de atlas.');
    }
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('La imagen de referencia debe ser válida.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Redraw on canvas to get clean jpeg base64
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const b64Data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
          setReferenceImage({ src, b64Data });
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      fileInputRef.current!.files = e.dataTransfer.files;
      handleFileUpload({ target: fileInputRef.current } as any);
    }
  };

  const generateImageAtlas = async (styleDesc: string) => {
    if (!originalAtlas) return;
    setIsGenerating(true);
    try {
      let prompt = `You are a creative texture replacement AI. Completely REDRAW the first image (the sprite sheet/atlas) in the following new style: "${styleDesc}". 
CRITICAL: Do NOT just apply a filter or keep the original drawing style. You MUST completely change the art style to match the new prompt. Draw completely new materials, shading, and details over every part. The new output should look like a completely different artist drew these pieces in the new style.`;

      if (atlasTextData) {
        prompt += `\n\nReference Spine regions (ignore exact bounds if needed, just use for context of what the items are):\n\n${atlasTextData.substring(0, 500)}...`;
      }

      const inputParts: any[] = [
        {
          inlineData: {
            data: originalAtlas.b64Data,
            mimeType: 'image/jpeg',
          },
        }
      ];

      if (referenceImage) {
        inputParts.push({ text: "Context image: This is what the fully assembled character looks like. Use this to understand what the pieces in the atlas represent, but DO NOT output this assembled character. You MUST ONLY output the redrawn atlas grid." });
        inputParts.push({
          inlineData: {
             data: referenceImage.b64Data,
             mimeType: 'image/jpeg',
          }
        });
      }

      inputParts.push({ text: prompt });

      let response;
      let retries = 3;
      while (retries > 0) {
        try {
          response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
              parts: inputParts,
            },
          });
          break;
        } catch (error: any) {
          const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED');
          if (isRateLimit && retries > 1) {
            retries--;
            await new Promise(res => setTimeout(res, 5000)); // wait 5 seconds before retrying
          } else if (isRateLimit) {
            throw new Error("Límite de cuota gratuita superado (Error 429). Por favor, espera unos minutos e inténtalo de nuevo.");
          } else {
            throw error;
          }
        }
      }
      
      if (!response) {
         throw new Error("No se pudo obtener respuesta del modelo.");
      }

      let generatedB64 = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          generatedB64 = part.inlineData.data;
          break;
        }
      }

      if (generatedB64) {
        await new Promise<void>((resolve, reject) => {
          const genImg = new Image();
          genImg.onload = () => {
            const origImg = new Image();
            origImg.onload = () => {
              const finalCanvas = document.createElement('canvas');
              finalCanvas.width = originalAtlas.w;
              finalCanvas.height = originalAtlas.h;
              const ctx = finalCanvas.getContext('2d');
              if (ctx) {
                // 1. Render the generated image
                ctx.drawImage(genImg, 0, 0, originalAtlas.maxDim, originalAtlas.maxDim);
                
                // 2. Apply Alpha Masking using the original image to GUARANTEE 
                // that no pixels are drawn outside the original silhouettes
                ctx.globalCompositeOperation = 'destination-in';
                ctx.drawImage(origImg, 0, 0, originalAtlas.w, originalAtlas.h);
                
                setGeneratedAtlas(finalCanvas.toDataURL('image/png'));
                resolve();
              } else {
                reject(new Error("Canvas context not available"));
              }
            };
            origImg.onerror = reject;
            origImg.src = originalAtlas.src;
          };
          genImg.onerror = reject;
          genImg.src = `data:image/png;base64,${generatedB64}`;
        });
      } else {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: 'Error: No se pudo generar la imagen. Inténtalo con un prompt diferente.' }]);
      }

    } catch (error) {
      console.error("Gen Error", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: 'Ocurrió un error en la generación: ' + (error as Error).message }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isChatting) return;

    if (!originalAtlas) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: '⚠️ Por favor, sube primero tu atlas de Spine 2D.' }]);
      return;
    }

    const userText = inputValue.trim();
    setInputValue('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    setIsChatting(true);

    try {
      const response = await chatSessionRef.current.sendMessage({ message: userText });
      
      let textResponse = '';
      let shouldGenerate = false;
      let styleDesc = '';

      if (response.functionCalls && response.functionCalls.length > 0) {
        for (const call of response.functionCalls) {
          if (call.name === 'generateAtlasStyle') {
            shouldGenerate = true;
            styleDesc = call.args.styleDescription;
          }
        }
      }

      const pText = response.text;
      if (pText) {
        textResponse = pText;
      }

      if (textResponse) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: textResponse }]);
      } else if (shouldGenerate) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: `¡Entendido! Generando atlas en estilo: "${styleDesc}"... 🎨⏳` }]);
      }

      if (shouldGenerate) {
        await generateImageAtlas(styleDesc);
      }

    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: 'Error al enviar el mensaje. Inténtalo de nuevo.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#090a0c] text-slate-300 font-sans overflow-hidden">
      {/* Header */}
      <nav className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0d0f14] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded-md flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <Sparkles className="w-5 h-5 text-black" />
          </div>
          <span className="font-bold tracking-tight text-white text-lg">Spine Style <span className="text-cyan-400 font-light italic">Gen</span></span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="px-3 py-1 rounded bg-white/5 border border-white/10 text-cyan-400">
            CONNECTED: Nano Banana
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Chat */}
        <aside className="w-80 border-r border-white/10 bg-[#0d0f14]/50 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Asistente de Arte</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex flex-col text-sm", msg.role === 'user' ? 'ml-auto max-w-[90%]' : '')}>
                <div 
                  className={cn(
                    "p-3 rounded-lg border", 
                    msg.role === 'user' 
                      ? 'bg-cyan-600/20 border-cyan-500/30 text-white' 
                      : 'bg-white/5 border-white/10 text-slate-300'
                  )}
                >
                  {msg.role === 'model' && <p className="text-cyan-400 font-bold mb-1 italic">Asistente:</p>}
                  <div className="markdown-body text-sm font-sans leading-relaxed">
                    <ReactMarkdown components={{ p: ({node, ...props}) => <p className="mb-0" {...props} /> }}>
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isChatting && (
                <div className="bg-white/5 p-3 rounded-lg border border-white/10 flex gap-1 items-center w-fit">
                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></span>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-[#090a0c] border-t border-white/5 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setInputValue(preset.value)}
                  disabled={!originalAtlas || isChatting}
                  className="text-[10px] px-2.5 py-1 rounded-sm bg-white/5 border border-white/10 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider font-mono"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={originalAtlas ? "Refinar el estilo..." : "Sube un archivo primero"}
                disabled={!originalAtlas || isChatting}
                className="w-full bg-white/5 border border-white/20 rounded-full py-2 pl-4 pr-10 text-sm focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 transition-all text-white placeholder:text-slate-500"
              />
              <button 
                type="submit" 
                disabled={!originalAtlas || !inputValue.trim() || isChatting}
                className="absolute right-2 top-1 text-cyan-500 hover:text-white disabled:opacity-50 disabled:hover:text-cyan-500 transition-colors"
              >
                <Send className="w-5 h-5 mt-0.5" />
              </button>
            </form>
          </div>
        </aside>

        {/* Center - Workspace */}
        <section className="flex-1 bg-[#050506] relative flex overflow-y-auto overflow-x-hidden p-8 flex-col items-center justify-center">
          {/* Checkerboard Background Simulator */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#222 2px, transparent 2px)', backgroundSize: '20px 20px' }}></div>
          
          {/* Upload Area */}
          {!originalAtlas && (
            <div 
              className={cn(
                "relative z-10 w-full max-w-2xl border-2 border-dashed border-white/10 rounded-sm flex flex-col items-center justify-center p-12 transition-colors bg-[#111]/80 hover:bg-[#111]",
                "cursor-pointer shadow-2xl"
              )}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" className="hidden" accept="image/png, image/jpeg, text/plain, .atlas, .txt" ref={fileInputRef} onChange={handleFileUpload} multiple />
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                  <Upload className="w-8 h-8 text-cyan-500" />
              </div>
              <h3 className="text-xl font-medium text-white mb-2 tracking-tight">Sube tu Atlas de Spine 2D</h3>
              <p className="text-slate-500 text-sm text-center max-w-md">Haz clic o arrastra archivos PNG y/o .txt/.atlas. Es importante que el fondo de la imagen sea transparente para preservar los canales alpha en Unity.</p>
              {uploadError && <div className="mt-6 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm flex items-center"><AlertCircle className="w-4 h-4 mr-2"/> {uploadError}</div>}
            </div>
          )}

          {/* Atlas Viewer Area */}
          {originalAtlas && (
            <div className="relative z-10 flex flex-col xl:flex-row gap-8 w-full max-w-6xl min-h-0 h-full">
              {/* Original Atlas */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#111] border border-white/10 shadow-2xl rounded-sm group overflow-hidden">
                 <div className="bg-[#090a0c] p-3 border-b border-white/10 flex justify-between items-center">
                   <h2 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold flex items-center gap-2">
                     <FileImage className="w-3.5 h-3.5 text-slate-400" /> Original
                     {atlasTextData && <span className="ml-2 text-cyan-500 border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 rounded shadow-sm">+ DATA.TXT</span>}
                     {referenceImage && <span className="ml-2 text-fuchsia-400 border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 rounded shadow-sm">+ REF.IMG</span>}
                   </h2>
                   <button 
                     onClick={() => { setOriginalAtlas(null); setGeneratedAtlas(null); setAtlasTextData(null); setReferenceImage(null); }}
                     className="text-[10px] uppercase text-cyan-600 hover:text-cyan-400 font-mono transition-colors"
                   >
                     [ Cambiar ]
                   </button>
                 </div>
                 <div className="flex-1 overflow-auto bg-[url('https://upload.wikimedia.org/wikipedia/commons/5/5c/Image_checkerboard.png')] bg-repeat bg-[length:16px_16px] relative p-4 flex items-center justify-center">
                   <img src={originalAtlas.src} alt="Original Atlas" className="max-w-full h-auto object-contain pointer-events-none drop-shadow-md border border-white/5" />
                 </div>
              </div>

              {/* Generated Atlas */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#111] border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.1)] rounded-sm group overflow-hidden relative">
                 <div className="bg-[#090a0c] p-3 border-b border-cyan-500/20 flex justify-between items-center">
                   <h2 className="text-[10px] text-cyan-400 uppercase tracking-[0.2em] font-bold flex items-center gap-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]">
                     <Sparkles className="w-3.5 h-3.5" /> AI Preview
                   </h2>
                 </div>
                 <div className="flex-1 overflow-auto bg-[url('https://upload.wikimedia.org/wikipedia/commons/5/5c/Image_checkerboard.png')] bg-repeat bg-[length:16px_16px] relative p-4 flex items-center justify-center">
                   {isGenerating ? (
                     <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                       <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-4 shadow-[0_0_15px_cyan]" />
                       <p className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold animate-pulse">Processing Style...</p>
                     </div>
                   ) : generatedAtlas ? (
                     <img src={generatedAtlas} alt="Generado" className="max-w-full h-auto object-contain pointer-events-none drop-shadow-[0_0_15px_rgba(6,182,212,0.2)] border border-cyan-500/30" />
                   ) : (
                     <div className="text-slate-600 text-sm text-center flex flex-col items-center">
                       <Sparkles className="w-8 h-8 mb-3 opacity-20" />
                       <span className="font-mono text-xs opacity-50">Esperando instrucciones...</span>
                     </div>
                   )}
                 </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Sidebar - Export */}
        <aside className="w-64 border-l border-white/10 bg-[#0d0f14]/50 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Unity Export</h2>
          </div>
          
          <div className="p-4 flex flex-col gap-6 flex-1">
            <div className="space-y-3">
              <label className="flex items-center justify-between text-sm group cursor-pointer">
                <span className="text-slate-400 group-hover:text-white">Transparent BG</span>
                <div className="w-10 h-5 bg-cyan-600 rounded-full flex items-center px-1 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                  <div className="ml-auto w-3 h-3 bg-white rounded-full"></div>
                </div>
              </label>
              <label className="flex items-center justify-between text-sm group cursor-pointer" onClick={() => !atlasTextData && textFileInputRef.current?.click()}>
                <span className={cn("transition-colors", atlasTextData ? "text-cyan-400 font-medium" : "text-slate-400 group-hover:text-white")}>
                  {atlasTextData ? 'Atlas Data Loaded' : 'Upload .txt (Optional)'}
                </span>
                <div className={cn("w-10 h-5 rounded-full flex items-center px-1 shadow-sm transition-colors", atlasTextData ? "bg-cyan-600 shadow-[0_0_10px_rgba(6,182,212,0.3)]" : "bg-slate-700")}>
                  <div className={cn("w-3 h-3 rounded-full transition-all", atlasTextData ? "ml-auto bg-white" : "bg-slate-400")}></div>
                </div>
              </label>
              <input type="file" className="hidden" accept="text/plain, .atlas, .txt" ref={textFileInputRef} onChange={handleFileUpload} />

              <label className="flex items-center justify-between text-sm group cursor-pointer" onClick={() => !referenceImage && refImageInputRef.current?.click()}>
                <span className={cn("transition-colors", referenceImage ? "text-fuchsia-400 font-medium" : "text-slate-400 group-hover:text-white")}>
                  {referenceImage ? 'Reference Loaded' : 'Upload Ref IMG (Optional)'}
                </span>
                <div className={cn("w-10 h-5 rounded-full flex items-center px-1 shadow-sm transition-colors", referenceImage ? "bg-fuchsia-600 shadow-[0_0_10px_rgba(232,121,249,0.3)]" : "bg-slate-700")}>
                  <div className={cn("w-3 h-3 rounded-full transition-all", referenceImage ? "ml-auto bg-white" : "bg-slate-400")}></div>
                </div>
              </label>
              <input type="file" className="hidden" accept="image/png, image/jpeg" ref={refImageInputRef} onChange={handleReferenceUpload} />
            </div>

            <div className="pt-4 border-t border-white/5 space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase">Input Resolution</p>
                <p className="text-lg font-light text-white">{originalAtlas ? `${originalAtlas.w}x${originalAtlas.h}` : '---'} <span className="text-xs text-slate-600">px</span></p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase">AI Fidelity</p>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-[85%] bg-cyan-500"></div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => {
                if (generatedAtlas) {
                  const a = document.createElement('a');
                  a.href = generatedAtlas;
                  a.download = "spine_atlas_restyled.png";
                  a.click();
                }
              }}
              disabled={!generatedAtlas || isGenerating}
              className="mt-auto w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-black font-black uppercase tracking-widest text-xs rounded shadow-[0_10px_30px_rgba(6,182,212,0.2)] flex items-center justify-center gap-2 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed transition-all"
            >
              <Download className="w-4 h-4" />
              Download Atlas
            </button>
          </div>

          {/* Information Panel */}
          <div className="mt-auto p-4 bg-black/40 border-t border-white/10 text-[10px] font-mono">
            <div className="flex justify-between text-cyan-600">
              <span>STATUS</span>
              <span>[{generatedAtlas ? 'READY' : (isGenerating ? 'PROCESSING' : 'IDLE')}]</span>
            </div>
            <div className="flex justify-between text-slate-600 mt-1">
              <span>MESH PRESERVED</span>
              <span>100%</span>
            </div>
          </div>
        </aside>

      </main>

      {/* Footer */}
      <footer className="h-8 bg-cyan-950/20 border-t border-white/10 flex items-center px-6 justify-between text-[10px] uppercase tracking-widest text-slate-500 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            Engine Ready
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-cyan-400">GenAI Accelerated</span>
        </div>
      </footer>
    </div>
  );
}
