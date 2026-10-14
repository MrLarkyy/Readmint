/** OS/2 fsType bit 1: restricted licence embedding, the font must not be embedded. */
export const FS_TYPE_RESTRICTED = 0x0002;
/** OS/2 fsType bit 9: only bitmaps may be embedded; the outlines of a TTF/OTF must not be. */
export const FS_TYPE_BITMAP_ONLY = 0x0200;

/**
 * Whether the OS/2 fsType lets the outlines be embedded. A font setting the restricted bit together with a
 * more permissive one is still refused: the stricter reading wins.
 */
export function embeddingAllowed(fsType: number): boolean {
  return (fsType & (FS_TYPE_RESTRICTED | FS_TYPE_BITMAP_ONLY)) === 0;
}
