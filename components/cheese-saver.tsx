'use client';
/* eslint-disable next/no-html-link-for-pages -- vinext's Link prefetch currently throws at runtime. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Archive,
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
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { assetPath } from '@/lib/asset-path';
import { CheeseSaverMap, type GalleryMedia } from '@/components/cheese-saver-map';
import { isTourerId, tourerFor, tourers, type TourerId } from '@/lib/tourers';
import {
  allGalleryFilter,
  filterGalleryMedia,
  galleryFilterSearchParams,
  mediaDayKey,
  tourGalleryDayKeys,
  tourGalleryDays,
  type GalleryFilter,
} from '@/lib/cheese-saver/filters';

type View = 'gallery' | 'map' | 'upload';
type ShareState = 'idle' | 'preparing' | 'ready' | 'sharing';
type Draft = {
  id: string;
  uploadId: string;
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
  uploadProgress: number;
  error: string | null;
};

const supportedTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
]);
const maximumPhotoShareBytes = 250 * 1024 * 1024;

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

async function embeddedVideoLocation(file: File) {
  const sampleSize = 2 * 1024 * 1024;
  const slices = [file.slice(0, Math.min(file.size, sampleSize))];
  if (file.size > sampleSize) slices.push(file.slice(Math.max(0, file.size - sampleSize)));
  const text = (await Promise.all(slices.map((slice) => slice.text()))).join('');
  const match = /([+-]\d{2}(?:\.\d+)?)([+-]\d{3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?\//.exec(text);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
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
  } else {
    const location = await embeddedVideoLocation(file).catch(() => null);
    latitude = location?.latitude ?? null;
    longitude = location?.longitude ?? null;
  }

  const dimensions = await dimensionsFor(file, mediaKind);
  const hasLocation = latitude !== null && longitude !== null;
  return {
    id: crypto.randomUUID(),
    uploadId: crypto.randomUUID(),
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
    uploadProgress: 0,
    error: null,
  };
}

function uploadMediaFile(
  draft: Draft,
  metadata: Record<string, unknown>,
  onProgress: (percent: number) => void,
  registerRequest: (request: XMLHttpRequest | null) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/cheese-saver/media');
    request.timeout = 30 * 60 * 1_000;
    request.setRequestHeader('content-type', draft.file.type);
    request.setRequestHeader('x-cheese-metadata', encodeURIComponent(JSON.stringify(metadata)));
    registerRequest(request);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener('load', () => {
      registerRequest(null);
      let result: { message?: string } = {};
      try {
        result = JSON.parse(request.responseText) as { message?: string };
      } catch {
        // A response without JSON falls back to the status-based message below.
      }
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(result.message || (request.status === 401 ? 'Cheese Saver locked. Unlock it and try again.' : 'Upload failed.')));
      }
    });
    request.addEventListener('error', () => {
      registerRequest(null);
      reject(new Error('The upload connection was interrupted. Try again.'));
    });
    request.addEventListener('abort', () => {
      registerRequest(null);
      reject(new Error('The upload was stopped.'));
    });
    request.addEventListener('timeout', () => {
      registerRequest(null);
      reject(new Error('The upload timed out. Try again on a stronger connection.'));
    });
    request.send(draft.file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return 'Date unknown';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Zurich' }).format(new Date(value));
}

function mediaUrl(id: string) {
  return `/api/cheese-saver/media/${id}`;
}

const galleryShortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function galleryTimestamp(item: GalleryMedia) {
  const timestamp = new Date(item.capturedAt || item.uploadedAt).valueOf();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
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

function GalleryPanel({ media, loading, filter, onFilterChange, onSelect }: {
  media: GalleryMedia[];
  loading: boolean;
  filter: GalleryFilter;
  onFilterChange: (filter: GalleryFilter) => void;
  onSelect: (item: GalleryMedia) => void;
}) {
  const sortedMedia = useMemo(() => [...media].sort((left, right) => galleryTimestamp(left) - galleryTimestamp(right)), [media]);
  const authorCounts = useMemo(() => {
    const result = new Map<TourerId | 'unknown', number>();
    for (const item of sortedMedia) {
      const key = isTourerId(item.authorId) ? item.authorId : 'unknown';
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  }, [sortedMedia]);
  const authorMedia = useMemo(() => filterGalleryMedia(sortedMedia, { ...filter, day: 'all' }), [filter, sortedMedia]);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of authorMedia) {
      const key = mediaDayKey(item);
      const group = tourGalleryDayKeys.has(key) ? key : 'other';
      result.set(group, (result.get(group) ?? 0) + 1);
    }
    return result;
  }, [authorMedia]);

  if (loading) return <div className="cheese-empty"><LoaderCircle className="mx-auto size-7 animate-spin" /><p>Loading the cheese vault…</p></div>;
  if (!media.length) return <div className="cheese-empty"><Images className="mx-auto size-8" /><p className="font-semibold">No memories saved yet</p><p className="text-muted-foreground">Upload the first photo or video from the tour.</p></div>;

  const tourGroups = tourGalleryDays.map((day) => ({ ...day, items: authorMedia.filter((item) => mediaDayKey(item) === day.key) }));
  const otherItems = authorMedia.filter((item) => !tourGalleryDayKeys.has(mediaDayKey(item)));
  const otherItemsByDate = new Map<string, GalleryMedia[]>();
  for (const item of otherItems) {
    const key = mediaDayKey(item);
    otherItemsByDate.set(key, [...(otherItemsByDate.get(key) ?? []), item]);
  }
  const chronologicalGroups = [
    ...tourGroups,
    ...Array.from(otherItemsByDate, ([dateKey, items]) => ({
      key: `other-${dateKey}`,
      label: 'Other date',
      dateLabel: dateKey === 'other' ? 'Date unknown' : galleryShortDateFormatter.format(new Date(items[0].capturedAt || items[0].uploadedAt)),
      items,
    })),
  ].filter((group) => group.items.length).sort((left, right) => galleryTimestamp(left.items[0]) - galleryTimestamp(right.items[0]));
  const visibleGroups = filter.day === 'all'
    ? chronologicalGroups
    : filter.day === 'other'
      ? [{ key: 'other', label: 'Other dates', dateLabel: 'Outside the tour', items: otherItems }]
      : tourGroups.filter((group) => group.key === filter.day);
  const visibleCount = visibleGroups.reduce((total, group) => total + group.items.length, 0);

  return (
    <div>
      <div className="cheese-gallery-toolbar">
        <div className="cheese-gallery-filter-stack">
          <div className="cheese-author-filters" aria-label="Filter memories by tourer">
            <button type="button" className={filter.author === 'all' ? 'is-active' : ''} aria-pressed={filter.author === 'all'} onClick={() => onFilterChange({ ...filter, author: 'all', excludeAuthor: false })}>
              <span className="cheese-author-all"><Images /></span><strong>Everyone</strong><small>{media.length}</small>
            </button>
            {tourers.map((tourer) => (
              <button key={tourer.id} type="button" className={filter.author === tourer.id ? 'is-active' : ''} aria-pressed={filter.author === tourer.id} onClick={() => onFilterChange({ ...filter, author: tourer.id })}>
                <Image src={assetPath(tourer.portrait)} alt="" width={52} height={52} /><strong>{tourer.name}</strong><small>{authorCounts.get(tourer.id) ?? 0}</small>
              </button>
            ))}
            {authorCounts.get('unknown') ? (
              <button type="button" className={filter.author === 'unknown' ? 'is-active' : ''} aria-pressed={filter.author === 'unknown'} onClick={() => onFilterChange({ ...filter, author: 'unknown' })}>
                <span className="cheese-author-all">?</span><strong>Unknown</strong><small>{authorCounts.get('unknown')}</small>
              </button>
            ) : null}
          </div>
          {filter.author !== 'all' ? (
            <div className="cheese-author-mode" aria-label="Choose how to apply the tourer filter">
              <span>{tourerFor(filter.author)?.name ?? 'Unknown author'}</span>
              <button type="button" className={!filter.excludeAuthor ? 'is-active' : ''} aria-pressed={!filter.excludeAuthor} onClick={() => onFilterChange({ ...filter, excludeAuthor: false })}>Only</button>
              <button type="button" className={filter.excludeAuthor ? 'is-active' : ''} aria-pressed={filter.excludeAuthor} onClick={() => onFilterChange({ ...filter, excludeAuthor: true })}>Exclude</button>
            </div>
          ) : null}
          <div className="cheese-day-filters" aria-label="Filter memories by tour day">
            <button type="button" className={filter.day === 'all' ? 'is-active' : ''} aria-pressed={filter.day === 'all'} onClick={() => onFilterChange({ ...filter, day: 'all' })}>
              <strong>All days</strong><span>{authorMedia.length}</span>
            </button>
            {tourGalleryDays.map((day) => (
              <button key={day.key} type="button" className={filter.day === day.key ? 'is-active' : ''} aria-pressed={filter.day === day.key} onClick={() => onFilterChange({ ...filter, day: day.key })}>
                <strong>{day.label}</strong><small>{day.dateLabel}</small><span>{counts.get(day.key) ?? 0}</span>
              </button>
            ))}
            <button type="button" className={filter.day === 'other' ? 'is-active' : ''} aria-pressed={filter.day === 'other'} onClick={() => onFilterChange({ ...filter, day: 'other' })}>
              <strong>Other</strong><span>{counts.get('other') ?? 0}</span>
            </button>
          </div>
        </div>
        <p aria-live="polite">{visibleCount} {visibleCount === 1 ? 'memory' : 'memories'} · oldest first</p>
      </div>

      <div className="cheese-gallery-groups">
        {visibleGroups.map((group) => {
          const headingId = `cheese-gallery-${group.key}`;
          return (
          <section key={group.key} className="cheese-gallery-group" aria-labelledby={headingId}>
            <header>
              <div><h2 id={headingId}>{group.label}</h2><span>{group.dateLabel}</span></div>
              <small>{group.items.length} {group.items.length === 1 ? 'memory' : 'memories'}</small>
            </header>
            {group.items.length ? (
              <div className="cheese-gallery">
                {group.items.map((item) => {
                  const author = tourerFor(item.authorId);
                  return (
                  <button key={item.id} type="button" className="cheese-media-card" onClick={() => onSelect(item)} aria-label={`Open ${item.caption || item.originalName}, ${formatDate(item.capturedAt || item.uploadedAt)}${author ? `, by ${author.name}` : ''}`}>
                    <div className="cheese-media-frame">
                      {item.mediaKind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl(item.id)} alt={item.caption || item.originalName} loading="lazy" />
                      ) : (
                        <video src={mediaUrl(item.id)} muted playsInline preload="metadata" aria-label={item.caption || item.originalName} />
                      )}
                      {item.mediaKind === 'video' ? <span className="cheese-kind-badge"><Film />Video</span> : null}
                      {item.latitude !== null ? <span className="cheese-location-badge"><MapPinned /><span className="sr-only">Mapped</span></span> : null}
                      <span className="cheese-media-copy">
                        <strong>{item.caption || item.originalName}</strong>
                        <small>{formatDate(item.capturedAt || item.uploadedAt)}</small>
                        {author ? <span className="cheese-media-author"><Image src={assetPath(author.portrait)} alt="" width={28} height={28} />{author.name}</span> : item.credit ? <span className="cheese-media-author is-legacy">{item.credit}</span> : null}
                      </span>
                    </div>
                  </button>
                  );
                })}
              </div>
            ) : <div className="cheese-day-empty"><Camera /><span>No memories from this day yet.</span></div>}
          </section>
          );
        })}
      </div>
    </div>
  );
}

function UploadPanel({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const draftsRef = useRef<Draft[]>([]);
  const [authorId, setAuthorId] = useState<TourerId | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadBatch, setUploadBatch] = useState<{ current: number; total: number; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeUpload = useRef<XMLHttpRequest | null>(null);
  const cancelRequested = useRef(false);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  useEffect(() => () => {
    cancelRequested.current = true;
    activeUpload.current?.abort();
    activeUpload.current = null;
    draftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
  }, []);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!authorId) {
      setNotice('Choose your tourer before adding photos or videos.');
      return;
    }
    setPreparing(true);
    setNotice(null);
    const prepared = (await Promise.all(Array.from(files).map(makeDraft))).filter((draft): draft is Draft => Boolean(draft));
    setDrafts((current) => [...current, ...prepared]);
    if (prepared.length) {
      setNotice(`${prepared.length} ${prepared.length === 1 ? 'item is' : 'items are'} selected and ready to upload.`);
    }
    if (prepared.length !== files.length) {
      setNotice(prepared.length
        ? `${prepared.length} selected. Some files were skipped because their formats are unsupported.`
        : 'No files were added. Their formats are unsupported.');
    }
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
    if (!authorId) {
      setNotice('Choose your tourer before uploading.');
      return;
    }
    setUploading(true);
    setNotice(null);
    cancelRequested.current = false;
    let completed = 0;
    let failed = 0;

    for (const [index, draft] of ready.entries()) {
      if (cancelRequested.current) break;
      setUploadBatch({ current: index + 1, total: ready.length, name: draft.file.name });
      updateDraft(draft.id, { state: 'uploading', uploadProgress: 0, error: null });
      const metadata = {
        uploadId: draft.uploadId,
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
        authorId,
        website: '',
      };
      try {
        await uploadMediaFile(
          draft,
          metadata,
          (uploadProgress) => updateDraft(draft.id, { uploadProgress }),
          (request) => { activeUpload.current = request; },
        );
        updateDraft(draft.id, { state: 'done', uploadProgress: 100 });
        completed += 1;
      } catch (error) {
        if (cancelRequested.current) {
          updateDraft(draft.id, { state: 'ready', uploadProgress: 0, error: null });
          break;
        }
        failed += 1;
        updateDraft(draft.id, { state: 'error', uploadProgress: 0, error: error instanceof Error ? error.message : 'Upload failed.' });
      }
    }

    const wasCancelled = cancelRequested.current;
    activeUpload.current = null;
    setUploading(false);
    setUploadBatch(null);
    if (completed) {
      await onUploaded();
    }
    setNotice(wasCancelled
      ? `Upload stopped. ${completed ? `${completed} ${completed === 1 ? 'item was' : 'items were'} saved; ` : ''}the remaining items are ready to resume.`
      : failed
        ? `${completed} saved; ${failed} ${failed === 1 ? 'item needs' : 'items need'} another try.`
        : `Upload complete — ${completed} ${completed === 1 ? 'memory is' : 'memories are'} now in the gallery.`);
  }

  function cancelUpload() {
    cancelRequested.current = true;
    activeUpload.current?.abort();
  }

  const pendingCount = drafts.filter((draft) => draft.state === 'ready' || draft.state === 'error').length;
  const savedCount = drafts.filter((draft) => draft.state === 'done').length;

  return (
    <div className="cheese-upload-layout">
      <div className="cheese-drop-card">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
          multiple
          disabled={!authorId || preparing || uploading}
          className="sr-only"
          onChange={(event) => void addFiles(event.target.files)}
        />
        <p className="eyebrow">Step 1</p>
        <h2 className="mt-1 text-xl font-bold">Who’s uploading?</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose your Fondue Force avatar. It will be saved as the author of this batch.</p>
        <div className="cheese-author-picker" role="radiogroup" aria-label="Choose the author for this upload">
          {tourers.map((tourer) => (
            <label
              key={tourer.id}
              className={authorId === tourer.id ? 'is-selected' : ''}
              style={{ '--tourer-color': tourer.accent } as React.CSSProperties}
            >
              <input type="radio" name="cheese-author" value={tourer.id} checked={authorId === tourer.id} onChange={() => setAuthorId(tourer.id)} disabled={uploading} />
              <Image src={assetPath(tourer.portrait)} alt="" width={112} height={112} />
              <strong>{tourer.name}</strong>
              <small>{tourer.power}</small>
              <span><Check /></span>
            </label>
          ))}
        </div>
        <div className="cheese-upload-divider" />
        <div className="cheese-upload-icon"><Upload className="size-7" /></div>
        <p className="eyebrow">Step 2</p>
        <h2 className="mt-1 text-xl font-bold">Add tour memories</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose photos or videos. Embedded photo locations are detected on your device before upload.</p>
        <Button type="button" onClick={() => input.current?.click()} disabled={!authorId || preparing || uploading} className="mt-5 h-11 rounded-xl bg-[#d9572b] px-5 hover:bg-[#bd4420]">
          {preparing ? <LoaderCircle className="animate-spin" /> : <Images />} Choose photos or videos
        </Button>
        {!authorId ? <p className="mt-3 text-sm font-semibold text-[#9c3516]">Choose your avatar to continue.</p> : null}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Images up to 25 MB · videos up to 100 MB · location is optional</p>
      </div>

      {drafts.length ? (
        <div className="space-y-4">
          <div className={`cheese-upload-signal ${uploading ? 'is-uploading' : 'is-ready'}`}>
            <output className="cheese-upload-signal-copy" aria-live="polite">
              {uploading ? <LoaderCircle className="size-5 shrink-0 animate-spin" /> : <Check className="size-5 shrink-0" />}
              <span className="min-w-0">
                <strong>{uploading && uploadBatch ? `Uploading ${uploadBatch.current} of ${uploadBatch.total}` : pendingCount ? `${pendingCount} ready to upload` : `${savedCount} saved to the gallery`}</strong>
                <span>{uploading && uploadBatch ? uploadBatch.name : pendingCount ? 'Review the previews below, then tap the upload button.' : 'Upload complete. You can remove these confirmations when you are ready.'}</span>
              </span>
            </output>
            {uploading ? <button type="button" className="cheese-upload-stop" onClick={cancelUpload}><X />Stop</button> : null}
          </div>
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeDraft(draft.id)}
                      disabled={uploading}
                      aria-label={draft.state === 'done' ? `Dismiss saved confirmation for ${draft.file.name}` : `Remove ${draft.file.name} from upload`}
                      title={draft.state === 'done' ? 'Dismiss confirmation' : 'Remove from upload'}
                    ><X /></Button>
                  </div>
                  <Input value={draft.caption} onChange={(event) => updateDraft(draft.id, { caption: event.target.value.slice(0, 280) })} placeholder="Caption (optional)" className="mt-3 h-10 bg-white" />
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {draft.latitude !== null ? (
                      <label className="cheese-location-toggle">
                        <input type="checkbox" checked={draft.includeLocation} onChange={(event) => updateDraft(draft.id, { includeLocation: event.target.checked })} />
                        <MapPinned className="size-3.5" /> {draft.locationSource === 'embedded' ? 'File location found' : 'Using current location'}
                      </label>
                    ) : (
                      <button type="button" className="cheese-location-action" onClick={() => applyDeviceLocation(draft.id)}><Navigation className="size-3.5" /> Use current location</button>
                    )}
                    {draft.state === 'ready' ? <span className="cheese-upload-state is-ready"><Check />Selected</span> : null}
                    {draft.state === 'uploading' ? <span className="cheese-upload-state is-uploading"><LoaderCircle className="animate-spin" />Uploading {draft.uploadProgress}%</span> : null}
                    {draft.state === 'done' ? <span className="cheese-upload-state is-done"><Check />Saved to gallery</span> : null}
                    {draft.state === 'error' ? <span className="cheese-upload-state is-error"><CircleAlert />Needs retry</span> : null}
                  </div>
                  {draft.state === 'uploading' ? (
                    <progress className="cheese-upload-progress" aria-label={`Uploading ${draft.file.name}`} max={100} value={draft.uploadProgress}>{draft.uploadProgress}%</progress>
                  ) : null}
                  {draft.error ? <p className="cheese-error mt-3"><CircleAlert className="size-4 shrink-0" />{draft.error}</p> : null}
                </div>
              </article>
            ))}
          </div>
          <Button type="button" onClick={() => void uploadAll()} disabled={uploading || !pendingCount || !authorId} className="h-12 w-full rounded-xl bg-[#173230] text-base hover:bg-[#244b48]">
            {uploading ? <LoaderCircle className="animate-spin" /> : pendingCount ? <Upload /> : <Check />}
            {uploading && uploadBatch ? `Uploading ${uploadBatch.current} of ${uploadBatch.total}` : pendingCount ? `Upload ${pendingCount} ${pendingCount === 1 ? 'item' : 'items'}` : 'All selected items saved'}
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
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>(allGalleryFilter);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryNotice, setGalleryNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<GalleryMedia | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<ShareState>('idle');
  const [shareProgress, setShareProgress] = useState(0);
  const [preparingZip, setPreparingZip] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const preparedShareFiles = useRef<File[]>([]);
  const shareAbortController = useRef<AbortController | null>(null);
  const zipAbortController = useRef<AbortController | null>(null);

  const resetDownloadPreparation = useCallback(() => {
    zipAbortController.current?.abort();
    zipAbortController.current = null;
    shareAbortController.current?.abort();
    shareAbortController.current = null;
    preparedShareFiles.current = [];
    setShareState('idle');
    setShareProgress(0);
    setPreparingZip(false);
    setDownloadNotice(null);
    setDownloadError(null);
  }, []);

  const changeGalleryFilter = useCallback((filter: GalleryFilter) => {
    setGalleryFilter(filter);
    resetDownloadPreparation();
  }, [resetDownloadPreparation]);

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    setGalleryError(null);
    try {
      const response = await fetch('/api/cheese-saver/media', { cache: 'no-store' });
      if (response.status === 401) {
        setUnlocked(false);
        resetDownloadPreparation();
        return;
      }
      if (!response.ok) throw new Error('Gallery unavailable');
      const result = await response.json() as { media: GalleryMedia[] };
      setMedia(result.media);
      resetDownloadPreparation();
    } catch {
      setGalleryError('The gallery could not be loaded. Please try again.');
    } finally {
      setLoadingMedia(false);
    }
  }, [resetDownloadPreparation]);

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
  const exportMedia = useMemo(() => filterGalleryMedia(media, galleryFilter), [galleryFilter, media]);
  const exportIsFiltered = galleryFilter.day !== 'all' || galleryFilter.author !== 'all';
  const selectedTourer = tourerFor(selected?.authorId);
  const selectMedia = useCallback((item: GalleryMedia) => {
    setSelected(item);
    setDeleteConfirming(false);
    setDeleteError(null);
  }, []);

  async function deleteSelected() {
    if (!selected) return;
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      setDeleteError(null);
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(mediaUrl(selected.id), { method: 'DELETE' });
      if (response.status === 401) {
        setUnlocked(false);
        setSelected(null);
        return;
      }
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(result.message || 'This memory could not be deleted.');
      }
      const deletedName = selected.caption || selected.originalName;
      setMedia((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      setDeleteConfirming(false);
      setGalleryNotice(`${deletedName} was deleted from Cheese Saver.`);
      resetDownloadPreparation();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'This memory could not be deleted.');
    } finally {
      setDeleting(false);
    }
  }

  async function downloadZip() {
    zipAbortController.current?.abort();
    const controller = new AbortController();
    zipAbortController.current = controller;
    setPreparingZip(true);
    setDownloadError(null);
    setDownloadNotice(null);
    try {
      const search = galleryFilterSearchParams(galleryFilter).toString();
      const downloadUrl = `/api/cheese-saver/download${search ? `?${search}` : ''}`;
      const response = await fetch(downloadUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 401) {
        setUnlocked(false);
        resetDownloadPreparation();
        return;
      }
      if (!response.ok) {
        const message = response.status === 413
          ? exportIsFiltered
            ? 'The filtered selection is too large for one ZIP file.'
            : 'The full gallery is too large for one ZIP file.'
          : response.status === 429
            ? 'Too many ZIP downloads. Try again later.'
            : 'The ZIP file could not be prepared.';
        throw new Error(message);
      }
      if (controller.signal.aborted) return;
      setDownloadNotice(`Your ${exportIsFiltered ? 'filtered ' : ''}ZIP download is starting.`);
      window.location.assign(downloadUrl);
    } catch (error) {
      if (controller.signal.aborted) return;
      setDownloadError(error instanceof Error ? error.message : 'The ZIP file could not be prepared.');
    } finally {
      if (zipAbortController.current === controller) {
        zipAbortController.current = null;
        setPreparingZip(false);
      }
    }
  }

  async function preparePhotoLibraryShare() {
    shareAbortController.current?.abort();
    shareAbortController.current = null;
    setDownloadError(null);
    setDownloadNotice(null);
    if (!navigator.share || !navigator.canShare) {
      setDownloadError('This browser cannot send files to the Photos share sheet. Download the ZIP instead.');
      return;
    }
    const totalBytes = exportMedia.reduce((total, item) => total + item.byteSize, 0);
    if (totalBytes > maximumPhotoShareBytes) {
      setDownloadError(`This ${exportIsFiltered ? 'filtered selection' : 'gallery'} is ${formatBytes(totalBytes)}, which is too large to prepare safely on an iPhone. Download the ZIP instead.`);
      return;
    }

    const controller = new AbortController();
    shareAbortController.current = controller;
    setShareState('preparing');
    setShareProgress(0);
    const files: File[] = [];
    try {
      for (const [index, item] of exportMedia.entries()) {
        const response = await fetch(mediaUrl(item.id), { cache: 'no-store', signal: controller.signal });
        if (response.status === 401) {
          setUnlocked(false);
          controller.abort();
          return;
        }
        if (!response.ok) throw new Error(`Could not prepare ${item.originalName}.`);
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const modifiedAt = new Date(item.capturedAt || item.uploadedAt).valueOf();
        files.push(new File([blob], item.originalName.replace(/[\\/]/g, '_'), {
          type: item.contentType,
          lastModified: Number.isNaN(modifiedAt) ? Date.now() : modifiedAt,
        }));
        setShareProgress(index + 1);
      }
      if (controller.signal.aborted) return;
      if (!navigator.canShare({ files })) throw new Error('This browser cannot share this combination of photos and videos. Download the ZIP instead.');
      preparedShareFiles.current = files;
      setShareState('ready');
      setDownloadNotice(`${files.length} ${files.length === 1 ? 'item is' : 'items are'} ready. Tap “Open share sheet”, then choose “Save to Photos”.`);
    } catch (error) {
      if (controller.signal.aborted) return;
      preparedShareFiles.current = [];
      setShareState('idle');
      setDownloadError(error instanceof Error ? error.message : 'The gallery could not be prepared for Photos.');
    } finally {
      if (shareAbortController.current === controller) shareAbortController.current = null;
    }
  }

  async function openPhotoLibraryShare() {
    const files = preparedShareFiles.current;
    if (!files.length) return;
    setShareState('sharing');
    setDownloadError(null);
    try {
      await navigator.share({ files });
      preparedShareFiles.current = [];
      setShareState('idle');
      setDownloadNotice('The share sheet finished. Items are in Photos if you chose the save option.');
    } catch (error) {
      setShareState('ready');
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setDownloadError('The share sheet could not open. Try again or download the ZIP.');
      }
    }
  }

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
    setSelected(null);
    setDeleteConfirming(false);
    setDeleteError(null);
    setGalleryFilter(allGalleryFilter);
    resetDownloadPreparation();
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
            <div><p className="eyebrow">The shared cheese vault</p><h1 className="display-title">Tour memories</h1><p className="mt-3 text-sm text-muted-foreground">{media.length} saved · {mappedCount} on the route map{exportIsFiltered ? ` · ${exportMedia.length} selected for export` : ''}</p></div>
            <div className="space-y-3 sm:text-right">
              <div className="flex items-center gap-2 text-xs text-muted-foreground sm:justify-end"><ShieldCheck className="size-4 text-[#396b67]" /> Password session expires after seven days</div>
              <div className="cheese-download-actions">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={!exportMedia.length || preparingZip}
                  className="h-11 rounded-xl bg-white"
                  onClick={() => void downloadZip()}
                >
                  {preparingZip ? <LoaderCircle className="animate-spin" /> : <Archive />}
                  {preparingZip ? 'Preparing ZIP' : exportIsFiltered ? 'Download filtered ZIP' : 'Download ZIP'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={!exportMedia.length || shareState === 'preparing' || shareState === 'sharing'}
                  className="h-11 rounded-xl bg-white"
                  onClick={() => void (shareState === 'ready' ? openPhotoLibraryShare() : preparePhotoLibraryShare())}
                >
                  {shareState === 'preparing' || shareState === 'sharing' ? <LoaderCircle className="animate-spin" /> : shareState === 'ready' ? <Share2 /> : <Camera />}
                  {shareState === 'preparing' ? `Preparing ${shareProgress}/${exportMedia.length}` : shareState === 'sharing' ? 'Opening Photos' : shareState === 'ready' ? 'Open share sheet' : exportIsFiltered ? 'Save filtered to Photos' : 'Save to Photos'}
                </Button>
              </div>
            </div>
          </div>

          {downloadError ? <p className="cheese-error mb-4" role="alert"><CircleAlert className="size-4 shrink-0" />{downloadError}</p> : null}
          {downloadNotice ? <output className="cheese-notice mb-4 block">{downloadNotice}</output> : null}
          {galleryNotice ? <output className="cheese-notice mb-4 block" aria-live="polite">{galleryNotice}</output> : null}

          <Tabs value={view} onValueChange={changeView}>
            <TabsList className="cheese-tabs" aria-label="Cheese Saver views">
              <TabsTrigger value="gallery" className="cheese-tab"><Images /> Gallery</TabsTrigger>
              <TabsTrigger value="map" className="cheese-tab"><MapPinned /> Map</TabsTrigger>
              <TabsTrigger value="upload" className="cheese-tab"><Upload /> Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="gallery" className="mt-6">
              {galleryError ? <p className="cheese-error mb-4"><CircleAlert className="size-4 shrink-0" />{galleryError}</p> : null}
              <GalleryPanel media={media} loading={loadingMedia} filter={galleryFilter} onFilterChange={changeGalleryFilter} onSelect={selectMedia} />
            </TabsContent>
            <TabsContent value="map" className="mt-6"><CheeseSaverMap media={media} onSelect={selectMedia} /></TabsContent>
            <TabsContent value="upload" className="mt-6"><UploadPanel onUploaded={loadMedia} /></TabsContent>
          </Tabs>
        </section>
      ) : null}

      {unlocked ? <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setDeleteConfirming(false); setDeleteError(null); } }}>
        <DialogContent className="cheese-lightbox max-h-[calc(100vh-2rem)] max-w-5xl overflow-auto bg-[#0e2321] p-3 text-white sm:p-4">
          {selected ? (
            <>
              <DialogHeader className="pr-10">
                <DialogTitle className="text-lg text-white">{selected.caption || selected.originalName}</DialogTitle>
                <DialogDescription className="text-white/55">{formatDate(selected.capturedAt || selected.uploadedAt)}{selectedTourer ? ` · ${selectedTourer.name}` : selected.credit ? ` · ${selected.credit}` : ''}</DialogDescription>
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
                {selectedTourer ? <span className="cheese-lightbox-author"><Image src={assetPath(selectedTourer.portrait)} alt="" width={28} height={28} /> Photo by {selectedTourer.name}</span> : null}
                {selected.latitude !== null ? <span className="flex items-center gap-1"><MapPinned className="size-3.5" /> Saved on the tour map</span> : null}
              </div>
              <div className="cheese-delete-panel">
                {deleteConfirming ? <p><strong>Delete this memory permanently?</strong><span>This removes it from the gallery, map, and downloads.</span></p> : <p><span>Uploaded by mistake?</span></p>}
                <Button type="button" variant="destructive" disabled={deleting} onClick={() => void deleteSelected()} className="border border-red-300/20 bg-red-500/15 text-red-100 hover:bg-red-500/25">
                  {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                  {deleting ? 'Deleting' : deleteConfirming ? 'Confirm delete' : 'Delete memory'}
                </Button>
              </div>
              {deleteError ? <p className="cheese-error" role="alert"><CircleAlert className="size-4 shrink-0" />{deleteError}</p> : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog> : null}
    </main>
  );
}
