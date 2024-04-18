const fontFamilyInput = document.getElementById('fontFamilyInput');
const fontSizeInput = document.getElementById('fontSizeInput');
const charSetTextarea = document.getElementById('charSetTextarea');
const opacityThresholdInput = document.getElementById('opacityThresholdInput');
const displayScaleInput = document.getElementById('displayScaleInput');
const fontCanvas = document.getElementById('fontCanvas');
const sampleTextInput = document.getElementById('sampleTextInput');
const sampleTextElement = document.getElementById('sampleTextElement');
const sampleTextCanvas = document.getElementById('sampleTextCanvas');

charSetTextarea.value = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

fontData = {
    charSet: [],
    widths: [],
    tracking: 0,
    cellSizeX: 0,
    cellSizeY: 0,
};

// Returns the CSS font-family.
function getFontFamily() {
    return fontFamilyInput.value;
}

// Returns the selected font size in pixels.
function getFontSize() {
    return fontSizeInput.value;
}

// Returns the CSS `font` property to use for rendering.
function getCssFont() {
    return `${getFontSize()}px ${getFontFamily()}`;
}

// Returns a sorted array of unique characters, excluding unprintable characters.
function getCharSet() {
    const chars = charSetTextarea.value.split('');
    chars.sort();
    for (let i = 1; i < chars.length;) {
        if (chars[i] == chars[i - 1] ||
            chars[i].charCodeAt(0) < 32
        ) {
            chars.splice(i, 1);
        } else {
            i++;
        }
    }
    return chars;
}

// Returns the alpha threshold from which pixels are rendered as opaque.
function getOpacityThreshold() {
    return opacityThresholdInput.value;
}

// Returns the scale at which canvases should be displayed.
function getDisplayScale() {
    return displayScaleInput.value / window.devicePixelRatio;
}

// Renders the font image to the canvas and writes font data to the `fontData` global.
function updateFont() {
    let context = fontCanvas.getContext('2d');
    context.font = getCssFont();

    const charSet = getCharSet();
    const measures = charSet.map((char) => context.measureText(char));
    const maxAdvance = Math.ceil(Math.max(...measures.map(m => m.width)));
    const maxLeft = Math.ceil(Math.max(...measures.map(m => m.actualBoundingBoxLeft)));
    const maxRight = Math.ceil(Math.max(...measures.map(m => m.actualBoundingBoxRight)));
    const maxAscent = Math.ceil(Math.max(...measures.map(m => m.actualBoundingBoxAscent)));
    const maxDescent = Math.ceil(Math.max(...measures.map(m => m.actualBoundingBoxDescent)));
    console.log([
        'Font metrics:',
        `    Max advance: ${maxAdvance}`,
        `    Max left: ${maxLeft}`,
        `    Max right: ${maxRight}`,
        `    Max ascent: ${maxAscent}`,
        `    Max descent: ${maxDescent}`,
    ].join('\n'));

    const numChars = charSet.length;
    const numCellsX = Math.ceil(Math.sqrt(numChars));
    const numCellsY = Math.ceil(numChars / numCellsX);
    const cellSizeX = maxAdvance + maxLeft;
    const cellSizeY = maxAscent + maxDescent;
    const canvasWidth = numCellsX * cellSizeX;
    const canvasHeight = numCellsY * cellSizeY;

    // Changing the canvas size resets the context.
    fontCanvas.width = canvasWidth;
    fontCanvas.height = canvasHeight;
    context = fontCanvas.getContext('2d');
    context.font = getCssFont();

    // Draw all characters.
    for (let i = 0; i < numChars; i++) {
        const cellX = (i % numCellsX) * cellSizeX;
        const cellY = Math.floor(i / numCellsX) * cellSizeY;
        context.fillText(charSet[i], cellX, cellY + maxAscent);
    }

    // Convert partial alpha to either opaque or transparent.
    const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    const opacityThreshold = getOpacityThreshold();
    for (let i = 0; i < data.length; i += 4) {
        data[i + 0] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = data[i + 3] < opacityThreshold ? 0 : 255;
    }
    context.putImageData(imageData, 0, 0);

    // Make checkerboard match cells.
    fontCanvas.style.setProperty('--cell-size-x', `${100 / numCellsX}%`);
    fontCanvas.style.setProperty('--cell-size-y', `${100 / numCellsY}%`);

    // Set canvas display size.
    const displayScale = getDisplayScale();
    fontCanvas.style.setProperty('width', `${Math.floor(canvasWidth * displayScale)}px`);
    fontCanvas.style.setProperty('height', `${Math.floor(canvasHeight * displayScale)}px`);

    // Update fontData.
    fontData.charSet = charSet;
    fontData.widths = measures.map(m => Math.round(m.width));
    fontData.tracking = 0;
    fontData.cellSizeX = cellSizeX;
    fontData.cellSizeY = cellSizeY;
}

function getCharIndex(char) {
    for (let i = 0; i < fontData.charSet.length; i++) {
        if (fontData.charSet[i] == char) {
            return i;
        }
    }
    return -1;
}

function renderSampleText() {
    const sampleText = sampleTextInput.value;
    const displayScale = getDisplayScale();

    // Set browser-rendered version.
    sampleTextElement.innerText = sampleText;
    sampleTextElement.style.fontFamily = getFontFamily();
    sampleTextElement.style.fontSize = `${getFontSize() * displayScale}px`;

    // Set canvas size.
    let canvasWidth = -fontData.tracking;
    for (const char of sampleText.split('')) {
        const charIndex = getCharIndex(char);
        if (charIndex < 0) {
            continue;
        }
        charWidth = fontData.widths[charIndex];
        canvasWidth += charWidth + fontData.tracking;
    }
    const canvasHeight = fontData.cellSizeY;
    sampleTextCanvas.width = canvasWidth;
    sampleTextCanvas.height = canvasHeight;

    // Clear the canvas.
    const sampleContext = sampleTextCanvas.getContext('2d');
    sampleContext.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw the text.
    const cellSizeX = fontData.cellSizeX;
    const cellSizeY = fontData.cellSizeY;
    const numCellsX = fontCanvas.width / cellSizeX;
    let x = -fontData.tracking;
    const y = 0;
    for (const char of sampleText.split('')) {
        const charIndex = getCharIndex(char);
        if (charIndex < 0) {
            continue;
        }
        const cellX = (charIndex % numCellsX) * cellSizeX;
        const cellY = Math.floor(charIndex / numCellsX) * cellSizeY;
        const charWidth = fontData.widths[charIndex];
        const charHeight = fontData.cellSizeY;
        sampleContext.drawImage(
            fontCanvas,
            cellX, cellY, charWidth, charHeight,
            x, y, charWidth, charHeight);
        x += charWidth + fontData.tracking;
    }

    // Set display scale.
    sampleTextCanvas.style.width = `${Math.floor(canvasWidth * displayScale)}px`;
    sampleTextCanvas.style.height = `${Math.floor(canvasHeight * displayScale)}px`;
}

function update() {
    updateFont();
    renderSampleText();
}

update();

for (const element of [
    fontFamilyInput,
    fontSizeInput,
    charSetTextarea,
    displayScaleInput,
    opacityThresholdInput,
]) {
    element.addEventListener('change', function() { update(); });
}

sampleTextInput.addEventListener('change', function() { renderSampleText(); });
