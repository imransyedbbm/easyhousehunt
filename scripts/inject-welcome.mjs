// After `vite build`: puts the pre-rendered welcome screen into dist/index.html.
// First-time visitors (no "welcomed" flag, no deep-link params) see it instantly in #welcome-root,
// which the app hydrates in place; everyone else just gets the small boot spinner in #root.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const ssr = resolve("dist-ssr/prerender.js");
const { renderWelcome } = await import(pathToFileURL(ssr).href);
// Same markup React will hydrate; only drop autofocus so the phone keyboard doesn't pop before the app is ready.
const html = renderWelcome().replace(/ autofocus=""/g, "");

const file = resolve("dist/index.html");
let page = readFileSync(file, "utf8");
const marker = '<div id="root">';
if (!page.includes(marker)) throw new Error("inject-welcome: #root not found in dist/index.html");

const pick = `<script>(function(){try{var q=new URLSearchParams(location.search);
var deep=["p","area","list","requirement","segment","open"].some(function(k){return q.has(k)});
if(deep||localStorage.getItem("ehh_welcomed_v1"))return;}catch(e){}
var t=document.getElementById("ehh-welcome"),w=document.getElementById("welcome-root");
if(t&&w){w.appendChild(t.content.cloneNode(true));var b=document.querySelector("#root .boot");if(b)b.style.display="none";}})();</script>`;

page = page.replace("</body>", `<div id="welcome-root"></div>\n<template id="ehh-welcome">${html}</template>\n${pick}\n</body>`);
writeFileSync(file, page);
rmSync(resolve("dist-ssr"), { recursive: true, force: true });
console.log(`inject-welcome: added ${Math.round(html.length / 1024)} KB pre-rendered welcome to dist/index.html`);
