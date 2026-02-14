import React, { useCallback, useState } from 'react';
import { Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface ImageUploaderProps {
  onImageSelect: (file: File) => void;
  isLoading?: boolean;
  className?: string;
}

export function ImageUploader({ onImageSelect, isLoading = false, className }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onImageSelect(file);
      }
    }
  }, [onImageSelect]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageSelect(e.target.files[0]);
    }
    // Reset value so the same file can be selected again if needed
    e.target.value = '';
  }, [onImageSelect]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      className={twMerge(
        "relative flex flex-col items-center justify-center w-full h-64 sm:h-80 border-2 border-dashed rounded-xl transition-all duration-200 ease-out cursor-pointer overflow-hidden bg-white",
        isDragging 
          ? "border-primary-500 bg-primary-50" 
          : "border-slate-300 hover:border-primary-400 hover:bg-slate-50",
        isLoading && "cursor-wait opacity-75",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleFileSelect}
        disabled={isLoading}
        onClick={(e) => e.stopPropagation()} // Stop propagation to prevent double trigger
      />

      <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 z-10">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
            <p className="text-sm font-medium text-slate-600">正在处理图片...</p>
          </div>
        ) : (
          <>
            <div className={`p-4 rounded-full transition-colors duration-200 ${isDragging ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 text-slate-500 group-hover:bg-primary-50 group-hover:text-primary-600'}`}>
              {isDragging ? <ImageIcon className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
            </div>
            
            <div className="space-y-1">
              <p className="text-lg font-semibold text-slate-900">
                {isDragging ? "松开以上传" : "点击上传或拖拽图片至此"}
              </p>
              <p className="text-sm text-slate-500">
                支持 SVG, PNG, JPG 或 GIF (最大 800x400px)
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
