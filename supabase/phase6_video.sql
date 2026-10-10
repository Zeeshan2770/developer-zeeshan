-- Phase 6: allow short screen-recording clips (MP4 / WebM) in the media bucket.
-- Run once on a new project (already applied to the current one).
-- App-level limits: images 5 MB, clips 12 MB and 30 seconds. Aim for 1-4 MB per clip.
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml','video/mp4','video/webm'],
       file_size_limit = 12582912
 where id = 'media';
