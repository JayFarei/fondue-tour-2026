'use client';
/* eslint-disable next/no-html-link-for-pages -- vinext's Link prefetch currently throws at runtime. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  Camera,
  Check,
  CircleAlert,
  Film,
  Images,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MapPinned,
  Navigation,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { assetPath } from '@/lib/asset-path';
import { CheeseSaverMap, type GalleryMedia } from '@/components/cheese-saver-map';

type View = 'gallery' | 'map' | 'upload';
type Draft = {
  id: string;
  file: File;
  previewUrl: string;
  mediaKind: 'image' | 'video';
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: 'embedded' | 'device' | null;
  includeLocation: boolean;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  caption: string;
  state: 'ready' | 'uploading' | 'done' | 'error';
  error: string | null;
};

const supportedTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
]);

const typeByExtension: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};

function normalizedFile(file: File) {
  if (supportedTypes.has(file.type.toLowerCase())) return file;
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const type = typeByExtension[extension];
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

function dimensionsFor(file: File, kind: 'image' | 'video') {
  if (kind === 'image') {
    return createImageBitmap(file)
      .then((image) => {
        const dimensions = { width: image.width, height: image.height, durationSeconds: null };
        image.close();
        return dimensions;
      })
      .catch(() => ({ width: null, height: null, durationSeconds: null }));
  }

  return new Promise<{ width: number | null; height: number | null; durationSeconds: number | null }>((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const finish = (value: { width: number | null; height: number | null; durationSeconds: number | null }) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish({
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
    });
    video.onerror = () => finish({ width: null, height: null, durationSeconds: null });
    video.src = url;
  });
}

async function makeDraft(rawFile: File): Promise<Draft | null> {
  const file = normalizedFile(rawFile);
  if (!supportedTypes.has(file.type.toLowerCase())) return null;
  const mediaKind = file.type.startsWith('video/') ? 'video' : 'image';
  let latitude: number | null = null;
  let longitude: number | null = null;
  let capturedAt = file.lastModified ? new Date(file.lastModified).toISOString() : null;

  if (mediaKind === 'image') {
    try {
      const exifr = await import('exifr');
      const [location, dates] = await Promise.all([
        exifr.gps(file).catch(() => null),
        exifr.parse(file, ['DateTimeOriginal', 'CreateDate']).catch(() => null),
      ]);
      latitude = location?.latitude ?? null;
      longitude = location?.longitude ?? null;
      const embeddedDate = dates?.DateTimeOriginal ?? dates?.CreateDate;
      if (embeddedDate instanceof Date && !Number.isNaN(embeddedDate.valueOf())) capturedAt = embeddedDate.toISOString();
    } catch {
      // A missing or unsupported metadata block is normal and should not block the file.
    }
  }

  const dimensions = await dimensionsFor(file, mediaKind);
  const hasLocation = latitude !== null && longitude !== null;
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    mediaKind,
    capturedAt,
    latitude,
    longitude,
    locationSource: hasLocation ? 'embedded' : null,
    includeLocation: hasLocation,
    ...dimensions,
    caption: '',
    state: 'ready',
    error: null,
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return 'Date unknown';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function mediaUrl(id: string) {
  return `/api/cheese-saver/media/${id}`;
}

function UnlockPanel({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [website, setWebsite] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function unlock(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch('/api/cheese-saver/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, website }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Cheese Saver stayed locked.');
      onUnlocked();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cheese Saver stayed locked.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="cheese-lock-card">
      <div className="cheese-lock-icon"><LockKeyhole className="size-7" /></div>
      <p className="eyebrow">Private tour memories</p>
      <h1 className="display-title">Unlock Cheese Saver</h1>
      <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">The gallery and uploader share one tour password. No account or email is needed.</p>
      <form onSubmit={unlock} className="mt-7 space-y-4">
        <label className="block text-left text-sm font-semibold" htmlFor="cheese-password">Tour password</label>
        <Input
          id="cheese-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-12 rounded-xl bg-white px-4 text-base"
          required
        />
        <label className="cheese-honeypot" aria-hidden="true">
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
        </label>
        {message ? <p className="cheese-error"><CircleAlert className="size-4 shrink-0" />{message}</p> : null}
        <Button type="submit" disabled={working || !password} className="h-12 w-full rounded-xl bg-[#d9572b] text-base hover:bg-[#bd4420]">
          {working ? <LoaderCircle className="animate-spin" /> : <LockKeyhole />} Unlock
        </Button>
      </form>
      <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Failed attempts are rate-limited.</p>
    </div>
  );
}

function GalleryPanel({ media, loading, onSelect }: { media: GalleryMedia[]; loading: boolean; onSelect: (item: GalleryMedia) => void }) {
  if (loading) return <div className="cheese-empty"><LoaderCircle className="mx-auto size-7 animate-spin" /><p>Loading the cheese vault…</p></div>;
  if (!media.length) return <div className="cheese-empty"><Images className="mx-auto size-8" /><p className="font-semibold">No memories saved yet</p><p className="text-muted-foreground">Upload the first photo or video from the tour.</p></div>;

  return (
    <div className="cheese-gallery">
      {media.map((item) => (
        <button key={item.id} type="button" className="cheese-media-card" onClick={() => onSelect(item)}>
          <div className="cheese-media-frame">
            {item.mediaKind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(item.id)} alt={item.caption || item.originalName} loading="lazy" />
            ) : (
              <video src={mediaUrl(item.id)} muted playsInline preload="metadata" aria-label={item.caption || item.originalName} />
            )}
            <span className="cheese-kind-badge">{item.mediaKind === 'video' ? <Film /> : <Camera />}{item.mediaKind}</span>
            {item.latitude !== null ? <span className="cheese-location-badge"><MapPinned />Mapped</span> : null}
          </div>
          <span className="cheese-media-copy">
            <strong>{item.caption || item.originalName}</strong>
            <small>{formatDate(item.capturedAt || item.uploadedAt)}{item.credit ? ` · ${item.credit}` : ''}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function UploadPanel({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const draftsRef = useRef<Draft[]>([]);
  const [credit, setCredit] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  useEffect(() => () => draftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.previewUrl)), []);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setPreparing(true);
    setNotice(null);
    const prepared = (await Promise.all(Array.from(files).map(makeDraft))).filter((draft): draft is Draft => Boolean(draft));
    setDrafts((current) => [...current, ...prepared].slice(0, 20));
    if (prepared.length !== files.length) setNotice('Some files were skipped because their format is not supported.');
    setPreparing(false);
    if (input.current) input.current.value = '';
  }

  function updateDraft(id: string, update: Partial<Draft>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...update } : draft));
  }

  function removeDraft(id: string) {
    setDrafts((current) => {
      const removed = current.find((draft) => draft.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((draft) => draft.id !== id);
    });
  }

  function applyDeviceLocation(id: string) {
    if (!navigator.geolocation) {
      updateDraft(id, { error: 'Location is not available on this device.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => updateDraft(id, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        locationSource: 'device',
        includeLocation: true,
        error: null,
      }),
      () => updateDraft(id, { error: 'Location permission was not granted.' }),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  async function uploadAll() {
    const ready = drafts.filter((draft) => draft.state === 'ready' || draft.state === 'error');
    if (!ready.length) return;
    setUploading(true);
    setNotice(null);
    let completed = 0;

    for (const draft of ready) {
      updateDraft(draft.id, { state: 'uploading', error: null });
      const metadata = {
        name: draft.file.name,
        size: draft.file.size,
        width: draft.width,
        height: draft.height,
        durationSeconds: draft.durationSeconds,
        capturedAt: draft.capturedAt,
        latitude: draft.includeLocation ? draft.latitude : null,
        longitude: draft.includeLocation ? draft.longitude : null,
        locationSource: draft.includeLocation ? draft.locationSource : null,
        caption: draft.caption,
        credit,
        website: '',
      };
      try {
        const response = await fetch('/api/cheese-saver/media', {
          method: 'POST',
          headers: {
            'content-type': draft.file.type,
            'x-cheese-metadata': encodeURIComponent(JSON.stringify(metadata)),
          },
          body: draft.file,
        });
        const result = await response.json() as { message?: string };
        if (!response.ok) throw new Error(result.message || 'Upload failed.');
        updateDraft(draft.id, { state: 'done' });
        completed += 1;
      } catch (error) {
        updateDraft(draft.id, { state: 'error', error: error instanceof Error ? error.message : 'Upload failed.' });
      }
    }

    setUploading(false);
    if (completed) {
      await onUploaded();
      setNotice(`${completed} ${completed === 1 ? 'memory' : 'memories'} saved.`);
    }
  }

  return (
    <div className="cheese-upload-layout">
      <div className="cheese-drop-card">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
          multiple
          className="sr-only"
          onChange={(event) => void addFiles(event.target.files)}
        />
        <div className="cheese-upload-icon"><Upload className="size-7" /></div>
        <h2 className="text-xl font-bold">Add tour memories</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose up to 20 photos or videos. Embedded photo locations are detected on your device before upload.</p>
        <Button type="button" onClick={() => input.current?.click()} disabled={preparing || uploading} className="mt-5 h-11 rounded-xl bg-[#d9572b] px-5 hover:bg-[#bd4420]">
          {preparing ? <LoaderCircle className="animate-spin" /> : <Images />} Choose photos or videos
        </Button>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Images up to 25 MB · videos up to 100 MB · location is optional</p>
      </div>

      {drafts.length ? (
        <div className="space-y-4">
          <label className="block" htmlFor="cheese-credit">
            <span className="mb-2 block text-sm font-semibold">Your name <span className="font-normal text-muted-foreground">(optional)</span></span>
            <Input id="cheese-credit" value={credit} onChange={(event) => setCredit(event.target.value.slice(0, 80))} placeholder="Who took these?" className="h-11 bg-white" />
          </label>
          <div className="space-y-3">
            {drafts.map((draft) => (
              <article key={draft.id} className="cheese-draft">
                <div className="cheese-draft-preview">
                  {draft.mediaKind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.previewUrl} alt="" />
                  ) : <video src={draft.previewUrl} muted playsInline preload="metadata" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-semibold">{draft.file.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(draft.file.size)} · {formatDate(draft.capturedAt)}</p></div>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeDraft(draft.id)} disabled={uploading} aria-label={`Remove ${draft.file.name}`}><X /></Button>
                  </div>
                  <Input value={draft.caption} onChange={(event) => updateDraft(draft.id, { caption: event.target.value.slice(0, 280) })} placeholder="Caption (optional)" className="mt-3 h-10 bg-white" />
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {draft.latitude !== null ? (
                      <label className="cheese-location-toggle">
                        <input type="checkbox" checked={draft.includeLocation} onChange={(event) => updateDraft(draft.id, { includeLocation: event.target.checked })} />
                        <MapPinned className="size-3.5" /> {draft.locationSource === 'embedded' ? 'Photo location found' : 'Using current location'}
                      </label>
                    ) : (
                      <button type="button" className="cheese-location-action" onClick={() => applyDeviceLocation(draft.id)}><Navigation className="size-3.5" /> Use current location</button>
                    )}
                    {draft.state === 'uploading' ? <span className="flex items-center gap-1.5 text-[#396b67]"><LoaderCircle className="size-3.5 animate-spin" />Saving</span> : null}
                    {draft.state === 'done' ? <span className="flex items-center gap-1.5 text-[#396b67]"><Check className="size-3.5" />Saved</span> : null}
                  </div>
                  {draft.error ? <p className="cheese-error mt-3"><CircleAlert className="size-4 shrink-0" />{draft.error}</p> : null}
                </div>
              </article>
            ))}
          </div>
          <Button type="button" onClick={() => void uploadAll()} disabled={uploading || !drafts.some((draft) => draft.state !== 'done')} className="h-12 w-full rounded-xl bg-[#173230] text-base hover:bg-[#244b48]">
            {uploading ? <LoaderCircle className="animate-spin" /> : <Upload />} Save to Cheese Saver
          </Button>
        </div>
      ) : null}
      {notice ? <p className="cheese-notice">{notice}</p> : null}
    </div>
  );
}

export function CheeseSaver() {
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [view, setView] = useState<View>(() => {
    if (typeof window === 'undefined') return 'gallery';
    const requested = new URLSearchParams(window.location.search).get('view');
    return requested === 'upload' || requested === 'map' ? requested : 'gallery';
  });
  const [media, setMedia] = useState<GalleryMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GalleryMedia | null>(null);

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    setGalleryError(null);
    try {
      const response = await fetch('/api/cheese-saver/media', { cache: 'no-store' });
      if (response.status === 401) {
        setUnlocked(false);
        return;
      }
      if (!response.ok) throw new Error('Gallery unavailable');
      const result = await response.json() as { media: GalleryMedia[] };
      setMedia(result.media);
    } catch {
      setGalleryError('The gallery could not be loaded. Please try again.');
    } finally {
      setLoadingMedia(false);
    }
  }, []);

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch('/api/cheese-saver/session', { cache: 'no-store' });
        const result = await response.json() as { unlocked: boolean };
        setUnlocked(result.unlocked);
        if (result.unlocked) await loadMedia();
      } catch {
        setUnlocked(false);
      } finally {
        setChecking(false);
      }
    }

    void checkSession();
  }, [loadMedia]);

  const mappedCount = useMemo(() => media.filter((item) => item.latitude !== null).length, [media]);
  const selectMedia = useCallback((item: GalleryMedia) => setSelected(item), []);

  function changeView(next: string | number) {
    const value = String(next) as View;
    setView(value);
    const url = new URL(window.location.href);
    url.searchParams.set('view', value);
    window.history.replaceState({}, '', url);
  }

  async function logout() {
    await fetch('/api/cheese-saver/logout', { method: 'POST' });
    setUnlocked(false);
    setMedia([]);
  }

  return (
    <main className="cheese-page min-h-screen">
      <header className="cheese-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <a href="/" className="flex min-h-11 items-center gap-3 text-white">
            <Image src={assetPath('/brand/fondue-tour-crest.png')} alt="" width={205} height={298} className="h-10 w-auto" />
            <span><strong className="block font-[var(--font-display)] text-lg uppercase tracking-wide">Cheese Saver</strong><small className="block text-white/55">Fondue Tour ’26</small></span>
          </a>
          <div className="flex items-center gap-2">
            <a href="/" className="cheese-back"><ArrowLeft /> Roadbook</a>
            {unlocked ? <Button type="button" variant="ghost" size="icon" onClick={() => void logout()} className="text-white hover:bg-white/10 hover:text-white" aria-label="Lock Cheese Saver"><LogOut /></Button> : null}
          </div>
        </div>
      </header>

      {checking ? <div className="grid min-h-[70vh] place-items-center"><LoaderCircle className="size-8 animate-spin text-[#d9572b]" /></div> : null}
      {!checking && !unlocked ? <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl place-items-center px-5 py-12 sm:px-8"><UnlockPanel onUnlocked={() => { setUnlocked(true); void loadMedia(); }} /></section> : null}

      {!checking && unlocked ? (
        <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="eyebrow">The shared cheese vault</p><h1 className="display-title">Tour memories</h1><p className="mt-3 text-sm text-muted-foreground">{media.length} saved · {mappedCount} on the route map</p></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-[#396b67]" /> Password session expires after seven days</div>
          </div>

          <Tabs value={view} onValueChange={changeView}>
            <TabsList className="cheese-tabs" aria-label="Cheese Saver views">
              <TabsTrigger value="gallery" className="cheese-tab"><Images /> Gallery</TabsTrigger>
              <TabsTrigger value="map" className="cheese-tab"><MapPinned /> Map</TabsTrigger>
              <TabsTrigger value="upload" className="cheese-tab"><Upload /> Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="gallery" className="mt-6">
              {galleryError ? <p className="cheese-error mb-4"><CircleAlert className="size-4 shrink-0" />{galleryError}</p> : null}
              <GalleryPanel media={media} loading={loadingMedia} onSelect={selectMedia} />
            </TabsContent>
            <TabsContent value="map" className="mt-6"><CheeseSaverMap media={media} onSelect={selectMedia} /></TabsContent>
            <TabsContent value="upload" className="mt-6"><UploadPanel onUploaded={loadMedia} /></TabsContent>
          </Tabs>
        </section>
      ) : null}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="cheese-lightbox max-h-[calc(100vh-2rem)] max-w-5xl overflow-auto bg-[#0e2321] p-3 text-white sm:p-4">
          {selected ? (
            <>
              <DialogHeader className="pr-10">
                <DialogTitle className="text-lg text-white">{selected.caption || selected.originalName}</DialogTitle>
                <DialogDescription className="text-white/55">{formatDate(selected.capturedAt || selected.uploadedAt)}{selected.credit ? ` · ${selected.credit}` : ''}</DialogDescription>
              </DialogHeader>
              <div className="cheese-lightbox-media">
                {selected.mediaKind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(selected.id)} alt={selected.caption || selected.originalName} />
                ) : (
                  // Uploaded tour videos do not have authored caption tracks.
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={mediaUrl(selected.id)} controls playsInline preload="metadata" />
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-white/55">
                <span>{formatBytes(selected.byteSize)}</span>
                {selected.latitude !== null ? <span className="flex items-center gap-1"><MapPinned className="size-3.5" /> Saved on the tour map</span> : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
