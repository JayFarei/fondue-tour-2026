import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const cheeseMedia = sqliteTable(
  'cheese_media',
  {
    id: text('id').primaryKey(),
    objectKey: text('object_key').notNull().unique(),
    originalName: text('original_name').notNull(),
    mediaKind: text('media_kind', { enum: ['image', 'video'] }).notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: real('duration_seconds'),
    capturedAt: text('captured_at'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    locationSource: text('location_source', { enum: ['embedded', 'device'] }),
    caption: text('caption'),
    credit: text('credit'),
    uploadedAt: text('uploaded_at').notNull(),
  },
  (table) => [
    index('idx_cheese_media_uploaded_at').on(table.uploadedAt),
    index('idx_cheese_media_captured_at').on(table.capturedAt),
  ],
);

export const cheeseRateLimits = sqliteTable(
  'cheese_rate_limits',
  {
    scope: text('scope').notNull(),
    subjectHash: text('subject_hash').notNull(),
    windowStart: integer('window_start').notNull(),
    attempts: integer('attempts').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.subjectHash] }),
    index('idx_cheese_rate_limits_window').on(table.windowStart),
  ],
);
