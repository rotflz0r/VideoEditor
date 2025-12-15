export function cloneAllCanvasFrames(original, clone) {
  const originalCanvases = original.querySelectorAll('canvas');
  clone.querySelectorAll('canvas').forEach((newCanvas, index) => {
    const original = originalCanvases[index];
    var context = newCanvas.getContext('2d');

    if (original.width === 0 || original.height === 0) {
      original.width = 400;
      original.height = 200;
    }

    //set dimensions
    newCanvas.width = original.width;
    newCanvas.height = original.height;

    //apply the old canvas to the new one
    context.drawImage(original, 0, 0);
  });
}
