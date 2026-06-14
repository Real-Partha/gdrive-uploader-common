import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { CheckCircle2, ImageUp, Loader2, RotateCw } from 'lucide-react';
import { getPhotoDate } from '../lib/exifClient';
import { uploadFileResumable } from '../lib/driveUpload';
import { completeUpload, createUploadSession } from '../lib/api';

type UploadStatus = 'queued' | 'uploading' | 'done' | 'error';

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

interface DropzoneProps {
  name: string;
  onUploaded: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function Dropzone({ name, onUploaded }: DropzoneProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const runUpload = useCallback(
    async (item: UploadItem) => {
      updateItem(item.id, { status: 'uploading', progress: 0, error: undefined });

      try {
        const photoDate = await getPhotoDate(item.file);

        const session = await createUploadSession({
          filename: item.file.name,
          mimeType: item.file.type,
          size: item.file.size,
          photoDate,
          name: nameRef.current,
        });

        const driveFileId = await uploadFileResumable(item.file, session.sessionUrl, (uploaded, total) => {
          updateItem(item.id, { progress: Math.round((uploaded / total) * 100) });
        });

        await completeUpload({
          name: nameRef.current,
          fileName: session.fileName,
          photoDate,
          sizeBytes: item.file.size,
          driveFileId,
        });

        updateItem(item.id, { status: 'done', progress: 100 });
        onUploaded();
      } catch (err) {
        updateItem(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
      }
    },
    [onUploaded, updateItem]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newItems: UploadItem[] = acceptedFiles.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'queued',
        progress: 0,
      }));

      setItems((prev) => [...newItems, ...prev]);
      newItems.forEach((item) => void runUpload(item));
    },
    [runUpload]
  );

  const disabled = !name.trim();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    disabled,
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          disabled
            ? 'cursor-not-allowed border-white/10 bg-white/[0.02] text-gray-600'
            : isDragActive
              ? 'border-purple-400 bg-purple-400/10 text-purple-200'
              : 'border-white/15 bg-white/[0.03] text-gray-300 hover:border-purple-400/50 hover:bg-white/[0.05]'
        }`}
      >
        <input {...getInputProps()} />
        <ImageUp className="mb-3 size-10" />
        {disabled ? (
          <p className="text-sm">Enter your name above to start uploading</p>
        ) : isDragActive ? (
          <p className="text-sm font-medium">Drop your photos here</p>
        ) : (
          <>
            <p className="text-sm font-medium">Drag & drop photos here, or click to choose files</p>
            <p className="mt-1 text-xs text-gray-500">Large files upload directly to Drive in chunks — no size worries</p>
          </>
        )}
      </div>

      {items.length > 0 && (
        <ul className="mt-6 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <img src={item.previewUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-gray-200">{item.file.name}</p>
                  <span className="shrink-0 text-xs text-gray-500">{formatBytes(item.file.size)}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.status === 'error' ? 'bg-red-500' : item.status === 'done' ? 'bg-emerald-500' : 'bg-purple-500'
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.status === 'error' && <p className="mt-1 text-xs text-red-400">{item.error}</p>}
              </div>
              <div className="shrink-0">
                {item.status === 'uploading' && <Loader2 className="size-5 animate-spin text-purple-400" />}
                {item.status === 'queued' && <Loader2 className="size-5 animate-spin text-gray-500" />}
                {item.status === 'done' && <CheckCircle2 className="size-5 text-emerald-500" />}
                {item.status === 'error' && (
                  <button
                    onClick={() => void runUpload(item)}
                    title="Retry"
                    className="text-gray-400 transition hover:text-purple-300"
                  >
                    <RotateCw className="size-5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
