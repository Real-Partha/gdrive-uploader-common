import exifr from 'exifr';

/** Returns the photo's "date taken" as YYYY-MM-DD, from EXIF if available, else the file's last-modified date. */
export async function getPhotoDate(file: File): Promise<string> {
  try {
    const data = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] });
    const date: unknown = data?.DateTimeOriginal ?? data?.CreateDate ?? data?.ModifyDate;
    if (date instanceof Date && !isNaN(date.getTime())) {
      return formatDate(date);
    }
  } catch {
    // No/unreadable EXIF (e.g. PNG, screenshots) - fall back below.
  }
  return formatDate(new Date(file.lastModified || Date.now()));
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
