import React, { useState, useEffect, useCallback } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { PixelViewer } from './components/PixelViewer';
import { Loader2, Wand2, Grid, RotateCcw, ChevronRight, Layout, Crop as CropIcon, Palette } from 'lucide-react';
import { clsx } from 'clsx';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from './utils/canvasUtils';

// Helper to convert RGB array to Hex string
const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
};

interface PixelResult {
  gridData: string[][];
  usedPalette: string[];
  width: number;
  height: number;
  preview: string;
}

function App() {
  // State
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload, 2: Generate/Preview, 3: Pixelate/View
  const [apiUrl, setApiUrl] = useState('/api'); // Internal API endpoint, not user configurable
  
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string>(''); // URL or Base64
  
  // Store the full pixelation result
  const [pixelResult, setPixelResult] = useState<PixelResult | null>(null);
  const [gridSize, setGridSize] = useState(64);
  const [tempGridSize, setTempGridSize] = useState(64); // For slider UI
  const [maxColors, setMaxColors] = useState(15);
  const [tempMaxColors, setTempMaxColors] = useState(15); // For slider UI
  
  // Crop State
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [croppedImageBlob, setCroppedImageBlob] = useState<Blob | null>(null);
  const [croppedImagePreview, setCroppedImagePreview] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handlers
  const handleUpload = (file: File) => {
    setOriginalFile(file);
    const url = URL.createObjectURL(file);
    setOriginalPreview(url);
    // Reset crop state
    setCroppedImageBlob(null);
    setCroppedImagePreview('');
    setIsCropping(false);
    
    setStep(2);
    setError(null);
  };

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const showCroppedImage = useCallback(async () => {
    try {
      if (!originalPreview || !croppedAreaPixels) return;
      const croppedImage = await getCroppedImg(
        originalPreview,
        croppedAreaPixels
      );
      if (croppedImage) {
        setCroppedImageBlob(croppedImage);
        setCroppedImagePreview(URL.createObjectURL(croppedImage));
        setIsCropping(false);
      }
    } catch (e) {
      console.error(e);
    }
  }, [originalPreview, croppedAreaPixels]);

  const handleGenerate = async () => {
    // Use cropped image if available, otherwise original
    const imageToSend = croppedImageBlob || originalFile;
    if (!imageToSend) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      // If it's a blob (cropped), we need to append it with a filename
      if (imageToSend instanceof Blob && !(imageToSend instanceof File)) {
         formData.append('file', imageToSend, 'cropped.png');
      } else {
         formData.append('file', imageToSend as Blob);
      }
      
      formData.append('api_url', apiUrl);
      
      const response = await fetch(`${apiUrl}/generate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`生成失败: ${response.statusText}`);
      }

      // Return base64 for frontend display
      // b64_img = base64.b64encode(generated_bytes).decode('utf-8')
      // return JSONResponse(content={"image": f"data:image/png;base64,{b64_img}"})
      
      // Frontend receives { image: "data:..." }
      const data = await response.json();
      
      if (data.image) {
        setGeneratedImage(data.image);
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '生成图片失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePixelate = async (targetGridSize: number = gridSize, targetMaxColors: number = maxColors) => {
    const sourceImage = generatedImage || croppedImagePreview || originalPreview;
    if (!sourceImage) return;

    setIsLoading(true);
    setError(null);

    try {
      const fetchResponse = await fetch(sourceImage);
      const blob = await fetchResponse.blob();
      const file = new File([blob], "image.png", { type: "image/png" });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('grid_size', targetGridSize.toString());
      formData.append('max_colors', targetMaxColors.toString());

      const response = await fetch(`${apiUrl}/pixelate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`像素化失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      const paletteMap = new Map<string, string>();
      const paletteHexList: string[] = [];

      if (Array.isArray(data.used_palette)) {
        data.used_palette.forEach((p: any) => {
          const hex = rgbToHex(p.rgb[0], p.rgb[1], p.rgb[2]);
          paletteMap.set(p.id, hex);
          paletteHexList.push(hex);
        });
      }

      const gridHex = data.grid_data.map((row: string[]) => 
        row.map((id: string) => paletteMap.get(id) || '#000000')
      );

      setPixelResult({
        gridData: gridHex,
        usedPalette: paletteHexList,
        width: data.width,
        height: data.height,
        preview: data.preview
      });
      
      // Update states
      setGridSize(targetGridSize);
      setTempGridSize(targetGridSize);
      setMaxColors(targetMaxColors);
      setTempMaxColors(targetMaxColors);

      setStep(3);
    } catch (err) {
      console.error(err);
      let errorMessage = '图片像素化失败';
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        errorMessage = `无法连接到服务器。请检查：\n1. 后端服务是否已启动\n2. Nginx 反向代理配置是否生效 (/api 路径)\n\n当前请求地址: ${apiUrl}/generate`;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setOriginalFile(null);
    setOriginalPreview('');
    setGeneratedImage('');
    setPixelResult(null);
    setError(null);
    setCroppedImageBlob(null);
    setCroppedImagePreview('');
    setIsCropping(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="bg-primary-600 p-1.5 rounded-lg">
            <img src="/pindou.svg" alt="Logo" className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">Img2Pindou</span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Settings removed, using env config */}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        
        {/* Stepper */}
        <div className="mb-8 sm:mb-12 overflow-x-auto pb-8 pt-6 scrollbar-hide px-1">
          <div className="flex items-center justify-between sm:justify-center gap-4 sm:gap-8 min-w-full sm:min-w-max px-4">
            <div className={clsx("flex flex-col sm:flex-row items-center gap-2 cursor-pointer transition-all flex-1 sm:flex-initial", step >= 1 ? "text-primary-600 scale-105" : "text-slate-400")} onClick={() => step > 1 && setStep(1)}>
              <span className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors font-bold flex-shrink-0", step >= 1 ? "bg-primary-100 text-primary-700 ring-2 ring-primary-500 ring-offset-2" : "bg-slate-100")}>1</span>
              <span className="whitespace-nowrap text-xs sm:text-base font-medium">上传图片</span>
            </div>
            <div className="h-px w-8 bg-slate-200 sm:hidden flex-shrink-0" />
            <ChevronRight className="hidden sm:block w-4 h-4 text-slate-300 flex-shrink-0" />
            <div className={clsx("flex flex-col sm:flex-row items-center gap-2 cursor-pointer transition-all flex-1 sm:flex-initial", step >= 2 ? "text-primary-600 scale-105" : "text-slate-400")} onClick={() => step > 2 && setStep(2)}>
              <span className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors font-bold flex-shrink-0", step >= 2 ? "bg-primary-100 text-primary-700 ring-2 ring-primary-500 ring-offset-2" : "bg-slate-100")}>2</span>
              <span className="whitespace-nowrap text-xs sm:text-base font-medium">AI 生成</span>
            </div>
            <div className="h-px w-8 bg-slate-200 sm:hidden flex-shrink-0" />
            <ChevronRight className="hidden sm:block w-4 h-4 text-slate-300 flex-shrink-0" />
            <div className={clsx("flex flex-col sm:flex-row items-center gap-2 cursor-pointer transition-all flex-1 sm:flex-initial", step >= 3 ? "text-primary-600 scale-105" : "text-slate-400")}>
              <span className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors font-bold flex-shrink-0", step >= 3 ? "bg-primary-100 text-primary-700 ring-2 ring-primary-500 ring-offset-2" : "bg-slate-100")}>3</span>
              <span className="whitespace-nowrap text-xs sm:text-base font-medium">像素化</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-center">
            {error}
          </div>
        )}

        {/* View 1: Upload */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto animate-fade-in text-center px-4">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">像素画工坊</h1>
            <p className="text-base sm:text-lg text-slate-600 mb-8">
              将您的图片转换为专为拼豆创作准备的像素画杰作。
            </p>
            <div className="card p-2 bg-white shadow-lg shadow-slate-200/50">
              <ImageUploader onImageSelect={handleUpload} />
            </div>
          </div>
        )}

        {/* View 2: Generate/Preview */}
        {step === 2 && (
          <div className="animate-fade-in max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Original */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                   <h3 className="font-semibold text-slate-700">原始图片</h3>
                   {!generatedImage && (
                     <button 
                       onClick={() => setIsCropping(!isCropping)}
                       className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium px-2 py-1 rounded bg-primary-50"
                     >
                       <CropIcon size={14} />
                       {isCropping ? '取消裁剪' : '裁剪'}
                     </button>
                   )}
                </div>
                <div className="aspect-square bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative group">
                  {isCropping ? (
                    <div className="relative w-full h-full bg-slate-900">
                      <Cropper
                        image={originalPreview}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        onCropChange={setCrop}
                        onCropComplete={onCropComplete}
                        onZoomChange={setZoom}
                      />
                      <button 
                        onClick={showCroppedImage}
                        className="absolute bottom-4 right-4 z-10 btn-primary py-1.5 px-3 text-xs"
                      >
                        确认
                      </button>
                    </div>
                  ) : (
                    <img 
                      src={croppedImagePreview || originalPreview} 
                      alt="Original" 
                      className="w-full h-full object-contain p-2"
                    />
                  )}
                </div>
              </div>

              {/* Generated */}
              <div className="space-y-3">
                 <div className="flex items-center justify-between">
                   <h3 className="font-semibold text-slate-700">AI 增强效果</h3>
                   {!generatedImage && (
                     <span className="text-xs px-2 py-1 bg-slate-100 text-slate-500 rounded-md">可选</span>
                   )}
                </div>
                <div className={clsx(
                  "aspect-square rounded-xl border border-slate-200 shadow-sm overflow-hidden relative transition-all",
                  generatedImage ? "bg-white border-primary-200 ring-2 ring-primary-100" : "bg-slate-50 border-dashed flex items-center justify-center"
                )}>
                  {generatedImage ? (
                    <img 
                      src={generatedImage} 
                      alt="Generated" 
                      className="w-full h-full object-contain p-2 animate-fade-in"
                    />
                  ) : (
                    <div className="text-center p-6">
                      <Wand2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">
                        生成专为像素画优化的 AI 变体
                      </p>
                    </div>
                  )}
                  
                  {isLoading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
                      <div className="flex flex-col items-center gap-2">
                         <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                         <span className="text-sm font-medium text-slate-600">生成中...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 py-8 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                {!generatedImage && (
                  <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="btn-secondary gap-2 w-full sm:min-w-[160px]"
                  >
                    <Wand2 size={18} />
                    AI 生成
                  </button>
                )}
                
                <button
                  onClick={() => handlePixelate(64, 15)} // Default to 64 grid, 15 colors
                  disabled={isLoading}
                  className="btn-primary gap-2 w-full sm:min-w-[160px] shadow-lg shadow-primary-500/20 whitespace-nowrap"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <Grid size={18} />}
                  像素化 {generatedImage ? '(AI增强版)' : (croppedImagePreview ? '(裁剪版)' : '(原图)')}
                </button>
              </div>
              
              <button 
                onClick={handleReset} 
                className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                取消并重新开始
              </button>
            </div>
          </div>
        )}

        {/* View 3: Result */}
        {step === 3 && pixelResult && (
          <div className="animate-fade-in h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">像素图纸</h2>
                <p className="text-slate-500 text-sm">已准备好拼装</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-3 sm:gap-6 w-full md:w-auto">
                 {/* Controls Container */}
                 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex-1 md:flex-initial">
                    {/* Density Control */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[2rem]">密度</span>
                      <input 
                        type="range" 
                        min="16" 
                        max="128" 
                        step="8" 
                        value={tempGridSize}
                        onChange={(e) => setTempGridSize(Number(e.target.value))}
                        onMouseUp={() => handlePixelate(Number(tempGridSize), maxColors)}
                        onTouchEnd={() => handlePixelate(Number(tempGridSize), maxColors)}
                        disabled={isLoading}
                        className="flex-1 sm:w-32 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                        title="网格密度 (16-128)"
                      />
                      <span className="text-sm font-mono font-medium text-primary-600 min-w-[2.5rem] text-right">
                        {tempGridSize}
                      </span>
                    </div>

                    {/* Separator */}
                    <div className="hidden sm:block w-px h-6 bg-slate-200" />

                    {/* Max Colors Control */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[2rem] flex items-center gap-1">
                        <Palette size={12} />
                        色数
                      </span>
                      <input 
                        type="range" 
                        min="5" 
                        max="30" 
                        step="1" 
                        value={tempMaxColors}
                        onChange={(e) => setTempMaxColors(Number(e.target.value))}
                        onMouseUp={() => handlePixelate(gridSize, Number(tempMaxColors))}
                        onTouchEnd={() => handlePixelate(gridSize, Number(tempMaxColors))}
                        disabled={isLoading}
                        className="flex-1 sm:w-32 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                        title="最大颜色数 (5-30)"
                      />
                      <span className="text-sm font-mono font-medium text-primary-600 min-w-[2.5rem] text-right">
                        {tempMaxColors}
                      </span>
                    </div>
                 </div>

                 <button 
                  onClick={handleReset}
                  className="btn-secondary gap-2 text-xs py-2.5 px-4"
                >
                  <RotateCcw size={14} />
                  新建
                </button>
              </div>
            </div>
            
            <PixelViewer 
              gridData={pixelResult.gridData}
              usedPalette={pixelResult.usedPalette}
              previewImage={pixelResult.preview}
              width={pixelResult.width}
              height={pixelResult.height}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
