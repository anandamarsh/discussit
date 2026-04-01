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
  iframe.style.display = "block";
  iframe.style.width = "70%";
  iframe.style.minHeight = "70vh";
  iframe.style.border = "0";
  iframe.style.borderRadius = "24px";
  iframe.style.overflow = "hidden";
  iframe.style.background = "transparent";
  iframe.style.margin = "0 auto";

  currentScript.insertAdjacentElement("afterend", iframe);

  const mobileQuery = window.matchMedia("(max-width: 900px)");

  const applyResponsiveFrameStyles = () => {
    if (mobileQuery.matches) {
      iframe.style.width = "100vw";
      iframe.style.maxWidth = "100vw";
      iframe.style.minHeight = "100vh";
      iframe.style.height = "100vh";
      iframe.style.borderRadius = "0";
      iframe.style.margin = "0";
      iframe.style.position = "relative";
      iframe.style.left = "50%";
      iframe.style.transform = "translateX(-50%)";
      return;
    }

    iframe.style.width = "70%";
    iframe.style.maxWidth = "none";
    iframe.style.minHeight = "70vh";
    iframe.style.height = "";
    iframe.style.borderRadius = "24px";
    iframe.style.margin = "0 auto";
    iframe.style.position = "relative";
    iframe.style.left = "0";
    iframe.style.transform = "none";
  };

  applyResponsiveFrameStyles();
  mobileQuery.addEventListener("change", applyResponsiveFrameStyles);

  window.addEventListener("message", function (event) {
    if (event.origin !== widgetOrigin) {
      return;
    }

    if (!event.data || event.data.type !== "discussit:height") {
      return;
    }

    if (mobileQuery.matches) {
      iframe.style.height = "100vh";
      return;
    }

    iframe.style.height = String(event.data.height) + "px";
  });
})();
