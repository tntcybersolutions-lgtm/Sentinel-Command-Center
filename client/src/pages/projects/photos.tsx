import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Upload, X, Star, Trash2, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";

interface PhotoRow {
  id: string;
  fileName: string;
  storageUrl: string;
  thumbnailUrl?: string | null;
  caption?: string | null;
  capturedAt?: string | null;
  isHero?: boolean;
  width?: number;
  height?: number;
}

export default function ProjectPhotosPage() {
  const [, params] = useRoute("/projects/:id/photos");
  const [, setLocation] = useLocation();
  const projectId = params?.id || "";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data: photos = [], isLoading } = useQuery<PhotoRow[]>({
    queryKey: [`/api/projects/${projectId}/photos`],
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: async (file: File) => {
      // For v1 we accept a storageUrl passed in (object storage upload happens
      // elsewhere). In a typical flow the client would PUT to a presigned URL
      // then POST the resulting URL here. Until that wire-up lands we surface
      // a Data URL so the photo at least renders to the user immediately.
      const dataUrl = await fileToDataUrl(file);
      const body = {
        fileName: file.name,
        contentType: file.type,
        storageUrl: dataUrl,
        bytes: file.size,
      };
      const res = await fetch(`/api/projects/${projectId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/photos`] }),
  });

  const remove = useMutation({
    mutationFn: async (photoId: string) => {
      const res = await fetch(`/api/projects/${projectId}/photos/${photoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/photos`] }),
  });

  const setHero = useMutation({
    mutationFn: async (photoId: string) => {
      const res = await fetch(`/api/projects/${projectId}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHero: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/photos`] }),
  });

  function handleFilesPicked(files: FileList | null) {
    if (!files) return;
    Array.from(files).slice(0, 25).forEach((f) => create.mutate(f));
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-black/95 text-zinc-100">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setLocation(`/projects/${projectId}/cockpit`)}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"
            data-testid="photos-back"
          >
            <ArrowLeft className="h-4 w-4" /> Back to project
          </button>
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Project Photos
          </h1>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition"
            data-testid="photos-upload"
          >
            <Upload className="h-4 w-4" /> Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFilesPicked(e.target.files)}
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-md bg-zinc-900 animate-pulse" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <EmptyState onUploadClick={() => fileInputRef.current?.click()} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setLightboxIdx(idx)}
                className="group relative aspect-square rounded-md overflow-hidden border border-white/10 bg-zinc-900"
                data-testid={`photo-tile-${p.id}`}
              >
                <img
                  src={p.thumbnailUrl || p.storageUrl}
                  alt={p.caption || p.fileName}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:brightness-110 transition"
                />
                {p.isHero && (
                  <span className="absolute top-1 left-1 rounded-full bg-amber-500/90 text-amber-950 px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current" /> Hero
                  </span>
                )}
                {p.caption && (
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent text-[11px] text-white px-2 py-2 line-clamp-2 text-left">
                    {p.caption}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {lightboxIdx !== null && photos[lightboxIdx] && (
          <Lightbox
            photo={photos[lightboxIdx]}
            hasPrev={lightboxIdx > 0}
            hasNext={lightboxIdx < photos.length - 1}
            onPrev={() => setLightboxIdx((i) => (i !== null && i > 0 ? i - 1 : i))}
            onNext={() => setLightboxIdx((i) => (i !== null && i < photos.length - 1 ? i + 1 : i))}
            onClose={() => setLightboxIdx(null)}
            onSetHero={() => setHero.mutate(photos[lightboxIdx].id)}
            onDelete={() => {
              if (!confirm("Delete this photo?")) return;
              remove.mutate(photos[lightboxIdx].id);
              setLightboxIdx(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="border border-white/10 bg-black/40 rounded-lg py-12 px-6 flex flex-col items-center gap-3 text-zinc-400">
      <Camera className="h-10 w-10 text-zinc-700" />
      <div className="text-sm">No photos yet for this project</div>
      <button
        onClick={onUploadClick}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition"
        data-testid="empty-photos-upload"
      >
        <Upload className="h-3.5 w-3.5" />
        Upload your first photo
      </button>
    </div>
  );
}

function Lightbox(props: {
  photo: PhotoRow;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onSetHero: () => void;
  onDelete: () => void;
}) {
  const { photo, hasPrev, hasNext, onPrev, onNext, onClose, onSetHero, onDelete } = props;
  return (
    <div
      role="dialog"
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "ArrowLeft" && hasPrev) onPrev();
        if (e.key === "ArrowRight" && hasNext) onNext();
      }}
      tabIndex={0}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="text-sm text-zinc-400 truncate">
          {photo.fileName} {photo.capturedAt ? `· ${new Date(photo.capturedAt).toLocaleDateString()}` : ""}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onSetHero} className="text-xs px-2 py-1 rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 inline-flex items-center gap-1" data-testid="lightbox-hero">
            <Star className="h-3 w-3" /> Set Hero
          </button>
          <button onClick={onDelete} className="text-xs px-2 py-1 rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1" data-testid="lightbox-delete">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
          <button onClick={onClose} className="ml-1 p-1.5 rounded-md hover:bg-white/10" data-testid="lightbox-close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative flex items-center justify-center">
        {hasPrev && (
          <button onClick={onPrev} className="absolute left-2 p-2 rounded-full bg-white/10 hover:bg-white/20" data-testid="lightbox-prev">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <img src={photo.storageUrl} alt={photo.caption || photo.fileName} className="max-h-[90vh] max-w-[95vw] object-contain" />
        {hasNext && (
          <button onClick={onNext} className="absolute right-2 p-2 rounded-full bg-white/10 hover:bg-white/20" data-testid="lightbox-next">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      {photo.caption && (
        <div className="px-6 py-3 text-center text-sm text-zinc-300 border-t border-white/10">{photo.caption}</div>
      )}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

