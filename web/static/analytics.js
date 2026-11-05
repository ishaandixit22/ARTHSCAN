// Microsoft Clarity and Cloudflare Web Analytics, on the live site only. A file rather than their
// inline snippets, because the content security policy allows no inline scripts.
//
// Opening any page with ?internal=1 marks this browser as ours, so its visits aren't counted;
// ?internal=0 undoes that. Each browser has to be marked on its own.
(function () {
  if (location.hostname !== "arthscan.me" && location.hostname !== "www.arthscan.me") return;

  var internal = false;
  try {
    var asked = new URLSearchParams(location.search).get("internal");
    if (asked === "1") localStorage.setItem("internal", "1");
    if (asked === "0") localStorage.removeItem("internal");
    internal = localStorage.getItem("internal") === "1";
    if (asked === "0" || asked === "1") {
      history.replaceState(history.state, "", location.pathname + location.hash);
      alert(internal ? "This browser's visits won't be counted." : "This browser's visits will be counted again.");
    }
  } catch (e) {
    // No storage in this browser, so it can't be marked and counts as a normal visitor.
  }
  if (internal) return;

  window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
  // Clarity records the page, which is real work on a phone's main thread, so it waits until the
  // page has finished loading and the browser is idle. Calls made before then are queued above.
  function startClarity() {
    var clarity = document.createElement("script");
    clarity.async = true;
    clarity.src = "https://www.clarity.ms/tag/z877n6k3tp";
    document.head.appendChild(clarity);
  }
  function whenIdle() {
    if (window.requestIdleCallback) requestIdleCallback(startClarity, { timeout: 4000 });
    else setTimeout(startClarity, 1000);
  }
  function afterLoad() { setTimeout(whenIdle, 2500); }
  if (document.readyState === "complete") afterLoad();
  else addEventListener("load", afterLoad, { once: true });

  var beacon = document.createElement("script");
  beacon.defer = true;
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.setAttribute("data-cf-beacon", '{"token":"0469b46d9ab8423ebb6d91d2848b72c7","r":1,"spa":2}');
  document.head.appendChild(beacon);
})();
