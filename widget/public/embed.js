(function () {
  const currentScript = document.currentScript;
  if (!currentScript) {
    return;
  }

  const scriptOrigin = (() => {
    try {
      return new URL(currentScript.src, window.location.href).origin;
    } catch {
      return "http://localhost:5001";
    }
  })();

  const widgetOrigin = currentScript.getAttribute("data-discussit-origin") || scriptOrigin;
  const theme = currentScript.getAttribute("data-theme") || "light";
  const url = encodeURIComponent(window.location.href);
  const iframe = document.createElement("iframe");

  iframe.src = widgetOrigin + "/?url=" + url + "&theme=" + encodeURIComponent(theme);
  iframe.title = "DiscussIt comments";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.style.width = "100%";
  iframe.style.minHeight = "320px";
  iframe.style.border = "0";
  iframe.style.borderRadius = "24px";
  iframe.style.overflow = "hidden";
  iframe.style.background = "transparent";

  currentScript.insertAdjacentElement("afterend", iframe);

  window.addEventListener("message", function (event) {
    if (event.origin !== widgetOrigin) {
      return;
    }

    if (!event.data || event.data.type !== "discussit:height") {
      return;
    }

    iframe.style.height = String(event.data.height) + "px";
  });
})();
