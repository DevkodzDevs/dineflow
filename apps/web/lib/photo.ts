/**
 * A photo from the camera or a file, as a JPEG data URL no wider or taller than `max` px. Phone
 * photos run to 5-10 MB and server actions take 2 MB; a 1600 px JPEG keeps printed text readable
 * for the model at a fraction of the size.
 */
export function photoToDataUrl(file: File, max = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file is not a photo.")); };
    img.src = url;
  });
}
