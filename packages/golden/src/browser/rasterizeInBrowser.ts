/** Rasterizes an SVG with the browser's own engine and returns the PNG as base64. */
export async function rasterizeInBrowser(svg: string, scale = 1): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("2d canvas is not available");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  } finally {
    URL.revokeObjectURL(url);
  }
}
