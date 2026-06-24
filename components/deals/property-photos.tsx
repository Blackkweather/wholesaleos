"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Camera, Plus, Trash2, RefreshCw, Loader2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import type { PropertyPhoto } from "@/types";

export function PropertyPhotos({ dealId }: { dealId: string }) {
  const [photos, setPhotos] = React.useState<PropertyPhoto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [urlInput, setUrlInput] = React.useState("");
  const [labelInput, setLabelInput] = React.useState("");
  const [current, setCurrent] = React.useState(0);
  const [lightbox, setLightbox] = React.useState(false);

  const load = React.useCallback(async (showToast = false) => {
    try {
      const res = await fetch(`/api/deals/${dealId}/photos`);
      const json = await res.json();
      if (json?.data?.photos) setPhotos(json.data.photos);
      if (showToast) toast.success("Photos refreshed");
    } catch {
      if (showToast) toast.error("Could not load photos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dealId]);

  React.useEffect(() => { load(); }, [load]);

  const addPhoto = async () => {
    if (!urlInput.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim(), label: labelInput.trim() || undefined }),
      });
      const json = await res.json();
      if (json?.data?.photos) {
        setPhotos(json.data.photos);
        toast.success("Photo added");
      }
    } catch {
      toast.error("Could not add photo");
    } finally {
      setAdding(false);
      setUrlInput("");
      setLabelInput("");
    }
  };

  const removePhoto = async (url: string) => {
    try {
      const res = await fetch(`/api/deals/${dealId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove: url }),
      });
      const json = await res.json();
      if (json?.data?.photos) {
        setPhotos(json.data.photos);
        setCurrent(0);
        toast.success("Photo removed");
      }
    } catch {
      toast.error("Could not remove photo");
    }
  };

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;

  const hasPhotos = photos.length > 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4 text-primary" />
              Property Photos
              {hasPhotos && (
                <Badge variant="secondary">{photos.length}</Badge>
              )}
            </CardTitle>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => { setRefreshing(true); load(true); }}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {hasPhotos ? (
            <div className="space-y-3">
              {/* Main image */}
              <div className="relative group">
                <div
                  className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-muted cursor-pointer"
                  onClick={() => setLightbox(true)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photos[current].url}
                    alt={photos[current].label ?? "Property"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {photos[current].label && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                      <span className="text-xs font-medium text-white">{photos[current].label}</span>
                      {photos[current].source && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">{photos[current].source}</Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* Nav arrows */}
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c - 1 + photos.length) % photos.length); }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c + 1) % photos.length); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}

                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); removePhoto(photos[current].url); }}
                  className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              {/* Thumbnails */}
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map((p, i) => (
                    <button
                      key={p.url}
                      onClick={() => setCurrent(i)}
                      className={`shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                        i === current ? "border-primary" : "border-transparent hover:border-border"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={p.label ?? `Photo ${i + 1}`}
                        className="h-14 w-20 object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
              <Camera className="mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No photos yet. Add a Google Maps API key for auto Street View, or paste image URLs below.
              </p>
            </div>
          )}

          {/* Add photo form */}
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste image URL..."
                className="text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPhoto(); } }}
              />
              <Input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder="Label"
                className="w-28 text-sm"
              />
              <Button variant="outline" size="sm" onClick={addPhoto} disabled={adding || !urlInput.trim()}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lightbox */}
      {lightbox && photos.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(false)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[current].url}
            alt={photos[current].label ?? "Property"}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c - 1 + photos.length) % photos.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c + 1) % photos.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <div className="absolute bottom-4 text-center text-sm text-white/70">
            {current + 1} / {photos.length}
            {photos[current].label && ` — ${photos[current].label}`}
          </div>
        </div>
      )}
    </>
  );
}
