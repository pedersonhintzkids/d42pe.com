#!/usr/bin/env node

const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const run = promisify(execFile);
const root = path.resolve(__dirname, "..");
const backgroundPath = path.join(root, "assets", "next-up", "concert-background.png");
const outputPath = path.join(root, "assets", "next-up", "d42pe-next-up-story.png");

async function main() {
  await fs.access(backgroundPath);
  const boldFont = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const draw = `
push graphic-context
viewbox 0 0 1080 1920

fill 'rgba(7,9,13,0.42)'
rectangle 0,0 1080,1160
fill 'rgba(7,9,13,0.94)'
rectangle 0,1160 1080,1920
fill 'none'
stroke 'rgba(255,255,255,0.18)'
stroke-width 2
roundrectangle 40,40 1040,1880 34,34

stroke 'none'
fill '#586cff'
circle 98,110 107,110
font '${boldFont}'
fill '#f5f4ef'
font-size 30
text-anchor start
text 126,121 'D42PE'

fill 'rgba(13,17,23,0.84)'
stroke 'rgba(255,255,255,0.38)'
stroke-width 2
roundrectangle 775,84 985,138 27,27
stroke 'none'
fill '#ffffff'
font-size 18
text-anchor middle
text 880,119 'ARTIST INTAKE'

fill '#a9b4ff'
font-size 26
text 540,278 'D42PE NEXT UP'
fill '#f5f4ef'
font-size 112
text 540,400 'AUSTIN'
text 540,500 'ARTIST'
fill '#a9b4ff'
font-size 96
text 540,610 'APPLICATION'

fill '#f5f4ef'
font-size 38
text 540,1288 'Want to perform at a future'
text 540,1338 'D42PE event in Austin?'

fill 'rgba(88,108,255,0.18)'
stroke 'rgba(169,180,255,0.76)'
stroke-width 2
roundrectangle 264,1380 816,1446 33,33
stroke 'none'
fill '#ffffff'
font-size 24
text 540,1424 'EMERGING ARTISTS + DJS'

fill 'rgba(88,108,255,0.32)'
stroke '#a9b4ff'
stroke-width 3
roundrectangle 150,1515 930,1665 34,34
stroke 'none'
fill '#ffffff'
font-size 46
text 540,1608 'APPLY TO PERFORM'

fill '#c3cad6'
font-size 20
text 540,1778 'SUBMIT YOUR BEST CLIP, REAL DRAW + AVAILABILITY'
text 540,1812 'CONCEPT TEST - NO BOOKING OR PAYMENT CONFIRMED'
pop graphic-context
`;

  await run("convert", [
    backgroundPath,
    "-resize", "1080x1920^",
    "-gravity", "center",
    "-extent", "1080x1920",
    "-modulate", "82,48,100",
    "-fill", "#182360",
    "-colorize", "13",
    "-draw", draw,
    "-strip",
    "-colors", "256",
    "-define", "png:color-type=6",
    outputPath,
  ]);
  process.stdout.write(`${outputPath}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
