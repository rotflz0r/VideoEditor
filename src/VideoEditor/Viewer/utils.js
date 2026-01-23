export const getMaxHeightPercent = (el) => {
  const percentValue = getComputedStyle(el).maxHeight;
  return parseInt(percentValue) / 100;
};

/**
 * Decompose matrix
 *
 * Decompose the matrix to get the translateX, translateY, scaleX, scaleY, skewX, skewY, and rotation
 *
 * @param {HTMLElement} el
 * @returns
 */
export function decomposeMatrix(el) {
  function deltaTransformPoint(matrix, point) {
    var dx = point.x * matrix.a + point.y * matrix.c + 0;
    var dy = point.x * matrix.b + point.y * matrix.d + 0;
    return { x: dx, y: dy };
  }
  // @see https://gist.github.com/2052247
  const styles = getComputedStyle(el);
  var matrix = new WebKitCSSMatrix(styles.transform);

  // calculate delta transform point
  var px = deltaTransformPoint(matrix, { x: 0, y: 1 });
  var py = deltaTransformPoint(matrix, { x: 1, y: 0 });

  // calculate skew
  var skewX = (180 / Math.PI) * Math.atan2(px.y, px.x) - 90;
  var skewY = (180 / Math.PI) * Math.atan2(py.y, py.x);

  return {
    translateX: matrix.e,
    translateY: matrix.f,
    scaleX: Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b),
    scaleY: Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d),
    skewX: skewX,
    skewY: skewY,
    rotation: skewX, // rotation is the same as skew x
  };
}

export function getTranslateOrigin(el) {
  const styles = getComputedStyle(el);
  const origin = styles.transformOrigin.replace(/px/g, '').split(' ');
  return origin;
}

export const calcTransformValues = (vidMaxWidth, vidContainer, video, previousBounds) => {
  // get the transform values
  const { scaleX, scaleY, translateX, translateY } = decomposeMatrix(video);
  // calculate the scale difference between the previous and current bounds
  const scaleDiff = vidMaxWidth / previousBounds.width;
  // this method is a holdover from a previous version which
  // attempted to calculate the crop overlay position.
  // May be useful in the future.
  // const [originX, originY] = getTranslateOrigin(video);
  const newScale = scaleX * scaleDiff;
  const vidHeight = vidContainer.getBoundingClientRect().height;
  const widthDiff = vidMaxWidth - previousBounds.width;
  const heightDiff = vidHeight - previousBounds.height;
  const x = translateX + widthDiff / 2;
  const y = translateY + heightDiff / 2;
  return { x, y, scale: newScale };
};

export const calcViewerMaxWidth = (video, maxHeight, maxHeightPercent, aspectRatio) => {
  const container = video.closest('.video-flexbox-container').getBoundingClientRect();
  const maxVideoWidth = video.videoWidth;
  const maxVideoHeight = video.videoHeight;
  const maxContainerWidth = container.width
  const maxContainerHeight = container.height

  if (maxVideoWidth === 0 || maxVideoHeight === 0) {
    return container.width;
  }

  const videoAspectRatio = maxVideoWidth / maxVideoHeight;
  const containerAspectRatio = maxContainerWidth / maxContainerHeight;

  let height;

  if (containerAspectRatio > videoAspectRatio) {
    height = Math.min(maxContainerHeight, maxVideoHeight);
    return height * videoAspectRatio;
  } else {
    return Math.min(maxContainerWidth, maxVideoWidth);
  }
};

export const getComputedWidthAndHeightForElement = (el) => {
  const style = getComputedStyle(el);
  const height =
    parseFloat(style.height) -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom) -
    parseFloat(style.borderTop) -
    parseFloat(style.borderBottom) -
    parseFloat(style.marginTop) -
    parseFloat(style.marginBottom);
  // get vidEditorWrapper width
  const width =
    parseFloat(style.width) -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight) -
    parseFloat(style.borderLeft) -
    parseFloat(style.borderRight) -
    parseFloat(style.marginLeft) -
    parseFloat(style.marginRight);
  return { width, height };
};
