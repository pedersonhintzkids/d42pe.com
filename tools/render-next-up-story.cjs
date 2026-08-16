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

fill 'rgba(5,2,7,0.26)'
rectangle 0,0 1080,1160
fill 'rgba(5,2,7,0.86)'
rectangle 0,1160 1080,1920
fill 'none'
stroke 'rgba(255,255,255,0.18)'
stroke-width 2
roundrectangle 40,40 1040,1880 34,34

stroke 'none'
fill '#ff2f7d'
circle 98,110 107,110
font '${boldFont}'
fill '#fff8fb'
font-size 30
text-anchor start
text 126,121 'D42PE'

fill 'rgba(11,7,13,0.68)'
stroke 'rgba(255,255,255,0.38)'
stroke-width 2
roundrectangle 775,84 985,138 27,27
stroke 'none'
fill '#ffffff'
font-size 18
text-anchor middle
text 880,119 'CONCEPT TEST'

fill '#ff9ac3'
font-size 26
text 540,278 'D42PE NEXT UP'
fill '#fff8fb'
font-size 112
text 540,400 'AUSTIN'
text 540,500 'CHOOSES'
fill '#ff9ac3'
font-size 88
text 540,600 'THE NEXT SHOW'

fill '#fff8fb'
font-size 38
text 540,1298 'Which rising-artist night would you'
text 540,1346 'actually consider attending?'

fill 'rgba(255,47,125,0.18)'
stroke 'rgba(255,154,195,0.76)'
stroke-width 2
roundrectangle 353,1380 727,1446 33,33
stroke 'none'
fill '#ffffff'
font-size 27
text 540,1424 'PROPOSED GA - $20'

fill 'rgba(255,47,125,0.30)'
stroke '#ff9ac3'
stroke-width 3
roundrectangle 150,1515 930,1665 34,34
stroke 'none'
fill '#ffffff'
font-size 46
text 540,1608 'VOTE + RESPOND'

fill '#d6c4cd'
font-size 20
text 540,1778 'NO ARTIST, EVENT, DATE, OR VENUE IS CONFIRMED'
text 540,1812 'NO PAYMENT COLLECTED'
pop graphic-context
`;

  await run("convert", [
    backgroundPath,
    "-resize", "1080x1920^",
    "-gravity", "center",
    "-extent", "1080x1920",
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
