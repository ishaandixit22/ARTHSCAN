// Microsoft Clarity: heatmaps and session recordings, on the live site only. A file rather than
// Clarity's inline snippet, because the content security policy allows no inline scripts.
if (location.hostname === "arthscan.me" || location.hostname === "www.arthscan.me") {
  window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
  var tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.clarity.ms/tag/z877n6k3tp";
  document.head.appendChild(tag);
}
