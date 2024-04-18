const fontStyle = document.getElementById('fontStyle');
const fontFileInput = document.getElementById('fontFileInput');
const baseNameInput = document.getElementById('baseNameInput');
const fontSizeInput = document.getElementById('fontSizeInput');
const charSetTextarea = document.getElementById('charSetTextarea');
const opacityThresholdInput = document.getElementById('opacityThresholdInput');
const displayScaleInput = document.getElementById('displayScaleInput');
const debugCanvas = document.getElementById('debugCanvas');
const fontCanvas = document.getElementById('fontCanvas');
const sampleTextInput = document.getElementById('sampleTextInput');
const sampleTextElement = document.getElementById('sampleTextElement');
const sampleTextCanvas = document.getElementById('sampleTextCanvas');

const input = {
    fontDataBytes: null,
    baseName: '',
    fontSize: 24,
    opacityThreshold: 128,
    charSet: Array.from(' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~'),
}

const fontData = {
    charSet: [],
    widths: [],
    offsetX: 0,
    tracking: 0,
    cellSizeX: 0,
    cellSizeY: 0,
    kerning: {},
};

// The arbitrary `font-family` value we use for the loaded font.
const FONT_FAMILY = 'pdfontconv';

// Returns the `font-family` for rendering, or a fallback.
function getFontFamily() {
    return input.fontDataBytes ? FONT_FAMILY : 'serif';
}

// Updates the `input` global from input elements.
function updateInputFromFields() {
    input.baseName = baseNameInput.value;
    input.fontSize = fontSizeInput.value;
    input.opacityThreshold = opacityThresholdInput.value;

    const chars = Array.from(charSetTextarea.value);
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

// Encodes an `Uint8Array` as a base64 string.
function encodeBase64(array) {
    const bytesAsChars = [];
    for (let i = 0; i < array.length; i++) {
        bytesAsChars.push(String.fromCharCode(array[i]));
    }
    const bytesAsString = bytesAsChars.join('');
    return btoa(bytesAsString);
}

// Decodes a base64 string into an `Uint8Array`.
function decodeBase64(string) {
    const bytesAsString = atob(string);
    const length = bytesAsString.length;
    const array = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        array[i] = bytesAsString.charCodeAt(i);
    }
    return array;
}

// Saves the `input` global into local storage.
function saveInput() {
    localStorage.setItem('pdfontconvInput', JSON.stringify({
        ...input,
        fontDataBytes: input.fontDataBytes ? encodeBase64(input.fontDataBytes) : null,
    }));
}

// Loads the `input` global from local storage. Returns `true` if succesful.
function loadInput() {
    let loaded;
    try {
        loaded = JSON.parse(localStorage.getItem('pdfontconvInput'));
        if (loaded.fontDataBytes) {
            loaded.fontDataBytes = decodeBase64(loaded.fontDataBytes);
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
    baseNameInput.value = input.baseName;
    fontSizeInput.value = input.fontSize;
    opacityThresholdInput.value = input.opacityThreshold;
    charSetTextarea.value = input.charSet.join('');
}

// Updates `input.fontDataBytes`.
async function updateFontDataBytesFromInput() {
    const blob = fontFileInput.files[0];
    if (!blob) {
        return;
    }
    const arrayBuffer = await blob.arrayBuffer();
    input.fontDataBytes = new Uint8Array(arrayBuffer);
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

// Removes any leading path from a file name.
// https://html.spec.whatwg.org/multipage/input.html#fakepath-srsly
function extractFilename(path) {
    const slashIndex = path.lastIndexOf('/');
    if (slashIndex >= 0) {
        path = path.substr(slashIndex + 1);
    }
    const backslashIndex = path.lastIndexOf('\\');
    if (backslashIndex >= 0) {
        path = path.substr(backslashIndex + 1);
    }
    return path;
}

// Removes everything from the last '.' onwards.
function stripExtension(fileName) {
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex >= 0) {
        return fileName.substr(0, dotIndex);
    } else {
        return fileName;
    }
}

// Resets the base name input to the name of the current font file.
function updateFontBaseNameFromInput() {
    const baseName = stripExtension(extractFilename(fontFileInput.value));
    input.baseName = baseName;
    baseNameInput.value = baseName;
}

// Loads the `FontFace` from the array buffer and tells the browser about it.
async function createFontFace() {
    if (!input.fontDataBytes) {
        return;
    }
    const arrayBuffer = input.fontDataBytes.buffer;
    const descriptors = {
        // style: 'italic',
        // weight: '400',
    };
    const fontFace = new FontFace(FONT_FAMILY, arrayBuffer, descriptors);
    try {
        await fontFace.load();
    } catch (ex) {
        alert(`Failed to load font. Is it a valid TTF, OTF, WOFF or WOFF2 file?\n\n${ex}`);
    }

    document.fonts.clear(); // Only clears fonts that were added through JavaScript.
    document.fonts.add(fontFace);
    console.log('Added font face:', fontFace);
}

// Queries character set for the index of the given character.
// Returns -1 if not found.
function getCharIndex(char) {
    for (let i = 0; i < fontData.charSet.length; i++) {
        if (fontData.charSet[i] == char) {
            return i;
        }
    }
    return -1;
}

// Renders the font image to the canvas and writes font data to the `fontData` global.
function convertFont() {
    let context = fontCanvas.getContext('2d', { willReadFrequently: true });
    context.font = getCssFont();

    const charSet = input.charSet;
    const measures = charSet.map((char) => {
        const measures = context.measureText(char);
        return {
            advance: Math.round(measures.width),
            left: Math.ceil(measures.actualBoundingBoxLeft),
            right: Math.ceil(measures.actualBoundingBoxRight),
            ascent: Math.ceil(measures.actualBoundingBoxAscent),
            descent: Math.ceil(measures.actualBoundingBoxDescent),
        };
    });
    const maxAdvance = Math.max(...measures.map(m => m.advance));
    const maxLeft = Math.max(...measures.map(m => m.left));
    const maxRight = Math.max(...measures.map(m => m.right));
    const maxAscent = Math.max(...measures.map(m => m.ascent));
    const maxDescent = Math.max(...measures.map(m => m.descent));
    // Sometimes, characters stick out to the left of the reference point.
    // For example, J and ] might do this, especially in cursive fonts.
    // We allow for this by offsetting all characters to the right, and
    // setting a negative tracking so that character spacing isn't affected.
    const offsetX = Math.max(maxLeft, 0);
    const offsetY = maxAscent;
    let tracking = -offsetX;
    // Sometimes, characters stick out to the right of their x-advance ("width").
    // For example, T and [ might do this, especially in cursive fonts.
    // We allow for this by making all characters character even wider,
    // and making tracking even more negative to compensate.
    const overflow = Math.max(0, ...measures.map(m => offsetX + m.right - m.advance + tracking));
    tracking -= overflow;
    const widths = measures.map(m => m.advance - tracking);
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
    context = fontCanvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.font = getCssFont();

    // Also resize the debug canvas.
    debugCanvas.width = canvasWidth;
    debugCanvas.height = canvasHeight;
    debugContext = debugCanvas.getContext('2d');
    debugContext.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw all characters.
    for (let row = 0; row < numCellsY; row++) {
        for (let col = 0; col < numCellsX; col++) {
            const cellX = col * cellSizeX;
            const cellY = row * cellSizeY;
            debugContext.fillStyle = (row + col) % 2 == 0 ? '#ddd' : '#eee';
            debugContext.fillRect(cellX, cellY, cellSizeX, cellSizeY);
            const i = row * numCellsX + col;
            if (i < numChars) {
                const measure = measures[i];
                context.fillText(charSet[i], cellX + offsetX, cellY + offsetY);
                debugContext.fillStyle = `rgba(0, 0, 255, 0.08)`;
                debugContext.fillRect(
                    cellX, cellY,
                    -tracking, cellSizeY,
                );
                debugContext.fillStyle = `rgba(0, 255, 0, 0.1)`;
                debugContext.fillRect(
                    cellX - tracking, cellY,
                    widths[i] + tracking, cellSizeY,
                );
                debugContext.fillStyle = `rgba(255, 0, 0, 0.2)`;
                debugContext.fillRect(
                    cellX + offsetX - measure.left,
                    cellY + offsetY - measure.ascent,
                    measure.left + measure.right,
                    measure.ascent + measure.descent,
                );
            }
        }
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

    // Set canvas display size.
    const displayScale = getDisplayScale();
    fontCanvas.style.setProperty('width', `${Math.floor(canvasWidth * displayScale)}px`);
    fontCanvas.style.setProperty('height', `${Math.floor(canvasHeight * displayScale)}px`);
    debugCanvas.style.setProperty('width', `${Math.floor(canvasWidth * displayScale)}px`);
    debugCanvas.style.setProperty('height', `${Math.floor(canvasHeight * displayScale)}px`);

    // Infer kerning table.
    fontData.kerning = computeKerning(context, charSet);

    // Update fontData.
    fontData.charSet = charSet;
    fontData.widths = widths;
    fontData.offsetX = offsetX;
    fontData.tracking = tracking;
    fontData.cellSizeX = cellSizeX;
    fontData.cellSizeY = cellSizeY;
}

// Computes the kerning table and returns it as an object,
// which maps two-character strings to an integer.
function computeKerning(context, charSet) {
    // The browser doesn't offer a way to access kerning data directly.
    // But we can brute-force it! This is obviously an O(n²) algorithm,
    // so let's hope it's fast enough. If not, we'll need to parse the font file...
    const kerning = {};
    for (const left of charSet) {
        const leftWidth = context.measureText(left).width;
        for (const right of charSet) {
            const pair = left + right;
            const rightWidth = context.measureText(right).width;
            const pairWidth = context.measureText(pair).width;
            const kern = Math.round(pairWidth - leftWidth - rightWidth);
            if (kern != 0) {
                kerning[pair] = kern;
            }
        }
    }
    return kerning;
}

// Returns the font's PNG data as an Uint8Array.
function generatePng() {
    const dataBase64 = fontCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    return decodeBase64(dataBase64);
}

// Returns the `.fnt` file contents as an Uint8Array. Description of the file format:
// https://github.com/cranksters/playdate-reverse-engineering/blob/main/formats/fnt.md
function generateFnt() {
    const lines = [];
    lines.push('-- Generated using pdfontconf: https://pdfontconf.frozenfractal.com');
    lines.push(`tracking=${fontData.tracking}`);
    for (let i = 0; i < fontData.charSet.length; i++) {
        let char = fontData.charSet[i];
        if (char == ' ') {
            char = 'space';
        }
        const width = fontData.widths[i];
        lines.push(`${char} ${width}`);
    }
    for (const pair in fontData.kerning) {
        const kern = fontData.kerning[pair];
        lines.push(`${pair} ${kern}`);
    }
    return new TextEncoder().encode(lines.join('\n'));
}

// Triggers a download of the given data with the given file name and MIME type.
function downloadFile(fileName, mimeType, data) {
    const a = document.createElement('a');
    console.log(data);
    a.href = `data:${mimeType};base64,${encodeBase64(data)}`;
    console.log(a.href);
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Renders the sample text both to the browser element and to the canvas
// The latter mimics the PlayDate's very simple layout algorithm.
function renderSampleText() {
    const sampleText = sampleTextInput.value;
    const sampleTextChars = Array.from(sampleText);
    const displayScale = getDisplayScale();

    // Set browser-rendered version.
    sampleTextElement.innerText = sampleText;
    sampleTextElement.style.fontFamily = getFontFamily();
    sampleTextElement.style.fontSize = `${input.fontSize * displayScale}px`;
    sampleTextElement.style.left = `${fontData.offsetX * displayScale}px`;

    // Set canvas size.
    let canvasWidth = -fontData.tracking;
    for (const char of sampleTextChars) {
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
    let prevChar = '';
    for (const char of sampleTextChars) {
        const charIndex = getCharIndex(char);
        if (charIndex < 0) {
            continue;
        }
        const cellX = (charIndex % numCellsX) * cellSizeX;
        const cellY = Math.floor(charIndex / numCellsX) * cellSizeY;
        const charWidth = fontData.widths[charIndex];
        const charHeight = fontData.cellSizeY;
        x += prevChar ? fontData.kerning[prevChar + char] || 0 : 0;
        sampleContext.drawImage(
            fontCanvas,
            cellX, cellY, charWidth, charHeight,
            x, y, charWidth, charHeight);
        x += charWidth + fontData.tracking;
        prevChar = char;
    }

    // Set display scale.
    sampleTextCanvas.style.width = `${Math.floor(canvasWidth * displayScale)}px`;
    sampleTextCanvas.style.height = `${Math.floor(canvasHeight * displayScale)}px`;
}

function downloadFnt() {
    downloadFile(`${input.baseName}.fnt`, 'text/plain;charset=UTF-8', generateFnt());
}

function downloadPng() {
    downloadFile(`${input.baseName}-table-${fontData.cellSizeX}-${fontData.cellSizeY}.png`, 'image/png', generatePng());
}

async function init() {
    if (loadInput()) {
        await createFontFace();
    } else {
        saveInput();
    }
    updateFieldsFromInput();
    updateOutput();

    fontFileInput.addEventListener('change', async function() {
        updateFontDataBytesFromInput();
        updateFontBaseNameFromInput();
        await createFontFace();
        convertFont();
        renderSampleText();
        saveInput();
    });

    baseNameInput.addEventListener('change', function() {
        updateInputFromFields();
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

    downloadFntButton.addEventListener('click', function(e) {
        e.preventDefault();
        downloadFnt();
    });
    downloadPngButton.addEventListener('click', function(e) {
        e.preventDefault();
        downloadPng();
    });
}

function updateOutput() {
    convertFont();
    renderSampleText();
}

init();
