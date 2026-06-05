import PlayHead from './PlayHead/PlayHead.js';
import Controls from './Controls/Controls.js';
import RangeSelector from './RangeSelector/RangeSelector.js';
import InfoBar from '../InfoBar/InfoBar.js';
import Cropper from '../Cropper/Cropper.js';
import Loader from '../Loader/Loader.js';
import Popover from '../Popover/Popover.js';
import context from '../context.js';
import { computeCrop } from './utils.js';
import { createElement } from '../utils.js';
import '../types.js';
import './timeline.css';
class Timeline {
  /**
   *
   * @typedef {Object} constructor
   * @property {HTMLVideoElement} video
   * @property {string} mimeType
   * @property {number} duration
   * @property {number} frameTotalLimit - default is 10
   * @property {Object} crop - the crop ratio
   * @property {limit} limit - the min and max time range of the video editor
   * @property {transformations} transformations
   * @property {Function} onReady
   * @property {Function} [onRangeUpdate]
   * @property {Function} [onRangeLimit] - callback when the range limit is reached
   * @property {Function} [onMarkerDragStart] - callback when the marker drag is started
   * @property {Function} [onMarkerDragEnd] - callback when the marker drag is ended
   *
   * @property {Function} [onTimelineClick] - callback when the timeline is clicked
   * @property {Loader} loader
   *
   * @param {constructor} constructor
   */
  constructor({ onReady }) {
    const {
      mimeType,
      frameTotalLimit,
      crop,
      limit,
      transformations,
      onRangeUpdate,
      onTimelineClick,
      loader,
    } = context.getContext();
    this.video = null;
    this.duration = null;
    this.mimeType = mimeType;
    // video
    this.limit = limit;
    this.crop = crop;
    this.frameTotalLimit = frameTotalLimit || Math.ceil(window.innerWidth * 0.011); // eventually will be timeline width divided by frame width
    this.transformations = transformations;
    this.loader = loader;
    // callbacks
    this.onReady = onReady;
    this.onRangeUpdate = onRangeUpdate;
    this.onTimelineClick = onTimelineClick;
    // this.cropAspectRatio = this.crop.width / this.crop.height;
    this.cropper = null;
    this.timeline = null;
    // bind
    this.toggleCropperOff = this.toggleCropperOff.bind(this);
  }

  /**
   * Initialize the timeline
   *
   * This method is called when the video has been loaded by the Viewer
   * We cannot initialize the timeline's components until we have
   * the necessary information from the video.
   *
   * @param {HTMLVideoElement} video
   */
  init(video) {
    this.video = video;
    this.duration = video.duration;
    if (!isFinite(this.duration)) {
      throw new Error('Video duration is non finite number: ' + this.duration);
    }
    this.frameInterval = this.duration / this.frameTotalLimit;
    this.crop = this.crop || { width: video.videoWidth, height: video.videoHeight };
    this.cropAspectRatio = this.crop.width / this.crop.height;
    // initialize sub components
    // playhead
    this.playHead = new PlayHead({
      className: 'play-head',
      name: 'play',
      anchor: 'left',
      initialIndex: 0,
      isDraggable: false,
    });
    // popover
    this.popover = new Popover({
      title: 'Maximum video length exceeded',
      body: 'Please select a shorter video.',
      variant: 'danger',
    });
    // range selector
    this.rangeSelector = new RangeSelector({
      timeline: this,
      popover: this.popover,
      playHead: this.playHead,
      setVideoTimeIndex: this.setVideoTimeIndex.bind(this),
      initialMarkers: {
        in: this.transformations?.time?.in || 0,
        out: this.transformations?.time?.out || null,
      },
      limit: this.limit,
      onRangeUpdate: this.handleRangeUpdate.bind(this),
    });
    // controls
    this.controls = new Controls({
      rangeSelector: this.rangeSelector,
      onPlayClick: this.handlePlayClick.bind(this),
    });
    // info bar
    this.infoBar = new InfoBar({
      currentIndex: this.transformations?.time?.in,
    });
  }

  async handleToggleCropper(toggle) {
    if (toggle) {
      if (this.cropper) {
        // show cropper
        // hide svg and video
        this.video.style.visibility = 'hidden';
        // update cropper src
        this.getCurrentVideoFrameUrlObject().then((url) => {
          this.cropper.updateSrc(url);
          this.cropper.show();
        });
      } else {
        // initialize cropper
        await this.initCropper(this.transformations?.crop);
        this.cropper.show();
      }
    } else {
      // hide and apply cropper crop
      this.video.style.visibility = 'visible';
      this.applyCrop();
    }
  }

  enable() {
    this.timeline.classList.remove('disabled');
  }

  disable() {
    this.timeline.classList.add('disabled');
  }

  setVideoTimeIndex(timeIndex) {
    this.video.currentTime = timeIndex;
  }

  getTimelineElement() {
    return this.timeline;
  }

  attachTimelineEvents() {
    this.timeline.addEventListener('mouseup', this.handleTimelineMouseUp.bind(this), false);
    this.video.addEventListener('timeupdate', this.timeupdate.bind(this));
    this.video.addEventListener('pause', this.handlePause.bind(this));
    this.video.addEventListener('playing', this.handlePlaying.bind(this));
  }

  timeupdate() {
    /**
     * If cropper is enabled,
     * apply the crop to the video
     */
    requestAnimationFrame(() => {
      if (this.cropper && !this.cropper.hidden) {
        this.video.pause();
        // Potentially we can use this to update the cropper src
        // However, this would be an expensive operation.
        // this.getCurrentVideoFrameUrlObject().then((url) => {
        // this.cropper.updateSrc(url);
        // const img = document.createElement('img');
        // img.src = url;
        // document.body.append(img);
        // });
      }
    });
  }

  handlePlayClick(target) {
    if (this.video.paused) {
      // hide popover if visible
      if (!this.popover.hidden) this.popover.hide();
      this.video.play();
    } else {
      this.video.pause();
      this.video.currentTime = this.video.currentTime + 0.01;
    }
  }

  handleTimelineMouseUp(event) {
    event.preventDefault();
    // If the range selector is being dragged, the mouseup should not fire.
    if (this.rangeSelector.isDragging) {
      this.rangeSelector.isDragging = false;
      return;
    }
    const { offsetX, clientX, layerX, target, currentTarget } = event;
    //  If the range selector is enabled,
    // only allow click/touch inside range
    if (!this.rangeSelector.hidden && !target.closest('.range-selector')) return;
    this.rangeSelector.setCurrentMarker(this.playHead);
    const { left, width } = this.timeline.getBoundingClientRect();
    const mousePos = clientX - left;
    const timeIndex = (mousePos / width) * this.video.duration;
    // if video is playing, keep playhead at position while the mouse is down
    // so that when the mouse is released, the playhead continues to play
    this.setVideoTimeIndex(timeIndex);
    this.video.pause();
    // hide popover
    if (!this.popover.hidden) this.popover.hide();
    // video editor onTimelineClick callback
    if (this.onTimelineClick instanceof Function) {
      this.onTimelineClick(timeIndex);
    }
  }

  handleRangeUpdate(currentIndex, time) {
    // get now and duration
    const now = currentIndex;
    const duration = parseFloat(time.out - time.in);
    // set values
    this.infoBar.setCurrentIndex(now);
    this.infoBar.setDuration(duration);
    // video editor onRangeUpdate callback
    if (this.onRangeUpdate instanceof Function) {
      this.onRangeUpdate(currentIndex, time);
    }
  }

  handlePause(event) {
    // handle pause event
  }

  /**
   *
   * When the currentTime has reached the end of the video,
   * pressing play again should snap the playhead back to 0
   * before animating a smooth playback.
   *
   * @param {*} event
   */
  handlePlaying(event) {
    this.playHead.toggleAnimate(false);
  }

  applyCrop() {
    if (!this.cropper) return;
    this.cropVideo();
    this.cropper.hide();
  }

  /**
   * Get crop
   *
   * @returns {object} - {w,h,x,y,scale}
   */
  getCrop() {
    if (!this.cropper) return {};
    const {
      points,
      points: [aX, aY, bX, bY],
      zoom,
    } = this.cropper.getResult();
    const w = bX - aX;
    const h = bY - aY;
    const x = aX;
    const y = aY;
    return { w, h, x, y, scale: zoom.toFixed(3) };
  }

  getTransformations() {
    const crop = this.getCrop();
    const inMarker = this.rangeSelector.inMarker.getTimeIndex();
    const outMarker = this.rangeSelector.outMarker.getTimeIndex();
    const rotation = context.getContext()?.rotation || 0;
    return { crop, time: { in: inMarker, out: outMarker }, rotation: { degrees: rotation } };
  }

  cropVideo() {
    const rotation = context.getContext()?.rotation || 0;
    const nativeW = this.video.videoWidth;
    const nativeH = this.video.videoHeight;

    // Use getResult() pixel coordinates instead of croppie's CSS transform.
    // This avoids the transformOrigin coordinate-space mismatch between the
    // portrait canvas <img> and the landscape <video> element.
    const { points } = this.cropper.getResult();
    const [px1, py1, px2, py2] = points.map(parseFloat);

    const cropW = px2 - px1;
    if (cropW === 0) return;

    const vidContainer = this.video.closest('.video-container');
    const { width: cW, height: cH } = vidContainer.getBoundingClientRect();

    this.video.style.width = 'auto';
    this.video.style.top = '';
    this.video.style.transformOrigin = '0 0';

    let transform;

    if (rotation === 0) {
      // Points are in landscape canvas space — apply directly.
      const s = cW / cropW;
      const tx = cW / 2 - (px1 + px2) / 2 * s;
      const ty = cH / 2 - (py1 + py2) / 2 * s;
      transform = `translate3d(${tx}px,${ty}px,0) scale(${s})`;

    } else if (rotation === 180) {
      // rotate(180deg) flips both axes — negate the crop-center contribution.
      const s = cW / cropW;
      const tx = cW / 2 + (px1 + px2) / 2 * s;
      const ty = cH / 2 + (py1 + py2) / 2 * s;
      transform = `translate3d(${tx}px,${ty}px,0) scale(${s}) rotate(180deg)`;

    } else if (rotation === 90) {
      // canvas (px,py) → video (vx=py, vy=nativeH-px)
      // v_cx = (py1+py2)/2, v_cy = nativeH-(px1+px2)/2
      // screen = (-vy*s+tx, vx*s+ty) → center at (cW/2, cH/2)
      const s = cW / cropW;
      const vcx = (py1 + py2) / 2;
      const vcy = nativeH - (px1 + px2) / 2;
      const tx = cW / 2 + vcy * s;
      const ty = cH / 2 - vcx * s;
      transform = `translate3d(${tx}px,${ty}px,0) rotate(90deg) scale(${s})`;

    } else { // 270
      // canvas (px,py) → video (vx=nativeW-py, vy=px)
      // v_cx = nativeW-(py1+py2)/2, v_cy = (px1+px2)/2
      // screen = (vy*s+tx, -vx*s+ty) → center at (cW/2, cH/2)
      const s = cW / cropW;
      const vcx = nativeW - (py1 + py2) / 2;
      const vcy = (px1 + px2) / 2;
      const tx = cW / 2 - vcy * s;
      const ty = cH / 2 + vcx * s;
      transform = `translate3d(${tx}px,${ty}px,0) rotate(270deg) scale(${s})`;
    }

    this.video.style.transform = transform;
  }

  getCurrentVideoFrameUrlObject() {
    return new Promise((resolve) => {
      const rotation = context.getContext()?.rotation || 0;
      const isRotated = rotation === 90 || rotation === 270;
      const nativeW = this.video.videoWidth;
      const nativeH = this.video.videoHeight;
      const canvasW = isRotated ? nativeH : nativeW;
      const canvasH = isRotated ? nativeW : nativeH;
      const canvas = createElement('canvas', { properties: { width: canvasW, height: canvasH } });
      const ctx = canvas.getContext('2d');
      if (isRotated) {
        ctx.translate(canvasW / 2, canvasH / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(this.video, -nativeW / 2, -nativeH / 2);
      } else if (rotation === 180) {
        ctx.translate(nativeW / 2, nativeH / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(this.video, -nativeW / 2, -nativeH / 2);
      } else {
        ctx.drawImage(this.video, 0, 0);
      }
      canvas.toBlob(
        (blob) => resolve(window.URL.createObjectURL(blob)),
        'image/jpg',
        100
      );
    });
  }

  /**
   * Render the video frames on the timeline
   *
   * TODO: create a timeline renderer class
   *
   * This method is called when the video has been loaded by the Viewer.
   * It advances through the video, based on the frame interval, and renders
   * the frames on the timeline.
   *
   * the frame interval is calculated by dividing the video duration by the frameTotalLimit
   * in the init method.
   *
   * The frames are rendered on canvas elements, and the canvas elements are
   * appended to the timeline.
   *
   * The timeline is then ready for the user to interact with.
   *
   */
  renderCanvasFrames() {
    let countFrames = 0,
      ratio,
      initialPlay = false;
    // reset video time
    this.video.currentTime = 0;
    // inform the user that the timeline is being prepared
    this.loader.updateMessage('Rendering frames');
    const framesContainer = this.createFramesContainer();
    if (this.video.videoWidth == 0 || this.video.videoHeight == 0) {
      throw new Error('Video has no dimensions');
    }
    // check if the video mime type is supported
    //if the mime type is not supported, do not crop, instead use aspect ratio of original video
    const isSupportedMimeType = this.video.canPlayType(this.mimeType) == 'probably';
    if (!this.cropAspectRatio || !isSupportedMimeType) {
      ratio = this.video.videoWidth / this.video.videoHeight;
    } else {
      ratio = this.cropAspectRatio;
    }
    // handle can play event
    // we define this function in scope so that we can remove it after the first play event
    const handleCanPlay = () => {
      if (initialPlay) return;
      initialPlay = true;
      this.video.currentTime = 0.5;
      this.video.addEventListener('seeked', renderFrameOnSeek);
    };
    // handle seek event
    const renderFrameOnSeek = (event) => {
      const frameContainer = this.createFrame(this.video.currentTime);
      const canvas = frameContainer.querySelector('canvas');
      // set canvas canvas aspect ratio
      const frameHeight = this.getTimelineElement().getBoundingClientRect().height;
      const frameWidth = frameHeight * ratio;
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      canvas.style.width = frameWidth + 'px';
      // keep the canvas style at 100% so the timeline can be responsive
      canvas.style.height = '100%';
      // console.log('frameHeight, Width', frameHeight, frameWidth);
      framesContainer.append(frameContainer);
      const sourceCoordinates = computeCrop(
        this.video.videoWidth,
        this.video.videoHeight,
        this.crop,
        this.cropAspectRatio
      );
      this.drawFrame(canvas, sourceCoordinates, isSupportedMimeType);
      canvas.style.width = '';
      const newFrameIndex = parseInt(countFrames + 1) * this.frameInterval;
      // console.log('newFrameIndex', newFrameIndex, this.video.currentTime);
      if (countFrames < this.frameTotalLimit - 1) {
        this.video.currentTime = newFrameIndex;
      } else {
        this.video.removeEventListener('seeked', renderFrameOnSeek);
        this.video.removeEventListener('canplay', handleCanPlay);
        this.handleTimelineReady();
      }
      countFrames++;
    };

    // attach on seek event
    this.video.addEventListener('canplay', handleCanPlay);
    // add frames container
    this.timeline.append(framesContainer);
  }

  /**
   * Draw video frame onto a canvas
   *
   * @param {HTMLCanvasElement} frame
   * @param {Array<Number>} sourceRect -  source coordinates
   * @param {number} sourceRect.sX - The x-coordinate of the top-left corner of the source rectangle.
   * @param {number} sourceRect.sY - The y-coordinate of the top-left corner of the source rectangle.
   * @param {number} sourceRect.sWidth - The width of the source rectangle.
   * @param {number} sourceRect.sHeight - The height of the source rectangle.
   * @param {Boolean} isSupportedMimeType - is the video mime type supported by the browser.
   * Note: unsupported mime types will not be rendered correctly by draw image, so we cannot
   * perform cropping. Unsupported mime types will be rendered with the original aspect ratio.
   */
  drawFrame(frame, sourceRect, isSupportedMimeType = false) {
    const [sX, sY, sWidth, sHeight] = sourceRect;
    const frameBounds = frame.getBoundingClientRect();
    if (isSupportedMimeType) {
      frame
        .getContext('2d')
        .drawImage(
          this.video,
          sX,
          sY,
          sWidth,
          sHeight,
          0,
          0,
          frameBounds.width,
          frameBounds.height
        );
    } else {
      frame.getContext('2d').drawImage(this.video, 0, 0, frameBounds.width, frameBounds.height);
    }
  }

  /**
   * When the timline frames have been rendered
   * initialize cropper, then fire timelineReady event.
   */
  async handleTimelineReady() {
    await this.initCropper(this.transformations?.crop);
    // initCropper initializes croppie.js, which for reasons
    // not yet understood, takes a few milliseconds to initialize
    // for safety, we wait 50ms before firing the timelineReady event
    setTimeout(() => {
      // we apply the crop even if there has been no crop set
      // to generate the initial crop object
      this.applyCrop();
      if (this.onReady instanceof Function) {
        this.onReady();
      }
      this.timeline.dispatchEvent(new Event('timelineReady'));
    }, 50);

    // set video back to frame 1
    this.video.currentTime = 0;
  }

  /**
   * Initialize the cropper
   *
   * This method is called when the timeline is ready
   *
   * TODO:
   * - separate crop calculation from cropper initialization
   * - improve documentation
   *
   *
   * @param {Object} initialCrop  - the initial crop object
   */
  async initCropper(initialCrop) {
    let points, scale;
    if (initialCrop) {
      const { x, y, w, h } = initialCrop;
      points = [
        parseFloat(x),
        parseFloat(y),
        parseFloat(w) + parseFloat(x),
        parseFloat(h) + parseFloat(y),
      ];
      scale = parseFloat(initialCrop?.scale);
    }
    this.video.style.width = 'auto';
    const src = await this.getCurrentVideoFrameUrlObject().catch((error) => {
      console.error('cropper faied to init', error);
    });
    const vidContainer = document.querySelector('.video-container');
    const cropContainer = vidContainer.querySelector('.crop-container');
    const { width: containerWidth, height: containerHeight } = vidContainer.getBoundingClientRect();
    const rotation = context.getContext()?.rotation || 0;
    const isRotated = rotation === 90 || rotation === 270;
    const effectiveCropAspectRatio = isRotated ? 1 / this.cropAspectRatio : this.cropAspectRatio;
    let [x, y, cropWidth, cropHeight] = computeCrop(
      containerWidth,
      containerHeight,
      this.crop,
      effectiveCropAspectRatio
    );
    // if the crop aspect ratio is the same as the video aspect ratio
    if (cropWidth / cropHeight == this.video.videoWidth / this.video.videoHeight) {
      cropWidth = '100%';
      cropHeight = '100%';
    }
    const viewport = { width: cropWidth, height: cropHeight };
    const boundary = { width: '100%', height: '100%' };
    this.cropper = new Cropper({
      src,
      el: cropContainer,
      viewport,
      boundary,
      points,
      scale,
      onClickOutside: (event) => {
        const { target } = event;
        // only toggle off if the click is not on the crop button
        if (!target.classList.contains('crop-button') && !target.closest('.crop-button')) {
          this.toggleCropperOff();
        }
      },
    });
  }

  toggleCropperOff() {
    const cropButton = document.querySelector('.crop-button');
    if (cropButton.classList.contains('toggled')) {
      cropButton.click();
    }
  }

  resetCrop() {
    if (!this.cropper) return;
    this.cropper.hide();
    this.cropper.destroy();
    this.cropper = null;
  }

  createFramesContainer() {
    const framesContainer = document.createElement('div');
    framesContainer.classList.add('frames-container');
    return framesContainer;
  }
  /**
   * @returns {HTMLElement} - Canvas
   */
  createFrame(timeIndex) {
    const frameWidth = 100 / this.frameTotalLimit;
    const frameContainer = createElement('div', {
      properties: { className: 'frame', id: `frame_${timeIndex}` },
      style: { width: `${frameWidth}%`, height: '100%' },
    });
    const frame = document.createElement('canvas');
    frameContainer.append(frame);
    return frameContainer;
  }

  createTimelineContainer() {
    return createElement('div', { properties: { className: 'timeline-container' } });
  }

  createTimeline() {
    return createElement('div', { properties: { className: 'timeline' } });
  }

  renderTimeline(container) {
    // create timeline container
    const timelineContainer = this.createTimelineContainer();
    // create the timeline element
    this.timeline = this.createTimeline();
    // render sub components
    this.rangeSelector.render(this.timeline);
    this.playHead.render(this.timeline);
    timelineContainer.append(this.timeline);
    container.append(timelineContainer);
    // attach events
    this.attachTimelineEvents();
  }

  render(container) {
    // first render the control buttons sub component
    this.controls.render(container);
    // render the timeline
    this.renderTimeline(container);
    // render canvas frames onto the timeline
    this.renderCanvasFrames();
    // finally, render the info bar
    this.infoBar.render(container);
  }
}

export default Timeline;
