#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const modulePath = require("node:module");
const path = require("node:path");

if (process.env.D42PE_NODE_MODULES) {
  modulePath.Module._nodeModulePaths(process.env.D42PE_NODE_MODULES)
    .reverse()
    .forEach(candidate => module.paths.unshift(candidate));
}

let sharp;
try {
  sharp = require("sharp");
} catch {
  throw new Error("Install sharp or set D42PE_NODE_MODULES to a node_modules directory containing sharp.");
}

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "assets");
const releaseDate = "2026-08-04";
const palette = {
  background: "#07090d",
  surface: "#0d1117",
  surfaceSubtle: "#121720",
  text: "#f5f4ef",
  muted: "#9ca5b2",
  accent: "#586cff",
  focus: "#a9b4ff",
  border: "#252d39"
};

const outputs = [
  {
    file: `assets/d42pe-home-social-preview-${releaseDate}.png`,
    width: 1200,
    height: 630,
    purpose: "Homepage Open Graph and large-summary preview",
    alt: "D42PE — Austin Events — Event Drops, Ticket Links and Updates — d42pe.com"
  },
  {
    file: `assets/d42pe-join-social-preview-${releaseDate}.png`,
    width: 1200,
    height: 630,
    purpose: "Join-page Open Graph and large-summary preview",
    alt: "D42PE — Stay Tapped In — Text Updates and Official Socials — d42pe.com/join"
  },
  {
    file: "assets/d42pe-brand-logo-512.png",
    width: 512,
    height: 512,
    purpose: "Organization logo and PNG favicon fallback"
  },
  {
    file: "apple-touch-icon.png",
    width: 180,
    height: 180,
    purpose: "Apple touch icon"
  }
];

function previewSvg({ domain, variant, descriptor }) {
  const title = variant === "home"
    ? '<text x="96" y="290" class="title home-title">AUSTIN EVENTS</text>'
    : '<text x="96" y="260" class="title">STAY TAPPED</text><text x="96" y="352" class="title">IN</text>';
  const motif = variant === "home"
    ? `
      <rect x="904" y="112" width="200" height="200" fill="${palette.surface}" stroke="${palette.border}"/>
      <g transform="translate(916 124) scale(3.45)">
        <path fill="${palette.accent}" d="M15 13h16c12 0 19 7 19 19s-7 19-19 19H15V13Zm11 10v18h5c6 0 9-3 9-9s-3-9-9-9h-5Z"/>
      </g>
      <rect x="904" y="358" width="200" height="68" fill="${palette.accent}"/>
      <rect x="904" y="446" width="200" height="68" fill="${palette.surface}" stroke="${palette.border}"/>
    `
    : [142, 246, 350].map((top, index) => `
      <rect x="878" y="${top}" width="226" height="88" fill="${index === 0 ? palette.accent : palette.surface}" ${index === 0 ? "" : `stroke="${palette.border}"`}/>
      <rect x="898" y="${top + 22}" width="44" height="44" fill="${index === 0 ? palette.background : palette.surfaceSubtle}" ${index === 0 ? "" : `stroke="${palette.border}"`}/>
      <path d="M960 ${top + 33}H1076M960 ${top + 55}H1036" stroke="${index === 0 ? palette.background : palette.muted}" stroke-width="7"/>
    `).join("");

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img">
      <defs>
        <style>
          .brand { fill: ${palette.text}; font: 900 30px Arial, Helvetica, sans-serif; letter-spacing: 12px; }
          .domain { fill: ${palette.muted}; font: 750 28px Arial, Helvetica, sans-serif; }
          .title { fill: ${palette.text}; font: 900 96px Arial, Helvetica, sans-serif; letter-spacing: -5px; }
          .home-title { font-size: 94px; }
          .descriptor { fill: ${palette.text}; font: 850 31px Arial, Helvetica, sans-serif; letter-spacing: 1.8px; }
        </style>
      </defs>

      <rect width="1200" height="630" fill="${palette.background}"/>
      <rect x="32.5" y="32.5" width="1135" height="565" fill="none" stroke="${palette.border}"/>
      <rect x="72" y="72" width="4" height="486" fill="${palette.accent}"/>
      <text x="96" y="104" class="brand">D42PE</text>
      ${title}
      <text x="96" y="420" class="descriptor">${descriptor}</text>
      <text x="96" y="534" class="domain">${domain}</text>
      ${motif}
    </svg>
  `);
}

async function writePng(input, output, width, height) {
  await sharp(input, { density: 144 })
    .resize(width, height, { fit: "fill" })
    .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
    .toFile(output);
}

async function imageRecord(spec) {
  const absolute = path.join(root, spec.file);
  const data = await fs.readFile(absolute);
  const metadata = await sharp(data).metadata();
  if (metadata.width !== spec.width || metadata.height !== spec.height || metadata.format !== "png") {
    throw new Error(`${spec.file} did not render as ${spec.width}x${spec.height} PNG.`);
  }
  return {
    ...spec,
    mimeType: "image/png",
    bytes: data.length,
    sha256: crypto.createHash("sha256").update(data).digest("hex")
  };
}

async function writeMockup(outputPath, homePath, joinPath) {
  const home = await sharp(homePath).resize(520, 273).png().toBuffer();
  const join = await sharp(joinPath).resize(520, 273).png().toBuffer();
  const frame = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="760" height="900" viewBox="0 0 760 900">
      <rect width="760" height="900" fill="#eef1f6"/>
      <rect x="88" y="54" width="584" height="362" rx="24" fill="#ffffff" stroke="#d9dee8"/>
      <rect x="88" y="484" width="584" height="362" rx="24" fill="#ffffff" stroke="#d9dee8"/>
      <text x="120" y="365" fill="#111827" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700">D42PE | Austin Events, Concerts &amp; Event Drops</text>
      <text x="120" y="395" fill="#667085" font-family="Arial, Helvetica, sans-serif" font-size="16">d42pe.com</text>
      <text x="120" y="795" fill="#111827" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700">Stay Tapped In | D42PE Austin</text>
      <text x="120" y="825" fill="#667085" font-family="Arial, Helvetica, sans-serif" font-size="16">d42pe.com/join</text>
    </svg>
  `);
  await sharp(frame)
    .composite([
      { input: home, left: 120, top: 78 },
      { input: join, left: 120, top: 508 }
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
    .toFile(outputPath);
}

async function main() {
  await fs.mkdir(assets, { recursive: true });

  const homePath = path.join(assets, `d42pe-home-social-preview-${releaseDate}.png`);
  const joinPath = path.join(assets, `d42pe-join-social-preview-${releaseDate}.png`);
  await writePng(previewSvg({
    domain: "d42pe.com",
    variant: "home",
    descriptor: "EVENT DROPS • TICKET LINKS • UPDATES"
  }), homePath, 1200, 630);
  await writePng(previewSvg({
    domain: "d42pe.com/join",
    variant: "join",
    descriptor: "TEXT UPDATES • OFFICIAL SOCIALS"
  }), joinPath, 1200, 630);

  const faviconSvg = await fs.readFile(path.join(root, "favicon.svg"));
  await writePng(faviconSvg, path.join(assets, "d42pe-brand-logo-512.png"), 512, 512);
  await writePng(faviconSvg, path.join(root, "apple-touch-icon.png"), 180, 180);

  const records = [];
  for (const output of outputs) records.push(await imageRecord(output));
  const manifest = {
    generatedFor: "D42PE search and shared-link production update",
    releaseDate,
    generator: "tools/generate-brand-assets.cjs",
    provenance: "Deterministic SVG composition using the existing local D42PE palette, system typography and favicon path; no outside media or remote fonts.",
    palette,
    assets: records
  };
  await fs.writeFile(
    path.join(assets, "social-preview-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  const mockupFlag = process.argv.indexOf("--mockup");
  if (mockupFlag !== -1) {
    const mockupPath = process.argv[mockupFlag + 1];
    if (!mockupPath) throw new Error("--mockup requires an output path.");
    await writeMockup(path.resolve(mockupPath), homePath, joinPath);
  }

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
