const fontStyle = document.getElementById('fontStyle');
const fontFileInput = document.getElementById('fontFileInput');
const fontSizeInput = document.getElementById('fontSizeInput');
const charSetTextarea = document.getElementById('charSetTextarea');
const opacityThresholdInput = document.getElementById('opacityThresholdInput');
const displayScaleInput = document.getElementById('displayScaleInput');
const fontCanvas = document.getElementById('fontCanvas');
const sampleTextInput = document.getElementById('sampleTextInput');
const sampleTextElement = document.getElementById('sampleTextElement');
const sampleTextCanvas = document.getElementById('sampleTextCanvas');

const input = {
    fontFile: null,
    fontSize: 24,
    opacityThreshold: 128,
    charSet: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~'.split(''),
}

const fontData = {
    charSet: [],
    widths: [],
    tracking: 0,
    cellSizeX: 0,
    cellSizeY: 0,
};

// The arbitrary `font-family` value we use for the loaded font.
const FONT_FAMILY = 'pdfontconv';

// Returns the `font-family` for rendering, or a fallback.
function getFontFamily() {
    return input.fontFile ? FONT_FAMILY : 'serif';
}

// Updates the `input` global from input elements.
function updateInputFromFields() {
    input.fontSize = fontSizeInput.value;
    input.opacityThreshold = opacityThresholdInput.value;

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
    input.charSet = chars;

    saveInput();
}

// Encodes an ArrayBuffer as a base64 string.
function encodeBase64(arrayBuffer) {
    const bytesAsString = new Uint8Array(arrayBuffer).map(byte => String.fromCharCode(byte)).join('');
    return btoa(bytesAsString);
}

// Decodes a base64 string into an ArrayBuffer.
function decodeBase64(string) {
    const bytesAsString = atob(string);
    const length = bytesAsString.length;
    const buffer = new ArrayBuffer(length);
    const array = new Uint8Array(buffer);
    for (let i = 0; i < length; i++) {
        array[i] = bytesAsString.charCodeAt(i);
    }
    return buffer;
}

// Saves the `input` global into local storage.
function saveInput() {
    localStorage.setItem('pdfontconvInput', JSON.stringify({
        ...input,
        fontFile: input.fontFile ? encodeBase64(input.fontFile) : null,
    }));
}

// Loads the `input` global from local storage. Returns `true` if succesful.
function loadInput() {
    let loaded;
    try {
        loaded = JSON.parse(localStorage.getItem('pdfontconvInput'));
        if (loaded.fontFile) {
            loaded.fontFile = decodeBase64(loaded.fontFile);
        }
    } catch (ex) {
        return false;
    }

    console.log('Loaded input:', loaded);
    Object.assign(input, loaded);

    return true;
}

// Updates input fields from the `input` global.
function updateFieldsFromInput() {
    fontSizeInput.value = input.fontSize;
    opacityThresholdInput.value = input.opacityThreshold;
    charSetTextarea.value = input.charSet.join('');
}

// Returns the CSS `font` property to use for rendering.
function getCssFont() {
    return `${input.fontSize}px ${getFontFamily()}`;
}

// Returns the alpha threshold from which pixels are rendered as opaque.
function getOpacityThreshold() {
    return opacityThresholdInput.value;
}

// Returns the scale at which canvases should be displayed.
function getDisplayScale() {
    return displayScaleInput.value / window.devicePixelRatio;
}

// Loads the font file and sets up a CSS rule for it.
async function loadFont() {
    const blob = fontFileInput.files[0];
    if (!blob) {
        return;
    }
    input.fontFile = await blob.arrayBuffer();
    await createFontFace();
}

// Loads the `FontFace` from the `input` global and tells the browser about it.
async function createFontFace() {
    if (!input.fontFile) {
        return;
    }

    const descriptors = {
        // style: 'italic',
        // weight: '400',
    };
    const fontFace = new FontFace(FONT_FAMILY, input.fontFile, descriptors);
    try {
        await fontFace.load();
    } catch (ex) {
        alert(`Failed to load font. Is it a valid TTF, OTF, WOFF or WOFF2 file?\n\n${ex}`);
    }

    document.fonts.clear(); // Only clears fonts that were added through JavaScript.
    document.fonts.add(fontFace);
}

// Renders the font image to the canvas and writes font data to the `fontData` global.
function convertFont() {
    let context = fontCanvas.getContext('2d');
    context.font = getCssFont();

    const charSet = input.charSet;
    const measures = charSet.map((char) => context.measureText(char));
    const maxAdvance = Math.ceil(Math.max(...measures.map(m => m.width)));
    const maxLeft = Math.ceil(Math.max(...measures.map(m => m.actualBoundingBoxLeft)));
    const maxRight = Math.ceil(Math.max(...measures.map(m => m.actualBoundingBoxRight)));
    const maxAscent = Math.ceil(Math.max(...measures.map(m => m.actualBoundingBoxAscent)));
    const maxDescent = Math.ceil(Math.max(...measures.map(m => m.actualBoundingBoxDescent)));
    const tracking = -maxLeft;
    console.log([
        'Font metrics:',
        `    Max advance: ${maxAdvance}`,
        `    Max left: ${maxLeft}`,
        `    Max right: ${maxRight}`,
        `    Max ascent: ${maxAscent}`,
        `    Max descent: ${maxDescent}`,
        `    Tracking: ${tracking}`,
    ].join('\n'));

    const numChars = charSet.length;
    const numCellsX = Math.ceil(Math.sqrt(numChars));
    const numCellsY = Math.ceil(numChars / numCellsX);
    const cellSizeX = Math.max(maxAdvance + maxLeft, maxLeft + maxRight);
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
        context.fillText(charSet[i], cellX + maxLeft, cellY + maxAscent);
    }

    // Convert partial alpha to either opaque or transparent.
    const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    const opacityThreshold = input.opacityThreshold;
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
    fontData.widths = measures.map(m => Math.round(m.width - tracking));
    fontData.tracking = tracking;
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
    sampleTextElement.style.fontSize = `${input.fontSize * displayScale}px`;

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
    let x = 0;
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

async function init() {
    if (!loadInput()) {
        saveInput();
    } else {
        await loadFont();
    }
    updateFieldsFromInput();
    updateOutput();
}

function updateOutput() {
    convertFont();
    renderSampleText();
}

fontFileInput.addEventListener('change', async function() {
    await loadFont();
    convertFont();
    renderSampleText();
    saveInput();
});

for (const element of [
    fontSizeInput,
    charSetTextarea,
    displayScaleInput,
    opacityThresholdInput,
]) {
    element.addEventListener('change', function() {
        updateInputFromFields();
        convertFont();
        renderSampleText();
        saveInput();
    });
}

sampleTextInput.addEventListener('change', function() {
    renderSampleText();
});

init();
