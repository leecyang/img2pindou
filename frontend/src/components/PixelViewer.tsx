import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Download, ZoomIn, ZoomOut, Grid as GridIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface PixelViewerProps {
  gridData: string[][];
  usedPalette: string[];
  previewImage?: string;
  width: number;
  height: number;
  className?: string;
}

export function PixelViewer({ 
  gridData, 
  usedPalette, 
  width, 
  height,
  className 
}: PixelViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visibleColors, setVisibleColors] = useState<Set<string>>(new Set(usedPalette));
  const [scale, setScale] = useState(10);
  const [showGrid, setShowGrid] = useState(false);
  const [addPadding, setAddPadding] = useState(true);

  useEffect(() => {
    setVisibleColors(new Set(usedPalette));
  }, [usedPalette]);

  const toggleColorVisibility = (color: string) => {
    const newVisible = new Set(visibleColors);
    if (newVisible.has(color)) {
      newVisible.delete(color);
    } else {
      newVisible.add(color);
    }
    setVisibleColors(newVisible);
  };

  const toggleAllColors = () => {
    if (visibleColors.size === usedPalette.length) {
      setVisibleColors(new Set());
    } else {
      setVisibleColors(new Set(usedPalette));
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width * scale + (addPadding ? scale * 2 : 0);
    canvas.height = height * scale + (addPadding ? scale * 2 : 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fill white background if padding is enabled (for the border)
    if (addPadding) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Save context for translation
    ctx.save();
    if (addPadding) {
      ctx.translate(scale, scale);
    }

    // Checkerboard background for transparent areas within the grid
    const patternSize = 10;
    for (let x = 0; x < width * scale; x += patternSize) {
      for (let y = 0; y < height * scale; y += patternSize) {
        ctx.fillStyle = ((x / patternSize + y / patternSize) % 2 === 0) ? '#f8fafc' : '#ffffff';
        ctx.fillRect(x, y, patternSize, patternSize);
      }
    }

    gridData.forEach((row, y) => {
      row.forEach((color, x) => {
        if (visibleColors.has(color)) {
          ctx.fillStyle = color;
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      });
    });

    if (showGrid && scale > 4) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      
      for (let x = 0; x <= width; x++) {
        ctx.moveTo(x * scale, 0);
        ctx.lineTo(x * scale, height * scale);
      }
      
      for (let y = 0; y <= height; y++) {
        ctx.moveTo(0, y * scale);
        ctx.lineTo(width * scale, y * scale);
      }
      
      ctx.stroke();
    }
    
    // Restore context
    ctx.restore();

  }, [gridData, visibleColors, scale, showGrid, width, height, addPadding]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = 'pixel-art.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={twMerge("flex flex-col lg:flex-row gap-6 h-auto lg:h-[calc(100vh-12rem)] min-h-[500px]", className)}>
      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col card min-h-[400px]">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap gap-3 justify-between items-center bg-white">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center border border-slate-200 rounded-lg p-1">
              <button 
                onClick={() => setScale(s => Math.max(1, s - 1))}
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 transition-colors"
                title="缩小"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-slate-600 min-w-[3rem] text-center select-none">
                {scale}x
              </span>
              <button 
                onClick={() => setScale(s => Math.min(50, s + 1))}
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 transition-colors"
                title="放大"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
            
            <div className="h-6 w-px bg-slate-200 mx-2" />
            
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border",
                showGrid 
                  ? "bg-primary-50 border-primary-200 text-primary-700" 
                  : "bg-white border-transparent hover:bg-slate-100 text-slate-600"
              )}
            >
              <GridIcon className="w-4 h-4" />
              网格
            </button>

            <button
              onClick={() => setAddPadding(!addPadding)}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border",
                addPadding
                  ? "bg-primary-50 border-primary-200 text-primary-700" 
                  : "bg-white border-transparent hover:bg-slate-100 text-slate-600"
              )}
            >
              <span className="w-4 h-4 border border-current rounded-sm"></span>
              白边
            </button>
          </div>
          
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-xs font-medium shadow-sm"
          >
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
        
        {/* Canvas Container */}
        <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-slate-50 relative">
           <canvas 
            ref={canvasRef}
            className="shadow-xl bg-white"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      </div>

      {/* Sidebar - Color Layers */}
      <div className="w-full lg:w-72 flex flex-col card h-full">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-semibold text-sm text-slate-700">图层列表</h3>
          <button 
            onClick={toggleAllColors}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            {visibleColors.size === usedPalette.length ? '隐藏全部' : '显示全部'}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {usedPalette.map((color, index) => (
            <div 
              key={`${color}-${index}`}
              className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg group transition-colors border border-transparent hover:border-slate-200"
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded-lg shadow-sm border border-slate-200"
                  style={{ backgroundColor: color }}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-mono font-medium text-slate-600">{color}</span>
                  <span className="text-[10px] text-slate-400">图层 {index + 1}</span>
                </div>
              </div>
              
              <button
                onClick={() => toggleColorVisibility(color)}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  visibleColors.has(color) 
                    ? "text-slate-400 hover:text-primary-600 hover:bg-primary-50" 
                    : "text-slate-300 hover:text-slate-500"
                )}
              >
                {visibleColors.has(color) ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
        
        <div className="p-3 border-t border-slate-200 bg-slate-50 text-center">
          <span className="text-xs text-slate-500">
            共 {usedPalette.length} 种颜色
          </span>
        </div>
      </div>
    </div>
  );
}
